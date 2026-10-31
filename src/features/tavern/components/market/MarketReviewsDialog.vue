<script setup lang="ts">
/**
 * 商品行「评价」：一件商品（角色卡或世界书）的评价，新的在前。外壳见 MarketRecordsDialog。
 */
import { computed, watch } from 'vue';

import EmptyState from '@/shared/ui/EmptyState.vue';
import { formatDateTime } from '@/shared/lib/date';

import { usePagedList } from '../../composables/usePagedList';
import type { MarketItemRow, MarketReview } from '../../model/market.types';
import type { RecordStat } from '../../model/marketFormat';
import { getTavernMarketPort } from '../../services';
import AccountCell from '../content/AccountCell.vue';
import MarketRecordsDialog from './MarketRecordsDialog.vue';

const visible = defineModel<boolean>('visible', { required: true });
const props = defineProps<{ item: MarketItemRow | null }>();

const port = getTavernMarketPort();
const { items, total, page, pageSize, loading, load } = usePagedList<MarketReview>((p) =>
  port.reviews(props.item?.itemId ?? '', p),
);

const stats = computed<RecordStat[]>(() => {
  const s = props.item?.stats;
  if (!s) return [];
  return [
    s.ratingCount ? { label: '平均评分', value: s.rating.toFixed(1), rating: s.rating } : { label: '平均评分', value: '—' },
    { label: '评价数', value: String(s.ratingCount) },
    { label: '销量', value: String(s.purchases) },
  ];
});

watch(visible, (open) => {
  if (!open || !props.item) return;
  page.value = 1;
  void load();
});
</script>

<template>
  <MarketRecordsDialog
    v-model:visible="visible"
    v-model:page="page"
    v-model:page-size="pageSize"
    title="评价"
    :item="item"
    :stats="stats"
    :total="total"
  >
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
        label="买家"
        width="240"
      >
        <template #default="{ row }: { row: MarketReview }">
          <AccountCell :account="row.account" />
        </template>
      </el-table-column>
      <el-table-column
        label="评分"
        width="150"
      >
        <template #default="{ row }: { row: MarketReview }">
          <el-rate
            :model-value="row.rating"
            disabled
            size="small"
          />
        </template>
      </el-table-column>
      <el-table-column
        label="评价"
        min-width="360"
      >
        <template #default="{ row }: { row: MarketReview }">
          <span
            v-if="row.content"
            class="review-text"
          >{{ row.content }}</span>
          <span
            v-else
            class="cell-muted"
          >只打了分</span>
        </template>
      </el-table-column>
      <el-table-column
        label="时间"
        width="170"
      >
        <template #default="{ row }: { row: MarketReview }">
          <span class="cell-date">{{ formatDateTime(row.updatedAt) }}</span>
        </template>
      </el-table-column>

      <template #empty>
        <EmptyState
          title="还没有评价"
          description="买过的玩家评价以后会出现在这里。"
        />
      </template>
    </el-table>
  </MarketRecordsDialog>
</template>

<style scoped>
.review-text {
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--el-text-color-regular);
}
</style>
