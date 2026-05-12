<script setup lang="ts">
/**
 * 状态分布环形图（ok / error / timeout / rate_limited / cancelled）。
 *  - 中心数字：总调用量
 *  - 右侧 legend：所有状态都展示，count=0 时灰显
 */
import { computed } from 'vue';

import { LogStatusLabel, type LogStatus } from '../../model/enums';
import type { LogStatsStatus } from '../../model/log.types';
import Panel from './Panel.vue';

const props = defineProps<{
  totalCalls: number;
  breakdown: LogStatsStatus[];
}>();

const DONUT_RADIUS = 60;
const DONUT_STROKE = 22;
const DONUT_CIRCUM = 2 * Math.PI * DONUT_RADIUS;

const statusColor: Readonly<Record<LogStatus, string>> = {
  ok: '#10b981',
  error: '#ef4444',
  timeout: '#f59e0b',
  rate_limited: '#f97316',
  cancelled: '#94a3b8',
};

interface Segment {
  status: LogStatus;
  count: number;
  dasharray: string;
  dashoffset: number;
  color: string;
}

const segments = computed<Segment[]>(() => {
  const total = props.breakdown.reduce((s, it) => s + it.count, 0);
  if (total === 0) return [];
  let acc = 0;
  const out: Segment[] = [];
  for (const it of props.breakdown) {
    if (it.count === 0) continue;
    const segLen = (it.count / total) * DONUT_CIRCUM;
    out.push({
      status: it.status,
      count: it.count,
      dasharray: `${segLen.toFixed(2)} ${(DONUT_CIRCUM - segLen).toFixed(2)}`,
      dashoffset: -acc,
      color: statusColor[it.status],
    });
    acc += segLen;
  }
  return out;
});
</script>

<template>
  <Panel title="状态分布">
    <div class="donut-body">
      <svg v-if="segments.length > 0" class="donut" viewBox="0 0 180 180">
        <circle
          cx="90"
          cy="90"
          :r="DONUT_RADIUS"
          fill="none"
          stroke="var(--el-fill-color-light)"
          :stroke-width="DONUT_STROKE"
        />
        <circle
          v-for="seg in segments"
          :key="seg.status"
          cx="90"
          cy="90"
          :r="DONUT_RADIUS"
          fill="none"
          :stroke="seg.color"
          :stroke-width="DONUT_STROKE"
          :stroke-dasharray="seg.dasharray"
          :stroke-dashoffset="seg.dashoffset"
          transform="rotate(-90 90 90)"
        />
        <text x="90" y="86" text-anchor="middle" class="donut__total">
          {{ totalCalls.toLocaleString() }}
        </text>
        <text x="90" y="104" text-anchor="middle" class="donut__sub">总调用</text>
      </svg>
      <div v-else class="empty donut-body__empty">暂无数据</div>

      <ul class="donut-legend">
        <li
          v-for="s in breakdown"
          :key="s.status"
          :class="{ 'donut-legend__item--mute': s.count === 0 }"
        >
          <span class="legend-dot" :style="{ background: statusColor[s.status] }"></span>
          <span class="donut-legend__label">{{ LogStatusLabel[s.status] }}</span>
          <span class="donut-legend__count num">{{ s.count.toLocaleString() }}</span>
        </li>
      </ul>
    </div>
  </Panel>
</template>

<style scoped>
.donut-body {
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: 16px;
  align-items: center;
}
.donut {
  width: 180px;
  height: 180px;
}
.donut__total {
  font-size: 22px;
  font-weight: 600;
  fill: var(--el-text-color-primary);
  font-variant-numeric: tabular-nums;
}
.donut__sub {
  font-size: 11px;
  fill: var(--el-text-color-secondary);
}
.donut-body__empty {
  grid-column: 1 / -1;
}
.donut-legend {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12.5px;
}
.donut-legend li {
  display: grid;
  grid-template-columns: 14px 1fr auto;
  gap: 6px;
  align-items: center;
  color: var(--el-text-color-regular);
}
.donut-legend__item--mute {
  color: var(--el-text-color-placeholder);
}
.legend-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 999px;
}
.donut-legend__count {
  font-weight: 500;
}
.num {
  font-variant-numeric: tabular-nums;
}
.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 180px;
  font-size: 12.5px;
  color: var(--el-text-color-placeholder);
}
</style>
