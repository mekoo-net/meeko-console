<script setup lang="ts">
/**
 * 市场 › 订单：一单就是一份权益，角色卡和世界书一样买。买家付人民币进平台钱包，卖家的分成按成交时的设置折成积分（行上有快照）。
 * 创作者第一次发布时自己得的那一单（0 元）也在这里。
 * 也是用户视角「购买的」：传了 `buyerUid` 就只看这个人买的，买家筛选和买家列都不要。
 */
import { computed, onMounted, ref } from 'vue';
import { Search } from '@element-plus/icons-vue';

import PageHeader from '@/shared/ui/PageHeader.vue';
import StatusTag from '@/shared/ui/StatusTag.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import FilterBar from '@/shared/ui/FilterBar.vue';
import FillListPageLayout from '@/shared/ui/FillListPageLayout.vue';
import { fail } from '@/shared/api/httpTypes';
import { formatDateTime } from '@/shared/lib/date';
import { dateRangeToEpochMillis } from '@/shared/lib/epoch';

import AccountCell from '../../components/content/AccountCell.vue';
import CopyableId from '../../components/metering/CopyableId.vue';
import { usePagedList } from '../../composables/usePagedList';
import {
  MarketItemKindLabel,
  MarketOrderSourceLabel,
  MarketOrderStatusLabel,
  MarketOrderStatusTone,
  marketItemKindSchema,
  marketOrderSourceSchema,
  type MarketItemKind,
  type MarketOrderRow,
  type MarketOrderSource,
} from '../../model/market.types';
import { formatPercent, formatPrice, itemPage } from '../../model/marketFormat';
import { formatCredits, parseAccountUid, shortId } from '../../model/meteringFormat';
import { getTavernMarketPort } from '../../services';

const props = defineProps<{ buyerUid?: number }>();

const port = getTavernMarketPort();

/** 同调用日志页：账户（这里是买家）一行、业务条件一行、时间一行。下单时间默认不限。 */
const blank = () => ({
  buyerUid: '',
  sellerUid: '',
  itemId: '',
  kind: undefined as MarketItemKind | undefined,
  source: undefined as MarketOrderSource | undefined,
  dateRange: null as [string, string] | null,
});
const filter = ref(blank());

const { items, total, page, pageSize, loading, load, reload } = usePagedList<MarketOrderRow>((p) => {
  const f = filter.value;
  const buyer = props.buyerUid == null ? parseAccountUid(f.buyerUid) : { ok: true as const, value: props.buyerUid };
  const seller = parseAccountUid(f.sellerUid);
  return buyer.ok && seller.ok
    ? port.orders(
        {
          buyerUid: buyer.value,
          sellerUid: seller.value,
          itemId: f.itemId.trim() || undefined,
          kind: f.kind,
          source: f.source,
          ...dateRangeToEpochMillis(f.dateRange),
        },
        p,
      )
    : Promise.resolve(fail({ code: 'validation', message: 'UID 只能是数字' }));
}, filter);

/** 用户视角里买家是定的，筛选栏不出账户那一行。 */
const buyerFilter = computed(() =>
  props.buyerUid == null
    ? { accountUid: filter.value.buyerUid, 'onUpdate:accountUid': (v?: string) => (filter.value.buyerUid = v ?? '') }
    : {},
);

onMounted(() => void load());
</script>

