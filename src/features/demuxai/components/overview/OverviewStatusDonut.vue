<script setup lang="ts">
/**
 * 状态分布环形图。
 *
 * 设计取舍：
 *  - 顶层 `success: boolean` 二元成败，失败的细分类全部走 `error.code`；
 *    所以环形图改成"成功 + Top 错误码"多分类，比"ok/error/timeout/..."更有信息量
 *  - 中心数字：总调用量
 *  - 右侧 legend：成功 + 各错误码（count=0 不渲染）
 */
import { computed } from 'vue';

import { LogErrorCodeLabel } from '@demux/common';
import type { LogStatsErrorCode } from '@demux/common';
import Panel from './Panel.vue';

const props = defineProps<{
  totalCalls: number;
  successCalls: number;
  /** 已按 count 降序的错误码 Top；其余合并的 `other` 也在内 */
  errorCodes: LogStatsErrorCode[];
}>();

const DONUT_RADIUS = 60;
const DONUT_STROKE = 22;
const DONUT_CIRCUM = 2 * Math.PI * DONUT_RADIUS;

const SUCCESS_COLOR = '#10b981';
/** 错误码调色板（按 Top 排名循环） —— red / orange / amber / fuchsia / rose / slate */
const ERROR_PALETTE = ['#ef4444', '#f59e0b', '#f97316', '#c026d3', '#e11d48', '#94a3b8'];

interface LegendItem {
  key: string;
  label: string;
  count: number;
  color: string;
}

const legend = computed<LegendItem[]>(() => {
  const items: LegendItem[] = [
    { key: '__success__', label: '成功', count: props.successCalls, color: SUCCESS_COLOR },
  ];
  props.errorCodes.forEach((e, i) => {
    const label =
      e.code === 'other'
        ? '其它错误'
        : ((LogErrorCodeLabel as Record<string, string>)[e.code] ?? e.code);
    items.push({
      key: e.code,
      label,
      count: e.count,
      color: ERROR_PALETTE[i % ERROR_PALETTE.length]!,
    });
  });
  return items;
});

interface Segment {
  key: string;
  dasharray: string;
  dashoffset: number;
  color: string;
}

const segments = computed<Segment[]>(() => {
  const total = legend.value.reduce((s, it) => s + it.count, 0);
  if (total === 0) return [];
  let acc = 0;
  const out: Segment[] = [];
  for (const it of legend.value) {
    if (it.count === 0) continue;
    const segLen = (it.count / total) * DONUT_CIRCUM;
    out.push({
      key: it.key,
      dasharray: `${segLen.toFixed(2)} ${(DONUT_CIRCUM - segLen).toFixed(2)}`,
      dashoffset: -acc,
      color: it.color,
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
          :key="seg.key"
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
          v-for="s in legend"
          :key="s.key"
          :class="{ 'donut-legend__item--mute': s.count === 0 }"
        >
          <span class="legend-dot" :style="{ background: s.color }"></span>
          <span class="donut-legend__label">{{ s.label }}</span>
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
