<script setup lang="ts">
/**
 * 市场 › 角色卡 / 世界卡：玩家发布到市场的一类商品，版式同调用日志页，详情在抽屉里看在卖的那一版。
 * 发布即上架，卖家自己也能上架、下架。员工在行尾「⋯」和详情抽屉底栏处置：在售可下架；已下架可上架、删除；
 * 已删除（默认列表不显示）可恢复。已买的照常用。
 * `?itemId=` 进来直接打开那一件（角色卡抽屉里的市场卡号点过来）。
 * 也是用户视角「上架」：传了 `creatorUid` 就只看这个人上架的，不分页面、两类一起列，多一列类别。
 */
import { computed, onMounted, ref, watch, type Component } from 'vue';
import { useRoute } from 'vue-router';
import { MoreFilled, Search } from '@element-plus/icons-vue';

import PageHeader from '@/shared/ui/PageHeader.vue';
import StatusTag from '@/shared/ui/StatusTag.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import FilterBar from '@/shared/ui/FilterBar.vue';
import FillListPageLayout from '@/shared/ui/FillListPageLayout.vue';
import { fail } from '@/shared/api/httpTypes';
import { formatDateTime } from '@/shared/lib/date';
import { dateRangeToEpochMillis } from '@/shared/lib/epoch';

import AccountCell from '../../components/content/AccountCell.vue';
import MarketItemDrawer from '../../components/market/MarketItemDrawer.vue';
import MarketOrdersDialog from '../../components/market/MarketOrdersDialog.vue';
import MarketReviewsDialog from '../../components/market/MarketReviewsDialog.vue';
import { useItemModeration, type ItemAction } from '../../composables/useItemModeration';
import WorldCardColumns from '../../components/market/WorldCardColumns.vue';
import { usePagedList } from '../../composables/usePagedList';
import { initialOf } from '../../model/contentFormat';
import {
  MarketItemKindLabel,
  MarketItemKindTagType,
  MarketItemStateLabel,
  MarketItemStateTone,
  marketItemKindSchema,
  marketItemStateValues,
  type MarketItemKind,
  type MarketItemRow,
  type MarketItemState,
} from '../../model/market.types';
import { formatPrice } from '../../model/marketFormat';
import { parseAccountUid, shortId } from '../../model/meteringFormat';
import { getTavernMarketPort } from '../../services';

const props = defineProps<{ kind?: MarketItemKind; creatorUid?: number }>();

const port = getTavernMarketPort();
const route = useRoute();

/** 列表里标签只露几个，全部在详情里。 */
const TAG_LIMIT = 3;

const title = computed(() => (props.kind ? MarketItemKindLabel[props.kind] : '商品'));

/** 同调用日志页：账户（这里是创作者）一行、业务条件一行、时间一行。上架时间默认不限。 */
const blank = () => ({
  creatorUid: '',
  keyword: '',
  kind: undefined as MarketItemKind | undefined,
  state: undefined as MarketItemState | undefined,
  dateRange: null as [string, string] | null,
});
const filter = ref(blank());

const { items, total, page, pageSize, loading, load, reload } = usePagedList<MarketItemRow>((p) => {
  const f = filter.value;
  const creator = props.creatorUid == null ? parseAccountUid(f.creatorUid) : { ok: true as const, value: props.creatorUid };
  return creator.ok
    ? port.items(
        {
          kind: props.kind ?? f.kind,
          creatorUid: creator.value,
          keyword: f.keyword.trim() || undefined,
          state: f.state,
          ...dateRangeToEpochMillis(f.dateRange),
        },
        p,
      )
    : Promise.resolve(fail({ code: 'validation', message: '创作者 UID 只能是数字' }));
}, filter);

/** 用户视角里创作者是定的，筛选栏不出账户那一行（FilterBar 没绑 account-uid 就不渲染它）。 */
const creatorFilter = computed(() =>
  props.creatorUid == null
    ? { accountUid: filter.value.creatorUid, 'onUpdate:accountUid': (v?: string) => (filter.value.creatorUid = v ?? '') }
    : {},
);

const detailOpen = ref(false);
const detailId = ref<string | null>(null);

const { acting, actions } = useItemModeration(() => void load());

