<script setup lang="ts">
/**
 * 商品行「订单」：一件商品（角色卡或世界书）的订单，版式同平台「领取记录」弹窗——上面一行摘要，一行轻筛选，下面定高表格，分页贴右下。
 */
import { computed, ref, watch } from 'vue';
import { Search } from '@element-plus/icons-vue';

import StatusTag from '@/shared/ui/StatusTag.vue';
import { fail } from '@/shared/api/httpTypes';
import { debounce } from '@/shared/lib/debounce';
import { formatDateTime } from '@/shared/lib/date';

import { usePagedList } from '../../composables/usePagedList';
import {
  MarketOrderSourceLabel,
  MarketOrderStatusLabel,
  MarketOrderStatusTone,
  marketOrderSourceSchema,
  type MarketItemRow,
  type MarketOrderRow,
  type MarketOrderSource,
} from '../../model/market.types';
import { formatPercent, formatPrice } from '../../model/marketFormat';
import { formatCredits, parseAccountUid, shortId } from '../../model/meteringFormat';
import { getTavernMarketPort } from '../../services';
import AccountCell from '../content/AccountCell.vue';
import CopyableId from '../metering/CopyableId.vue';

const visible = defineModel<boolean>('visible', { required: true });
const props = defineProps<{ item: MarketItemRow | null }>();

const port = getTavernMarketPort();

// buyerInput：输入框即时值；filter.buyer：防抖后的查询值。
const buyerInput = ref('');
const filter = ref({ buyer: '', source: undefined as MarketOrderSource | undefined });

const { items, total, page, pageSize, loading, load } = usePagedList<MarketOrderRow>((p) => {
  const buyer = parseAccountUid(filter.value.buyer);
  return buyer.ok
    ? port.orders({ itemId: props.item?.itemId, buyerUid: buyer.value, source: filter.value.source }, p)
    : Promise.resolve(fail({ code: 'validation', message: '买家 UID 只能是数字' }));
}, filter);

const applyBuyer = debounce((value: string) => {
  filter.value.buyer = value;
}, 300);

const title = computed(() => (props.item ? `订单 · ${props.item.listing.face.name}` : '订单'));

watch(visible, (open) => {
  if (!open || !props.item) return;
  buyerInput.value = '';
  filter.value = { buyer: '', source: undefined };
  page.value = 1;
  void load();
});
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="title"
    width="65%"
    top="7vh"
    destroy-on-close
  >
    <el-descriptions
      v-if="item"
      :column="3"
      border
      size="small"
      class="summary"
    >
      <el-descriptions-item label="售价">
        {{ formatPrice(item.price) }}
      </el-descriptions-item>
      <el-descriptions-item label="销量">
        <span class="summary__accent">{{ item.stats.purchases }}</span>
      </el-descriptions-item>
      <el-descriptions-item label="创作者">
        <AccountCell :account="item.creator" />
      </el-descriptions-item>
    </el-descriptions>

    <div class="toolbar">
      <el-input
        v-model="buyerInput"
        :prefix-icon="Search"
        placeholder="按买家 UID 搜索"
        clearable
        style="width: 280px"
        @input="applyBuyer"
      />
      <el-select
        v-model="filter.source"
        placeholder="全部来源"
        clearable
        style="width: 150px"
      >
        <el-option
          v-for="s in marketOrderSourceSchema.options"
          :key="s"
          :label="MarketOrderSourceLabel[s]"
          :value="s"
        />
      </el-select>
    </div>

    <el-table
      v-loading="loading"
      :data="items"
      row-key="id"
      max-height="480"
      class="records-table"
      empty-text="还没有订单"
    >
      <el-table-column
        label="买家"
        min-width="200"
      >
        <template #default="{ row }: { row: MarketOrderRow }">
          <AccountCell :account="row.buyer" />
        </template>
      </el-table-column>
      <el-table-column
        label="订单号"
        width="140"
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
        label="来源"
        width="90"
      >
        <template #default="{ row }: { row: MarketOrderRow }">
          {{ MarketOrderSourceLabel[row.source] }}
        </template>
      </el-table-column>
      <el-table-column
        label="价格"
        width="100"
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
            class="muted"
          >—</span>
        </template>
      </el-table-column>
      <el-table-column
        label="状态"
        width="100"
        align="center"
      >
        <template #default="{ row }: { row: MarketOrderRow }">
          <StatusTag
            :label="MarketOrderStatusLabel[row.status]"
            :tone="MarketOrderStatusTone[row.status]"
            :title="row.failureReason ?? undefined"
          />
        </template>
      </el-table-column>
      <el-table-column
        label="下单时间"
        width="160"
      >
        <template #default="{ row }: { row: MarketOrderRow }">
          <span class="muted-date">{{ formatDateTime(row.createdAt) }}</span>
        </template>
      </el-table-column>
    </el-table>

    <div class="records-pager">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        background
        small
      />
    </div>
  </el-dialog>
</template>

<style scoped>
.summary {
  margin-bottom: 16px;
}

.summary :deep(.el-descriptions__label) {
  width: 88px;
  color: var(--el-text-color-secondary);
}

.summary__accent {
  font-weight: 600;
  color: var(--el-color-primary);
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.num {
  font-variant-numeric: tabular-nums;
}

.muted {
  color: var(--el-text-color-placeholder);
}

.muted-date {
  color: var(--el-text-color-regular);
  font-variant-numeric: tabular-nums;
}

.records-table :deep(.el-table__row) {
  height: 56px;
}

.records-pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}
</style>
