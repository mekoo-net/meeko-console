<script setup lang="ts">
/**
 * 一张卡的评价，新的在前，按页翻。放在商品行「评价」的弹窗里。
 */
import { onMounted } from 'vue';

import EmptyState from '@/shared/ui/EmptyState.vue';
import FillListPageLayout from '@/shared/ui/FillListPageLayout.vue';
import { formatDateTime } from '@/shared/lib/date';

import { usePagedList } from '../../composables/usePagedList';
import type { MarketReview } from '../../model/market.types';
import { getTavernMarketPort } from '../../services';
import AccountCell from '../content/AccountCell.vue';

const props = defineProps<{ cardId: string }>();

const port = getTavernMarketPort();
const { items, total, page, pageSize, loading, load } = usePagedList<MarketReview>((p) => port.reviews(props.cardId, p));

onMounted(() => void load());
</script>

<template>
  <FillListPageLayout embedded>
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
        <template #default="{ row }: { row: MarketReview }">
          <span class="cell-date">{{ formatDateTime(row.updatedAt) }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="买家"
        min-width="160"
      >
        <template #default="{ row }: { row: MarketReview }">
          <AccountCell :account="row.account" />
        </template>
      </el-table-column>
      <el-table-column
        label="评分"
        width="130"
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
        min-width="240"
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

      <template #empty>
        <EmptyState
          title="还没有评价"
          description=""
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
.review-text {
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
