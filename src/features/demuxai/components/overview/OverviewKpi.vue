<script setup lang="ts">
/**
 * KPI 行 —— 6 张卡：总调用 / RPM / 成功率 / P95 首字延迟 / 总扣费 / Tokens。
 *
 * 不维护状态，仅渲染传入的 `stats`，配色 / 阈值（SLA 95%/90%）固化在本组件。
 *
 * 延迟卡片只统计首字延迟（TTFT，单位 ms）—— LLM 总耗时强相关于生成长度，
 * 对运维定位无意义；TTFT 才反映上游响应健康度。详见 `LogStats`。
 */
import { computed } from 'vue';

import { formatMoney } from '@/shared/lib/money';

import type { LogStats } from '../../model/log.types';
import { shortNumber } from './chartUtils';

const props = defineProps<{ stats: LogStats | null }>();

const successRate = computed(() => {
  if (!props.stats || props.stats.totalCalls === 0) return 0;
  return (props.stats.successCalls / props.stats.totalCalls) * 100;
});

const successRateClass = computed(() => {
  const rate = successRate.value;
  if (!props.stats || props.stats.totalCalls === 0) return '';
  if (rate < 90) return 'kpi-card__value--danger';
  if (rate < 95) return 'kpi-card__value--warning';
  return 'kpi-card__value--success';
});
</script>

<template>
  <div class="kpi-grid">
    <div class="kpi-card kpi-card--accent">
      <div class="kpi-card__label">总调用</div>
      <div class="kpi-card__value">{{ (stats?.totalCalls ?? 0).toLocaleString() }}</div>
      <div class="kpi-card__sub">
        成功 <span class="num">{{ (stats?.successCalls ?? 0).toLocaleString() }}</span>
        · 失败 <span class="num num--danger">{{ (stats?.errorCalls ?? 0).toLocaleString() }}</span>
      </div>
    </div>
    <div class="kpi-card">
      <div class="kpi-card__label">RPM</div>
      <div class="kpi-card__value">{{ (stats?.rpm ?? 0).toFixed(2) }}</div>
      <div class="kpi-card__sub">每分钟调用</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-card__label">成功率</div>
      <div class="kpi-card__value" :class="successRateClass">
        {{ successRate.toFixed(2) }}%
      </div>
      <div class="kpi-card__sub">SLA 阈值 95% / 90%</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-card__label">P95 首字延迟</div>
      <div class="kpi-card__value">
        {{ (stats?.p95TokenLatency ?? 0).toLocaleString() }}
        <span class="unit">ms</span>
      </div>
      <div class="kpi-card__sub">
        均值 <span class="num">{{ (stats?.avgTokenLatency ?? 0).toLocaleString() }}</span> ms
      </div>
    </div>
    <div class="kpi-card">
      <div class="kpi-card__label">总扣费</div>
      <div class="kpi-card__value">{{ formatMoney(stats?.totalCost ?? 0) }}</div>
      <div class="kpi-card__sub">范围内累计</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-card__label">Tokens</div>
      <div class="kpi-card__value">{{ shortNumber(stats?.totalTokens ?? 0) }}</div>
      <div class="kpi-card__sub">
        {{ (stats?.totalTokens ?? 0).toLocaleString() }} tokens · 仅 token 类
      </div>
    </div>
  </div>
</template>

<style scoped>
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
}
@media (max-width: 1200px) {
  .kpi-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
.kpi-card {
  background: #fff;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 16px 18px;
  min-width: 0;
}
.kpi-card--accent {
  background: linear-gradient(135deg, #eff6ff 0%, #fff 70%);
  border-color: #bfdbfe;
}
.kpi-card__label {
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
}
.kpi-card__value {
  margin-top: 6px;
  font-size: 24px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}
.kpi-card__value--success {
  color: var(--el-color-success);
}
.kpi-card__value--warning {
  color: var(--el-color-warning);
}
.kpi-card__value--danger {
  color: var(--el-color-danger);
}
.kpi-card__sub {
  margin-top: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.unit {
  font-size: 14px;
  color: var(--el-text-color-secondary);
  font-weight: 500;
  margin-left: 2px;
}
.num {
  font-variant-numeric: tabular-nums;
}
.num--danger {
  color: var(--el-color-danger);
}
</style>
