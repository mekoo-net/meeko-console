<script setup lang="ts">
/**
 * 扣费 & Tokens 趋势：双轴分组柱状。
 *  - 左轴：扣费（元，indigo）
 *  - 右轴：Tokens（amber）
 *  - 每个小时两根并排柱体；某小时为 0 即不画柱，柱体彼此独立不连线
 */
import { computed, useTemplateRef } from 'vue';

import type { LogStatsBucket } from '../../model/log.types';
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
  costX: number;
  costY: number;
  costH: number;
  tokX: number;
  tokY: number;
  tokH: number;
  subWidth: number;
}

interface ChartModel {
  pad: Padding;
  width: number;
  height: number;
  bars: Bar[];
  xTicks: Array<{ x: number; label: string }>;
  yCostTicks: Array<{ y: number; label: string }>;
  yTokTicks: Array<{ y: number; label: string }>;
}

const chart = computed<ChartModel | null>(() => {
  if (props.buckets.length === 0) return null;
  const pad: Padding = { l: 50, r: 50, t: 16, b: 28 };
  const width = hostWidth.value;
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
  const baseY = pad.t + innerH;
  const layout = barLayout(n, pad.l, innerW);
  const subWidth = Math.max(0.5, layout.width / 2);

  const bars: Bar[] = props.buckets.map((b, i) => {
    const left = layout.left(i);
    const costY = yCost(b.cost);
    const tokY = yTok(b.tokens);
    return {
      costX: left,
      costY,
      costH: baseY - costY,
      tokX: left + subWidth,
      tokY,
      tokH: baseY - tokY,
      subWidth,
    };
  });

  const spanMs = n > 1 ? props.buckets[n - 1]!.tsUtc - props.buckets[0]!.tsUtc : 0;
  const xTickRaw = pickXTicks(n, pad.l, innerW);
  const xTicks = xTickRaw.map((t) => ({
    x: layout.center(t.idx),
    label: formatBucketLabel(props.buckets[t.idx]!.tsUtc, props.bucketSizeSec, spanMs),
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
    bars,
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

    <div ref="hostEl" class="chart-host">
      <svg
        v-if="chart"
        class="chart"
        :viewBox="`0 0 ${chart.width} ${chart.height}`"
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
      <g class="bars">
        <template v-for="(bar, i) in chart.bars" :key="`cb-${i}`">
          <rect
            v-if="bar.costH > 0"
            class="bar bar--cost"
            :x="bar.costX"
            :y="bar.costY"
            :width="bar.subWidth"
            :height="bar.costH"
          />
          <rect
            v-if="bar.tokH > 0"
            class="bar bar--tokens"
            :x="bar.tokX"
            :y="bar.tokY"
            :width="bar.subWidth"
            :height="bar.tokH"
          />
        </template>
      </g>
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
.legend-dot--cost {
  background: #6366f1;
}
.legend-dot--tokens {
  background: #f59e0b;
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
.bar--cost {
  fill: #6366f1;
}
.bar--tokens {
  fill: #f59e0b;
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
