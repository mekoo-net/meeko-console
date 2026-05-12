<script setup lang="ts">
/**
 * 扣费 & Tokens 趋势：双轴折线。
 *  - 左轴：扣费（元，索引色 indigo）
 *  - 右轴：Tokens（虚线，amber）
 */
import { computed } from 'vue';

import type { LogStatsBucket } from '../../model/log.types';
import Panel from './Panel.vue';
import {
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
  costPath: string;
  tokensPath: string;
  xTicks: Array<{ x: number; label: string }>;
  yCostTicks: Array<{ y: number; label: string }>;
  yTokTicks: Array<{ y: number; label: string }>;
}

const chart = computed<ChartModel | null>(() => {
  if (props.buckets.length === 0) return null;
  const pad: Padding = { l: 50, r: 50, t: 16, b: 28 };
  const width = 720;
  const height = 220;
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const n = props.buckets.length;

  const costMax = Math.max(
    0.0001,
    niceCeil(props.buckets.reduce((m, b) => Math.max(m, b.cost), 0)),
  );
  const tokensMax = Math.max(
    1,
    niceCeil(props.buckets.reduce((m, b) => Math.max(m, b.tokens), 0)),
  );

  const yCost = (v: number): number => pad.t + innerH - (v / costMax) * innerH;
  const yTok = (v: number): number => pad.t + innerH - (v / tokensMax) * innerH;

  const costPts: XY[] = props.buckets.map((b, i) => ({
    x: xAt(i, n, pad.l, innerW),
    y: yCost(b.cost),
  }));
  const tokPts: XY[] = props.buckets.map((b, i) => ({
    x: xAt(i, n, pad.l, innerW),
    y: yTok(b.tokens),
  }));

  const xTickRaw = pickXTicks(n, pad.l, innerW);
  const xTicks = xTickRaw.map((t) => ({
    x: t.x,
    label: formatBucketLabel(props.buckets[t.idx]!.tsUtc, props.bucketSizeSec),
  }));
  const yCostTicks: ChartModel['yCostTicks'] = [];
  const yTokTicks: ChartModel['yTokTicks'] = [];
  for (let i = 0; i <= 4; i += 1) {
    yCostTicks.push({
      y: yCost((costMax / 4) * i),
      label: `¥${((costMax / 4) * i).toFixed(2)}`,
    });
    yTokTicks.push({
      y: yTok((tokensMax / 4) * i),
      label: shortNumber((tokensMax / 4) * i),
    });
  }

  return {
    pad,
    width,
    height,
    costPath: buildLinePath(costPts),
    tokensPath: buildLinePath(tokPts),
    xTicks,
    yCostTicks,
    yTokTicks,
  };
});
</script>

<template>
  <Panel title="扣费 & Tokens 趋势">
    <template #actions>
      <span class="legend">
        <span class="legend-dot legend-dot--cost"></span>扣费（左轴）
        <span class="legend-dot legend-dot--tokens"></span>Tokens（右轴）
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
          v-for="t in chart.yCostTicks"
          :key="`dy-${t.label}`"
          :x1="chart.pad.l"
          :x2="chart.width - chart.pad.r"
          :y1="t.y"
          :y2="t.y"
        />
      </g>
      <path :d="chart.costPath" class="line line--cost" />
      <path :d="chart.tokensPath" class="line line--tokens" />
      <g class="tick-y">
        <text
          v-for="t in chart.yCostTicks"
          :key="`dyl-${t.label}`"
          :x="chart.pad.l - 8"
          :y="t.y + 4"
          text-anchor="end"
        >
          {{ t.label }}
        </text>
      </g>
      <g class="tick-y">
        <text
          v-for="t in chart.yTokTicks"
          :key="`dyr-${t.label}`"
          :x="chart.width - chart.pad.r + 8"
          :y="t.y + 4"
          text-anchor="start"
        >
          {{ t.label }}
        </text>
      </g>
      <g class="tick-x">
        <text
          v-for="t in chart.xTicks"
          :key="`dxt-${t.label}-${t.x}`"
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
.legend-dot--cost {
  background: #6366f1;
}
.legend-dot--tokens {
  background: #f59e0b;
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
.line {
  fill: none;
  stroke-width: 2;
}
.line--cost {
  stroke: #6366f1;
}
.line--tokens {
  stroke: #f59e0b;
  stroke-dasharray: 4 4;
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
