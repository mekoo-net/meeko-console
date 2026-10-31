<script setup lang="ts">
/**
 * 商品行「评价」：一张角色卡的评价，版式同平台「领取记录」弹窗——上面一行摘要，下面定高表格，分页贴右下。
 */
import { computed, watch } from 'vue';

import { formatDateTime } from '@/shared/lib/date';

import { usePagedList } from '../../composables/usePagedList';
import type { MarketCardRow, MarketReview } from '../../model/market.types';
import { getTavernMarketPort } from '../../services';
import AccountCell from '../content/AccountCell.vue';

const visible = defineModel<boolean>('visible', { required: true });
const props = defineProps<{ card: MarketCardRow | null }>();

const port = getTavernMarketPort();
const { items, total, page, pageSize, loading, load } = usePagedList<MarketReview>((p) =>
  port.reviews(props.card?.cardId ?? '', p),
);

const title = computed(() => (props.card ? `评价 · ${props.card.face.name}` : '评价'));

watch(visible, (open) => {
  if (!open || !props.card) return;
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
      v-if="card"
      :column="3"
      border
      size="small"
      class="summary"
    >
      <el-descriptions-item label="平均评分">
        <span
          v-if="card.stats.ratingCount"
          class="summary__accent"
        >{{ card.stats.rating.toFixed(1) }}</span>
        <span
          v-else
          class="muted"
        >—</span>
      </el-descriptions-item>
      <el-descriptions-item label="评价数">
        {{ card.stats.ratingCount }}
      </el-descriptions-item>
      <el-descriptions-item label="销量">
        {{ card.stats.purchases }}
      </el-descriptions-item>
    </el-descriptions>

    <el-table
      v-loading="loading"
      :data="items"
      row-key="id"
      max-height="480"
      class="records-table"
      empty-text="还没有评价"
    >
      <el-table-column
        label="买家"
        min-width="200"
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
        min-width="280"
      >
        <template #default="{ row }: { row: MarketReview }">
          <span
            v-if="row.content"
            class="review-text"
          >{{ row.content }}</span>
          <span
            v-else
            class="muted"
          >只打了分</span>
        </template>
      </el-table-column>
      <el-table-column
        label="时间"
        width="160"
      >
        <template #default="{ row }: { row: MarketReview }">
          <span class="muted-date">{{ formatDateTime(row.updatedAt) }}</span>
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

.review-text {
  white-space: pre-wrap;
  word-break: break-word;
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
