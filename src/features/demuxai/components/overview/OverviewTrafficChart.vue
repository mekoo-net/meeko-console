<script setup lang="ts">
/**
 * 调用量趋势：双层面积叠加（成功 + 失败）。
 *  - 底层面积 = total（成功 + 失败），渲染为浅红
 *  - 上层面积 = success（成功），渲染为浅绿
 *  - 视觉上失败部分 = 红色面积减去绿色面积
 */
import { computed } from 'vue';

import type { LogStatsBucket } from '../../model/log.types';
import Panel from './Panel.vue';
import {
  buildAreaPath,
  buildLinePath,
  formatBucketLabel,
  niceCeil,
  pickXTicks,
  shortNumber,
  xAt,
  type Padding,
  type XY,
} from './chartUtils';

const props = defineProps<{
  buckets: LogStatsBucket[];
  bucketSizeSec: number;
}>();

interface ChartModel {
  pad: Padding;
  width: number;
  height: number;
  yMax: number;
  xTicks: Array<{ x: number; label: string }>;
  yTicks: Array<{ y: number; label: string }>;
  successArea: string;
  successLine: string;
  totalArea: string;
}

const chart = computed<ChartModel | null>(() => {
  if (props.buckets.length === 0) return null;
  const pad: Padding = { l: 40, r: 16, t: 16, b: 28 };
  const width = 720;
  const height = 220;
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const n = props.buckets.length;

  const yMax = Math.max(1, niceCeil(props.buckets.reduce((m, b) => Math.max(m, b.calls), 0)));
  const yAt = (v: number): number => pad.t + innerH - (v / yMax) * innerH;

  const totalPts: XY[] = props.buckets.map((b, i) => ({
    x: xAt(i, n, pad.l, innerW),
    y: yAt(b.calls),
  }));
  const successPts: XY[] = props.buckets.map((b, i) => ({
    x: xAt(i, n, pad.l, innerW),
    y: yAt(b.calls - b.errors),
  }));
  const baseY = pad.t + innerH;

  const xTickRaw = pickXTicks(n, pad.l, innerW);
  const xTicks = xTickRaw.map((t) => ({
    x: t.x,
    label: formatBucketLabel(props.buckets[t.idx]!.tsUtc, props.bucketSizeSec),
  }));
  const yTicks: ChartModel['yTicks'] = [];
  for (let i = 0; i <= 4; i += 1) {
    const v = (yMax / 4) * i;
    yTicks.push({ y: yAt(v), label: shortNumber(v) });
  }

  return {
    pad,
    width,
    height,
    yMax,
    xTicks,
    yTicks,
    successArea: buildAreaPath(successPts, baseY),
    successLine: buildLinePath(successPts),
    totalArea: buildAreaPath(totalPts, baseY),
  };
});
</script>

<template>
  <Panel title="调用量趋势">
    <template #actions>
      <span class="legend">
        <span class="legend-dot legend-dot--success"></span>成功
        <span class="legend-dot legend-dot--danger"></span>失败
      </span>
    </template>

    <svg
      v-if="chart"
      class="chart"
      :viewBox="`0 0 ${chart.width} ${chart.height}`"
      preserveAspectRatio="none"
    >
      <g class="grid">
        <line
          v-for="t in chart.yTicks"
          :key="`yg-${t.label}`"
          :x1="chart.pad.l"
          :x2="chart.width - chart.pad.r"
          :y1="t.y"
          :y2="t.y"
        />
      </g>
      <path :d="chart.totalArea" class="area area--danger" />
      <path :d="chart.successArea" class="area area--success" />
      <path :d="chart.successLine" class="line line--success" />
      <g class="tick-y">
        <text
          v-for="t in chart.yTicks"
          :key="`yt-${t.label}`"
          :x="chart.pad.l - 8"
          :y="t.y + 4"
          text-anchor="end"
        >
          {{ t.label }}
        </text>
      </g>
      <g class="tick-x">
        <text
          v-for="t in chart.xTicks"
          :key="`xt-${t.label}-${t.x}`"
          :x="t.x"
          :y="chart.height - 8"
          text-anchor="middle"
        >
          {{ t.label }}
        </text>
      </g>
    </svg>
    <div v-else class="empty">暂无数据</div>
  </Panel>
</template>

<style scoped>
.legend {
  display: inline-flex;
  align-items: center;
  gap: 12px;
}
.legend-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 999px;
  margin-right: 4px;
}
.legend-dot--success {
  background: #10b981;
}
.legend-dot--danger {
  background: #ef4444;
}
.chart {
  width: 100%;
  height: 220px;
  display: block;
}
.chart .grid line {
  stroke: var(--el-border-color-lighter);
  stroke-dasharray: 3 3;
  stroke-width: 1;
}
.chart .tick-x text,
.chart .tick-y text {
  font-size: 10.5px;
  fill: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}
.area {
  stroke: none;
}
.area--success {
  fill: rgba(16, 185, 129, 0.22);
}
.area--danger {
  fill: rgba(239, 68, 68, 0.18);
}
.line {
  fill: none;
  stroke-width: 1.5;
}
.line--success {
  stroke: #10b981;
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
