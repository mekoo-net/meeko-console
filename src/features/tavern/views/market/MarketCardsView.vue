<script setup lang="ts">
/**
 * 市场 › 商品：玩家发布到市场的卡，版式同调用日志页，详情在抽屉里看（每个版本的人设和世界书都在）。
 * 发布即上架，员工只能事后下架 / 恢复；下架只是停售，已买的照常用手里的版本。
 * `?cardId=` 进来直接打开那张卡（角色卡抽屉里的市场卡号点过来）。
 * 也是用户视角「发布的」：传了 `creatorUid` 就只看这个人发布的，创作者筛选和创作者列都不要。
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { Search } from '@element-plus/icons-vue';

import PageHeader from '@/shared/ui/PageHeader.vue';
import StatusTag from '@/shared/ui/StatusTag.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import FilterBar from '@/shared/ui/FilterBar.vue';
import FillListPageLayout from '@/shared/ui/FillListPageLayout.vue';
import { fail } from '@/shared/api/httpTypes';
import { formatDateTime } from '@/shared/lib/date';

import AccountCell from '../../components/content/AccountCell.vue';
import MarketCardDrawer from '../../components/market/MarketCardDrawer.vue';
import { usePagedList } from '../../composables/usePagedList';
import { initialOf } from '../../model/contentFormat';
import {
  MarketCardStateLabel,
  MarketCardStateTone,
  marketCardStateValues,
  type MarketCardRow,
  type MarketCardState,
} from '../../model/market.types';
import { formatPrice } from '../../model/marketFormat';
import { parseAccountUid, shortId } from '../../model/meteringFormat';
import { getTavernMarketPort } from '../../services';

const props = defineProps<{ creatorUid?: number }>();

const port = getTavernMarketPort();
const route = useRoute();

/** 列表里标签只露几个，全部在详情里。 */
const TAG_LIMIT = 3;

const blank = () => ({ creatorUid: '', keyword: '', state: '' as '' | MarketCardState });
const filter = ref(blank());

const { items, total, page, pageSize, loading, load, reload } = usePagedList<MarketCardRow>((p) => {
  const creator = props.creatorUid == null ? parseAccountUid(filter.value.creatorUid) : { ok: true as const, value: props.creatorUid };
  return creator.ok
    ? port.cards(
        { creatorUid: creator.value, keyword: filter.value.keyword.trim() || undefined, state: filter.value.state || undefined },
        p,
      )
    : Promise.resolve(fail({ code: 'validation', message: '创作者 UID 只能是数字' }));
}, filter);

/** 用户视角里创作者是定的，筛选栏不出账户那一行。 */
const creatorFilter = computed(() =>
  props.creatorUid == null
    ? { accountUid: filter.value.creatorUid, 'onUpdate:accountUid': (v?: string) => (filter.value.creatorUid = v ?? '') }
    : {},
);

const detailOpen = ref(false);
const detailId = ref<string | null>(null);

function openDetail(cardId: string): void {
  detailId.value = cardId;
  detailOpen.value = true;
}

onMounted(() => {
  void load();
  if (typeof route.query.cardId === 'string') openDetail(route.query.cardId);
});
</script>

