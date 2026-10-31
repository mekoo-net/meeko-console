<script setup lang="ts">
/**
 * 订单上卖家这一单所得（人民币）：金额一行，下面一行小字说钱到哪一步了——
 * 还在冻结期写「待结算 · 某日转可提现」，期满写「已结算」。免费的单和创作者自己那单没有钱可分，写「—」。
 */
import { formatDateTime } from '@/shared/lib/date';

import type { MarketSettlement } from '../../model/market.types';
import { formatPercent, formatYuan } from '../../model/marketFormat';

defineProps<{ settlement: MarketSettlement | null }>();
</script>

<template>
  <div
    v-if="settlement && settlement.sellerAmount > 0"
    class="share"
    :title="`平台抽成 ${formatPercent(settlement.commissionRate)}`"
  >
    <span class="share__amount">{{ formatYuan(settlement.sellerAmount) }}</span>
    <span
      v-if="settlement.settledAt != null"
      class="share__state share__state--done"
    >已结算</span>
    <span
      v-else-if="settlement.settlesAt != null"
      class="share__state"
    >待结算 · {{ formatDateTime(settlement.settlesAt, 'MM-DD') }} 转可提现</span>
  </div>
  <span
    v-else
    class="cell-muted"
  >—</span>
</template>

<style scoped>
.share {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-end;
  line-height: 1.35;
}

.share__amount {
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-primary);
}

.share__state {
  font-size: 12px;
  color: var(--el-color-warning);
}

.share__state--done {
  color: var(--el-text-color-secondary);
}

.cell-muted {
  color: var(--el-text-color-placeholder);
}
</style>