<template>
  <FillListPageLayout :embedded="buyerUid != null">
    <template
      v-if="buyerUid == null"
      #header
    >
      <PageHeader title="订单" />
    </template>

    <template #filters>
      <FilterBar
        v-bind="buyerFilter"
        v-model:date-range="filter.dateRange"
        account-uid-label="买家 UID"
        date-range-label="下单时间"
        :loading="loading"
        @refresh="reload"
        @reset="filter = blank()"
      >
        <el-form-item label="卖家 UID">
          <el-input
            v-model="filter.sellerUid"
            :prefix-icon="Search"
            placeholder="精确匹配"
            clearable
          />
        </el-form-item>
        <el-form-item label="类别">
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
        <el-form-item label="商品 ID">
          <el-input
            v-model="filter.itemId"
            :prefix-icon="Search"
            placeholder="精确匹配"
            clearable
            style="width: 300px"
          />
        </el-form-item>
        <el-form-item label="来源">
          <el-select
            v-model="filter.source"
            placeholder="全部"
            clearable
            style="width: 140px"
          >
            <el-option
              v-for="s in marketOrderSourceSchema.options"
              :key="s"
              :label="MarketOrderSourceLabel[s]"
              :value="s"
            />
          </el-select>
        </el-form-item>
      </FilterBar>
    </template>

    <el-table
      v-loading="loading"
      :data="items"
      row-key="id"
      size="small"
      class="compact-table"
      height="100%"
      :empty-text="' '"
    >
      <el-table-column
        label="时间"
        width="140"
      >
        <template #default="{ row }: { row: MarketOrderRow }">
          <span class="cell-date">{{ formatDateTime(row.createdAt) }}</span>
        </template>
      </el-table-column>

      <el-table-column
        label="订单号"
        width="130"
      >
        <template #default="{ row }: { row: MarketOrderRow }">
          <CopyableId
            :value="row.id"
            :display="shortId(row.id)"
            label="订单号"
          />
        </template>
      </el-table-column>

      <el-table-column
        label="商品"
        min-width="190"
      >
        <template #default="{ row }: { row: MarketOrderRow }">
          <span class="cell-item">
            <el-tag
              size="small"
              effect="plain"
              :type="row.item.kind === 'world_book' ? 'success' : 'primary'"
            >
              {{ MarketItemKindLabel[row.item.kind] }}
            </el-tag>
            <router-link
              :to="{ name: itemPage(row.item.kind), query: { itemId: row.item.id } }"
              class="link"
            >
              {{ row.item.name }}
            </router-link>
          </span>
        </template>
      </el-table-column>

      <el-table-column
        label="来源"
        width="80"
      >
        <template #default="{ row }: { row: MarketOrderRow }">
          {{ MarketOrderSourceLabel[row.source] }}
        </template>
      </el-table-column>

      <el-table-column
        v-if="buyerUid == null"
        label="买家"
        min-width="160"
      >
        <template #default="{ row }: { row: MarketOrderRow }">
          <AccountCell :account="row.buyer" />
        </template>
      </el-table-column>

      <el-table-column
        label="卖家"
        min-width="160"
      >
        <template #default="{ row }: { row: MarketOrderRow }">
          <AccountCell :account="row.seller" />
        </template>
      </el-table-column>

      <el-table-column
        label="价格"
        width="90"
        align="right"
      >
        <template #default="{ row }: { row: MarketOrderRow }">
          <span class="num">{{ formatPrice(row.price) }}</span>
        </template>
      </el-table-column>

      <el-table-column
        label="卖家分成"
        width="130"
        align="right"
      >
        <template #default="{ row }: { row: MarketOrderRow }">
          <span
            v-if="row.settlement"
            class="num"
            :title="`平台抽成 ${formatPercent(row.settlement.commissionRate)}，1 元 = ${row.settlement.creditsPerYuan} 积分`"
          >{{ formatCredits(row.settlement.sellerCredits) }}</span>
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
        <template #default="{ row }: { row: MarketOrderRow }">
          <StatusTag
            :label="MarketOrderStatusLabel[row.status]"
            :tone="MarketOrderStatusTone[row.status]"
            :title="row.failureReason ?? undefined"
          />
        </template>
      </el-table-column>

      <template #empty>
        <EmptyState
          title="没有符合条件的订单"
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
</template>

<style scoped>
.cell-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.num {
  font-variant-numeric: tabular-nums;
}

.link {
  color: var(--el-color-primary);
  text-decoration: none;
}
</style>
