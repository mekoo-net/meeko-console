<script setup lang="ts">
/**
 * 调用量趋势：按小时堆叠柱状（成功 + 失败）。
 *  - 每个柱体 = 该小时调用量；绿色段 = 成功，红色段叠在其上 = 失败
 *  - 柱体彼此独立：某小时为 0 即不画柱（高度 0），不会跨桶连成斜线
 */
import { computed, useTemplateRef } from 'vue';

import type { LogStatsBucket } from '@demux/common';
import Panel from './Panel.vue';
import { useChartWidth } from './useChartWidth';
import {
  barLayout,
  formatBucketLabel,
  niceCeil,
  pickXTicks,
  shortNumber,
  type Padding,
} from './chartUtils';

const props = defineProps<{
  buckets: LogStatsBucket[];
  bucketSizeSec: number;
}>();

const hostEl = useTemplateRef<HTMLElement>('hostEl');
const hostWidth = useChartWidth(hostEl);

interface Bar {
  x: number;
  width: number;
  successY: number;
  successH: number;
  errorY: number;
  errorH: number;
}

interface ChartModel {
  pad: Padding;
  width: number;
  height: number;
  yMax: number;
  bars: Bar[];
  xTicks: Array<{ x: number; label: string }>;
  yTicks: Array<{ y: number; label: string }>;
}

const chart = computed<ChartModel | null>(() => {
  if (props.buckets.length === 0) return null;
  const pad: Padding = { l: 40, r: 16, t: 16, b: 28 };
  const width = hostWidth.value;
  const height = 220;
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const n = props.buckets.length;

  const yMax = Math.max(1, niceCeil(props.buckets.reduce((m, b) => Math.max(m, b.calls), 0)));
  const yAt = (v: number): number => pad.t + innerH - (v / yMax) * innerH;
  const baseY = pad.t + innerH;
  const layout = barLayout(n, pad.l, innerW);

  const bars: Bar[] = props.buckets.map((b, i) => {
    const success = Math.max(0, b.calls - b.errors);
    const errors = Math.max(0, b.errors);
    const successY = yAt(success);
    const errorY = yAt(success + errors);
    return {
      x: layout.left(i),
      width: layout.width,
      successY,
      successH: baseY - successY,
      errorY,
      errorH: successY - errorY,
    };
  });

  const spanMs = n > 1 ? props.buckets[n - 1]!.tsUtc - props.buckets[0]!.tsUtc : 0;
  const xTickRaw = pickXTicks(n, pad.l, innerW);
  const xTicks = xTickRaw.map((t) => ({
    x: layout.center(t.idx),
    label: formatBucketLabel(props.buckets[t.idx]!.tsUtc, props.bucketSizeSec, spanMs),
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
    bars,
    xTicks,
    yTicks,
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

    <div ref="hostEl" class="chart-host">
      <svg
        v-if="chart"
        class="chart"
        :viewBox="`0 0 ${chart.width} ${chart.height}`"
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
      <g class="bars">
        <template v-for="(bar, i) in chart.bars" :key="`bar-${i}`">
          <rect
            v-if="bar.successH > 0"
            class="bar bar--success"
            :x="bar.x"
            :y="bar.successY"
            :width="bar.width"
            :height="bar.successH"
          />
          <rect
            v-if="bar.errorH > 0"
            class="bar bar--danger"
            :x="bar.x"
            :y="bar.errorY"
            :width="bar.width"
            :height="bar.errorH"
          />
        </template>
      </g>
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
    </div>
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
.chart-host {
  width: 100%;
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
.bar {
  stroke: none;
}
.bar--success {
  fill: #10b981;
}
.bar--danger {
  fill: #ef4444;
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