/** 一类卡自己才有的列（世界卡：规模、时间）。 */
const KindColumns: Partial<Record<MarketItemKind, Component>> = { world_card: WorldCardColumns };

function openDetail(itemId: string): void {
  detailId.value = itemId;
  detailOpen.value = true;
}

const reviewsOpen = ref(false);
const ordersOpen = ref(false);
const recordsOf = ref<MarketItemRow | null>(null);

function openReviews(row: MarketItemRow): void {
  recordsOf.value = row;
  reviewsOpen.value = true;
}

function openOrders(row: MarketItemRow): void {
  recordsOf.value = row;
  ordersOpen.value = true;
}

/** 角色卡、世界卡两页是同一个组件，路由切过来时实例复用：换类别就清掉筛选，从第 1 页重拉。 */
watch(
  () => props.kind,
  () => {
    detailOpen.value = false;
    filter.value = blank();
  },
);

onMounted(() => {
  void load();
  if (typeof route.query.itemId === 'string') openDetail(route.query.itemId);
});
</script>

<template>
  <FillListPageLayout :embedded="creatorUid != null">
    <template
      v-if="creatorUid == null"
      #header
    >
      <PageHeader :title="title" />
    </template>

    <template #filters>
      <FilterBar
        v-bind="creatorFilter"
        v-model:date-range="filter.dateRange"
        account-uid-label="创作者 UID"
        date-range-label="上架时间"
        :loading="loading"
        @refresh="reload"
        @reset="filter = blank()"
      >
        <el-form-item
          v-if="!kind"
          label="类别"
        >
          <el-select
            v-model="filter.kind"
            placeholder="全部"
            clearable
            style="width: 120px"
          >
            <el-option
              v-for="k in marketItemKindSchema.options"
              :key="k"
              :label="MarketItemKindLabel[k]"
              :value="k"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="名字 / 标签">
          <el-input
            v-model="filter.keyword"
            :prefix-icon="Search"
            placeholder="模糊匹配名字、简介、标签"
            clearable
            style="width: 300px"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select
            v-model="filter.state"
            placeholder="全部"
            clearable
            style="width: 140px"
          >
            <el-option
              v-for="s in marketItemStateValues"
              :key="s"
              :label="MarketItemStateLabel[s]"
              :value="s"
            />
          </el-select>
        </el-form-item>
      </FilterBar>
    </template>

    <el-table
      v-loading="loading"
      :data="items"
      row-key="itemId"
      size="small"
      class="compact-table"
      height="100%"
      :empty-text="' '"
    >
      <el-table-column
        :label="title"
        min-width="200"
      >
        <template #default="{ row }: { row: MarketItemRow }">
          <div class="cell-item">
            <el-avatar
              :size="32"
              shape="square"
              :src="row.listing.image ?? undefined"
              class="cell-item__avatar"
            >
              {{ initialOf(row.listing.face.name) }}
            </el-avatar>
            <div class="cell-stack">
              <el-button
                link
                type="primary"
                class="cell-title"
                @click="openDetail(row.itemId)"
              >
                {{ row.listing.face.name }}
              </el-button>
              <span class="cell-uid">{{ shortId(row.itemId) }}</span>
            </div>
          </div>
        </template>
      </el-table-column>

      <el-table-column
        v-if="!kind"
        label="类别"
        width="80"
      >
        <template #default="{ row }: { row: MarketItemRow }">
          <el-tag
            size="small"
            effect="plain"
            :type="MarketItemKindTagType[row.listing.kind]"
          >
            {{ MarketItemKindLabel[row.listing.kind] }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column
        v-if="creatorUid == null"
        label="创作者"
        min-width="170"
      >
        <template #default="{ row }: { row: MarketItemRow }">
          <AccountCell :account="row.creator" />
        </template>
      </el-table-column>

      <el-table-column
        label="标签"
        min-width="150"
      >
        <template #default="{ row }: { row: MarketItemRow }">
          <div
            v-if="row.listing.face.tags.length"
            class="cell-tags"
          >
            <el-tag
              v-for="t in row.listing.face.tags.slice(0, TAG_LIMIT)"
              :key="t"
              size="small"
              type="info"
              effect="plain"
            >
              {{ t }}
            </el-tag>
            <span
              v-if="row.listing.face.tags.length > TAG_LIMIT"
              class="cell-muted"
              :title="row.listing.face.tags.join('、')"
            >+{{ row.listing.face.tags.length - TAG_LIMIT }}</span>
          </div>
          <span
            v-else
            class="cell-muted"
          >—</span>
        </template>
      </el-table-column>

      <component
        :is="KindColumns[kind]"
        v-if="kind && KindColumns[kind]"
      />

      <el-table-column
        label="价格"
        width="90"
        align="right"
      >
        <template #default="{ row }: { row: MarketItemRow }">
          <span class="num">{{ formatPrice(row.price) }}</span>
        </template>
      </el-table-column>

      <el-table-column
        label="销量"
        width="72"
        align="right"
      >
        <template #default="{ row }: { row: MarketItemRow }">
          <span class="num">{{ row.stats.purchases }}</span>
        </template>
      </el-table-column>

      <el-table-column
        label="评分"
        width="96"
        align="right"
      >
        <template #default="{ row }: { row: MarketItemRow }">
          <span
            v-if="row.stats.ratingCount > 0"
            class="num"
          >{{ row.stats.rating.toFixed(1) }} <span class="cell-muted">({{ row.stats.ratingCount }})</span></span>
          <span
            v-else
            class="cell-muted"
          >—</span>
        </template>
      </el-table-column>

      <el-table-column
        label="状态"
        width="90"
      >
        <template #default="{ row }: { row: MarketItemRow }">
          <StatusTag
            :label="MarketItemStateLabel[row.state]"
            :tone="MarketItemStateTone[row.state]"
            :title="row.takedown?.reason"
          />
        </template>
      </el-table-column>

      <el-table-column
        label="更新时间"
        width="140"
      >
        <template #default="{ row }: { row: MarketItemRow }">
          <span class="cell-date">{{ formatDateTime(row.updatedAt) }}</span>
        </template>
      </el-table-column>

      <el-table-column
        label="操作"
        width="190"
        fixed="right"
        align="right"
      >
        <template #default="{ row }: { row: MarketItemRow }">
          <div class="ops">
            <el-button
              link
              type="primary"
              size="small"
              @click="openDetail(row.itemId)"
            >
              详情
            </el-button>
            <el-button
              link
              type="primary"
              size="small"
              @click="openReviews(row)"
            >
              评价
            </el-button>
            <el-button
              link
              type="primary"
              size="small"
              @click="openOrders(row)"
            >
              订单
            </el-button>
            <el-dropdown
              trigger="click"
              placement="bottom-end"
              :disabled="acting === row.itemId"
              @command="(action: ItemAction) => action.run(row)"
            >
              <el-button
                link
                type="primary"
                size="small"
                :icon="MoreFilled"
                :loading="acting === row.itemId"
                class="ops__more"
              />
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item
                    v-for="action in actions[row.state]"
                    :key="action.key"
                    :command="action"
                    :divided="action.danger && actions[row.state].length > 1"
                    :class="{ 'market-danger-item': action.danger }"
                  >
                    {{ action.label }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </template>
      </el-table-column>

      <template #empty>
        <EmptyState
          :title="`没有符合条件的${title}`"
          description="调整筛选条件或重置后重试。"
        />
      </template>
    </el-table>

    <template #footer>
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        background
      />
    </template>
  </FillListPageLayout>

  <MarketItemDrawer
    v-model:visible="detailOpen"
    :item-id="detailId"
    @changed="load"
  />

  <MarketReviewsDialog
    v-model:visible="reviewsOpen"
    :item="recordsOf"
  />

  <MarketOrdersDialog
    v-model:visible="ordersOpen"
    :item="recordsOf"
  />
</template>

<style scoped>
.num {
  font-variant-numeric: tabular-nums;
}

.cell-item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.cell-item__avatar {
  flex-shrink: 0;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  background: var(--el-color-primary);
}

.cell-stack {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-width: 0;
  line-height: 1.35;
}

.cell-title {
  max-width: 100%;
  padding: 0;
  height: auto;
  font-size: 13px;
  font-weight: 500;
}

.cell-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.ops {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
}

.ops__more {
  margin-left: 12px;
}

/* 下拉菜单 Teleport 到 body，scoped 命不中。 */
:global(.market-danger-item:not(.is-disabled)) {
  color: var(--el-color-danger);
}
</style>
