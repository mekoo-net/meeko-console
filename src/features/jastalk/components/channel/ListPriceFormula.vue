<script setup lang="ts">
/**
 * 「牌价（美元）× 渠道倍率 × 100 = 积分」，一行一个价（照 Yomi 的 CompiledPriceCard）。
 * 数都是后端回的——牌价里取的那个数、按渠道现在的倍率折出来的积分——这里只摆出来，不自己再乘一遍：
 * 前端另算一份，取整和后端差一点就会出现「页面上写的和实际扣的不一样」。
 */
import { computed } from 'vue';

import { formatUsd, formulaRows, listPriceNote, multiplierText } from '../../model/channelPricing';
import type { ListPrice, ModelCategory } from '../../model/jastalk.types';
import { categoryUnits, formatPrice, unitLabels, unitPer } from '../../model/jastalkFormat';

const props = defineProps<{
  category: ModelCategory;
  listPrice: ListPrice;
  multiplier: number;
}>();

const unit = computed(() => categoryUnits[props.category]);
const rows = computed(() => formulaRows(props.category, props.listPrice));
const note = computed(() => listPriceNote(props.listPrice));
const mulText = computed(() => multiplierText(props.multiplier));
</script>

<template>
  <div class="lpf">
    <div class="lpf__head">
      <div class="lpf__kind-wrap">
        <span class="lpf__kind">{{ unitLabels[unit] }}</span>
        <span class="lpf__hint">积分 {{ unitPer[unit] }}</span>
      </div>
      <div class="lpf__mul">
        <span class="lpf__mul-v">{{ mulText }}</span>
        <span class="lpf__mul-k">渠道倍率</span>
      </div>
    </div>

    <div class="lpf__board">
      <div
        v-for="row in rows"
        :key="row.label"
        class="lpf__row"
      >
        <span class="lpf__label">{{ row.label }}</span>
        <div class="lpf__eq">
          <span class="lpf__usd">{{ row.usd === null ? '—' : formatUsd(row.usd) }}</span>
          <span class="lpf__factor">{{ mulText }}</span>
          <span class="lpf__factor">×100</span>
          <span class="lpf__eqs">=</span>
          <span class="lpf__points">{{ row.points === null ? '—' : formatPrice(row.points) }}</span>
        </div>
      </div>
    </div>

    <p class="lpf__foot">
      牌价 <span class="lpf__key">{{ listPrice.modelKey }}</span>
      <template v-if="listPrice.maker">
        · {{ listPrice.maker }}
      </template>
      <template v-if="note">
        · {{ note }}
      </template>
    </p>
  </div>
</template>

<style scoped>
.lpf {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.lpf__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}

.lpf__kind-wrap {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.lpf__kind {
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--el-color-primary-light-9);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--el-color-primary);
}

.lpf__hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.lpf__mul {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
  line-height: 1;
}

.lpf__mul-v {
  font-size: 22px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.04em;
  color: var(--el-text-color-primary);
}

.lpf__mul-k {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.lpf__board {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  overflow: hidden;
  background: var(--el-bg-color);
}

.lpf__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
}

.lpf__row + .lpf__row {
  border-top: 1px dashed var(--el-border-color-extra-light);
}

.lpf__label {
  flex-shrink: 0;
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.lpf__eq {
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 6px;
  font-variant-numeric: tabular-nums;
}

.lpf__usd {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.lpf__factor {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
}

.lpf__eqs {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.lpf__points {
  font-size: 18px;
  font-weight: 650;
  letter-spacing: -0.02em;
  color: var(--el-text-color-primary);
}

.lpf__foot {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.lpf__key {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}
</style>