<template>
  <FillListPageLayout :embedded="creatorUid != null">
    <template
      v-if="creatorUid == null"
      #header
    >
      <PageHeader title="商品" />
    </template>

    <template #filters>
      <FilterBar
        v-bind="creatorFilter"
        :loading="loading"
        @refresh="reload"
        @reset="filter = blank()"
      >
        <el-form-item label="卡名 / 标签">
          <el-input
            v-model="filter.keyword"
            :prefix-icon="Search"
            placeholder="模糊匹配"
            clearable
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select
            v-model="filter.state"
            style="width: 140px"
          >
            <el-option
              label="全部"
              value=""
            />
            <el-option
              v-for="s in marketCardStateValues"
              :key="s"
              :label="MarketCardStateLabel[s]"
              :value="s"
            />
          </el-select>
        </el-form-item>
      </FilterBar>
    </template>

    <el-table
      v-loading="loading"
      :data="items"
      row-key="cardId"
      size="small"
      class="compact-table"
      height="100%"
      :empty-text="' '"
    >
      <el-table-column
        label="卡"
        min-width="200"
      >
        <template #default="{ row }: { row: MarketCardRow }">
          <div class="cell-card">
            <el-avatar
              :size="32"
              shape="square"
              :src="row.face.avatar ?? undefined"
              class="cell-card__avatar"
            >
              {{ initialOf(row.face.name) }}
            </el-avatar>
            <div class="cell-stack">
              <el-button
                link
                type="primary"
                class="cell-title"
                @click="openDetail(row.cardId)"
              >
                {{ row.face.name }}
              </el-button>
              <span class="cell-uid">{{ shortId(row.cardId) }}</span>
            </div>
          </div>
        </template>
      </el-table-column>

      <el-table-column
        v-if="creatorUid == null"
        label="创作者"
        min-width="170"
      >
        <template #default="{ row }: { row: MarketCardRow }">
          <AccountCell :account="row.creator" />
        </template>
      </el-table-column>

      <el-table-column
        label="标签"
        min-width="150"
      >
        <template #default="{ row }: { row: MarketCardRow }">
          <div
            v-if="row.face.tags.length"
            class="cell-tags"
          >
            <el-tag
              v-for="t in row.face.tags.slice(0, TAG_LIMIT)"
              :key="t"
              size="small"
              type="info"
              effect="plain"
            >
              {{ t }}
            </el-tag>
            <span
              v-if="row.face.tags.length > TAG_LIMIT"
              class="cell-muted"
              :title="row.face.tags.join('、')"
            >+{{ row.face.tags.length - TAG_LIMIT }}</span>
          </div>
          <span
            v-else
            class="cell-muted"
          >—</span>
        </template>
      </el-table-column>

      <el-table-column
        label="价格"
        width="90"
        align="right"
      >
        <template #default="{ row }: { row: MarketCardRow }">
          <span class="num">{{ formatPrice(row.price) }}</span>
        </template>
      </el-table-column>

      <el-table-column
        label="版本"
        width="110"
      >
        <template #default="{ row }: { row: MarketCardRow }">
          <span
            v-if="row.version > 0"
            class="num"
          >v{{ row.version }}</span>
          <span
            v-else
            class="cell-muted"
          >—</span>
          <el-tag
            v-if="row.hasDraft && row.version > 0"
            size="small"
            type="warning"
            effect="plain"
            class="tag-gap"
            title="创作者有还没发布的改动"
          >
            改动中
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column
        label="销量"
        width="72"
        align="right"
      >
        <template #default="{ row }: { row: MarketCardRow }">
          <span class="num">{{ row.stats.purchases }}</span>
        </template>
      </el-table-column>

      <el-table-column
        label="评分"
        width="96"
        align="right"
      >
        <template #default="{ row }: { row: MarketCardRow }">
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
        <template #default="{ row }: { row: MarketCardRow }">
          <StatusTag
            :label="MarketCardStateLabel[row.state]"
            :tone="MarketCardStateTone[row.state]"
            :title="row.takedown?.reason"
          />
        </template>
      </el-table-column>

      <el-table-column
        label="更新时间"
        width="140"
      >
        <template #default="{ row }: { row: MarketCardRow }">
          <span class="cell-date">{{ formatDateTime(row.updatedAt) }}</span>
        </template>
      </el-table-column>

      <el-table-column
        label="操作"
        width="64"
        fixed="right"
        align="right"
      >
        <template #default="{ row }: { row: MarketCardRow }">
          <el-button
            link
            type="primary"
            size="small"
            @click="openDetail(row.cardId)"
          >
            详情
          </el-button>
        </template>
      </el-table-column>

      <template #empty>
        <EmptyState
          title="没有符合条件的卡"
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

  <MarketCardDrawer
    v-model:visible="detailOpen"
    :card-id="detailId"
    @changed="load"
  />
</template>

<style scoped>
.num {
  font-variant-numeric: tabular-nums;
}

.tag-gap {
  margin-left: 6px;
}

.cell-card {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.cell-card__avatar {
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
</style>
