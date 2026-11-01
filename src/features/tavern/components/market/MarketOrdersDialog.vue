<script setup lang="ts">
/**
 * 商品行「订单」：一件商品（角色卡或世界卡）的订单，列序同订单页（详情在前、时间在后），订单号新的在前；
 * 钱怎么分在行首「详情」的抽屉里。
 * 外壳见 MarketRecordsDialog；上面一行按买家、来源轻筛。
 */
import { computed, ref, watch } from 'vue';
import { Search, View } from '@element-plus/icons-vue';

import EmptyState from '@/shared/ui/EmptyState.vue';
import StatusTag from '@/shared/ui/StatusTag.vue';
import { fail } from '@/shared/api/httpTypes';
import { debounce } from '@/shared/lib/debounce';
import { formatDateTime } from '@/shared/lib/date';

import { usePagedList } from '../../composables/usePagedList';
import {
  MarketOrderStageLabel,
  MarketOrderStageTone,
  type MarketItemRow,
  type MarketOrderRow,
} from '../../model/market.types';
import { formatPrice, type RecordStat } from '../../model/marketFormat';
import { parseAccountUid } from '../../model/meteringFormat';
import { getTavernMarketPort } from '../../services';
import AccountCell from '../content/AccountCell.vue';
import MarketRecordsDialog from './MarketRecordsDialog.vue';
import MarketOrderDrawer from './MarketOrderDrawer.vue';

const visible = defineModel<boolean>('visible', { required: true });
const props = defineProps<{ item: MarketItemRow | null }>();

const port = getTavernMarketPort();

// buyerInput：输入框即时值；filter.buyer：防抖后的查询值。
const buyerInput = ref('');
const filter = ref({ buyer: '' });

const { items, total, page, pageSize, loading, load } = usePagedList<MarketOrderRow>((p) => {
  const buyer = parseAccountUid(filter.value.buyer);
  return buyer.ok
    ? port.orders({ itemId: props.item?.itemId, buyerUid: buyer.value }, p)
    : Promise.resolve(fail({ code: 'validation', message: '买家 UID 只能是数字' }));
}, filter);

const applyBuyer = debounce((value: string) => {
  filter.value.buyer = value;
}, 300);

const stats = computed<RecordStat[]>(() => {
  const i = props.item;
  if (!i) return [];
  return [
    { label: '销量', value: String(i.stats.purchases) },
    { label: '售价', value: formatPrice(i.price) },
    i.stats.ratingCount
      ? { label: '评分', value: i.stats.rating.toFixed(1), rating: i.stats.rating }
      : { label: '评分', value: '—' },
  ];
});

const detailOpen = ref(false);
const detailId = ref<string | null>(null);

function openDetail(orderId: string): void {
  detailId.value = orderId;
  detailOpen.value = true;
}

watch(visible, (open) => {
  if (!open || !props.item) return;
  buyerInput.value = '';
  filter.value = { buyer: '' };
  page.value = 1;
  void load();
});
</script>

<template>
  <MarketRecordsDialog
    v-model:visible="visible"
    v-model:page="page"
    v-model:page-size="pageSize"
    title="订单"
    :item="item"
    :stats="stats"
    :total="total"
  >
    <template #toolbar>
      <el-input
        v-model="buyerInput"
        :prefix-icon="Search"
        placeholder="按买家 UID 搜索"
        clearable
        style="width: 280px"
        @input="applyBuyer"
      />
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
        label="详情"
        width="56"
        align="center"
        fixed
      >
        <template #default="{ row }: { row: MarketOrderRow }">
          <el-button
            :icon="View"
            link
            type="primary"
            title="查看详情"
            @click="openDetail(row.id)"
          />
        </template>
      </el-table-column>
      <el-table-column
        label="订单号"
        min-width="180"
      >
        <template #default="{ row }: { row: MarketOrderRow }">
          <span class="cell-uid">{{ row.serialNo }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="买家"
        min-width="200"
      >
        <template #default="{ row }: { row: MarketOrderRow }">
          <AccountCell :account="row.buyer" />
        </template>
      </el-table-column>
      <el-table-column
        label="状态"
        width="100"
      >
        <template #default="{ row }: { row: MarketOrderRow }">
          <StatusTag
            :label="MarketOrderStageLabel[row.stage]"
            :tone="MarketOrderStageTone[row.stage]"
          />
        </template>
      </el-table-column>
      <el-table-column
        label="价格"
        width="110"
        align="right"
      >
        <template #default="{ row }: { row: MarketOrderRow }">
          <span class="num">{{ formatPrice(row.price) }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="下单时间"
        width="170"
      >
        <template #default="{ row }: { row: MarketOrderRow }">
          <span class="cell-date">{{ formatDateTime(row.createdAt) }}</span>
        </template>
      </el-table-column>

      <template #empty>
        <EmptyState
          title="暂无订单"
          description="调整筛选条件或清空后重试。"
        />
      </template>
    </el-table>
  </MarketRecordsDialog>

  <MarketOrderDrawer
    v-model:visible="detailOpen"
    :order-id="detailId"
  />
</template>

<style scoped>
.num {
  font-variant-numeric: tabular-nums;
}
</style>
