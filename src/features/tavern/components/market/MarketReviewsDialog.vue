<script setup lang="ts">
/**
 * 商品行「评价」：一件商品（角色卡或世界书）的评价，新的在前。外壳见 MarketRecordsDialog。
 * 上面一行按买家搜、按好评 / 中评 / 差评分类看（好评 4–5 星、中评 3 星、差评 1–2 星），分类按钮上带条数。
 */
import { computed, ref, watch } from 'vue';
import { Search } from '@element-plus/icons-vue';

import EmptyState from '@/shared/ui/EmptyState.vue';
import { fail } from '@/shared/api/httpTypes';
import { debounce } from '@/shared/lib/debounce';
import { formatDateTime } from '@/shared/lib/date';

import { usePagedList } from '../../composables/usePagedList';
import {
  ReviewSentimentLabel,
  reviewSentimentSchema,
  type MarketItemRow,
  type MarketReview,
  type ReviewSentiment,
  type ReviewSummary,
} from '../../model/market.types';
import type { RecordStat } from '../../model/marketFormat';
import { parseAccountUid } from '../../model/meteringFormat';
import { getTavernMarketPort } from '../../services';
import AccountCell from '../content/AccountCell.vue';
import MarketRecordsDialog from './MarketRecordsDialog.vue';

const visible = defineModel<boolean>('visible', { required: true });
const props = defineProps<{ item: MarketItemRow | null }>();

const port = getTavernMarketPort();

// buyerInput：输入框即时值；filter.buyer：防抖后的查询值。sentiment 空串是「全部」。
const buyerInput = ref('');
const filter = ref({ buyer: '', sentiment: '' as ReviewSentiment | '' });
const summary = ref<ReviewSummary | null>(null);

const { items, total, page, pageSize, loading, load } = usePagedList<MarketReview>((p) => {
  const buyer = parseAccountUid(filter.value.buyer);
  return buyer.ok
    ? port.reviews(props.item?.itemId ?? '', { accountUid: buyer.value, sentiment: filter.value.sentiment || undefined }, p)
    : Promise.resolve(fail({ code: 'validation', message: '买家 UID 只能是数字' }));
}, filter);

const applyBuyer = debounce((value: string) => {
  filter.value.buyer = value;
}, 300);

const sentiments = computed(() => {
  const s = summary.value;
  const all = s ? s.good + s.neutral + s.bad : null;
  return [
    { value: '' as const, label: all == null ? '全部' : `全部 ${all}` },
    ...reviewSentimentSchema.options.map((k) => ({
      value: k,
      label: s ? `${ReviewSentimentLabel[k]} ${s[k]}` : ReviewSentimentLabel[k],
    })),
  ];
});

const stats = computed<RecordStat[]>(() => {
  const s = props.item?.stats;
  if (!s) return [];
  const good = summary.value && s.ratingCount ? `${Math.round((summary.value.good / s.ratingCount) * 100)}%` : '—';
  return [
    s.ratingCount ? { label: '平均评分', value: s.rating.toFixed(1), rating: s.rating } : { label: '平均评分', value: '—' },
    { label: '评价数', value: String(s.ratingCount) },
    { label: '好评率', value: good },
    { label: '销量', value: String(s.purchases) },
  ];
});

async function loadSummary(itemId: string): Promise<void> {
  const r = await port.reviewSummary(itemId);
  summary.value = r.success ? r.data : null;
}

watch(visible, (open) => {
  if (!open || !props.item) return;
  buyerInput.value = '';
  filter.value = { buyer: '', sentiment: '' };
  summary.value = null;
  page.value = 1;
  void load();
  void loadSummary(props.item.itemId);
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
    <template #toolbar>
      <el-input
        v-model="buyerInput"
        :prefix-icon="Search"
        placeholder="按买家 UID 搜索"
        clearable
        style="width: 280px"
        @input="applyBuyer"
      />
      <el-radio-group v-model="filter.sentiment">
        <el-radio-button
          v-for="s in sentiments"
          :key="s.value"
          :value="s.value"
        >
          {{ s.label }}
        </el-radio-button>
      </el-radio-group>
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
          title="暂无评价"
          description="调整筛选条件后重试。"
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
