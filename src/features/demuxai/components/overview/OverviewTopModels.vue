<script setup lang="ts">
/**
 * Top 模型排行：调用量条形 + 扣费 + 失败率。
 */
import { computed } from 'vue';

import { formatMoney } from '@/shared/lib/money';

import type { LogStatsTopModel } from '../../model/log.types';
import Panel from './Panel.vue';
import { pct } from './chartUtils';

const props = defineProps<{ items: LogStatsTopModel[] }>();

const maxCalls = computed(() => props.items.reduce((m, x) => Math.max(m, x.calls), 0));
</script>

<template>
  <Panel title="Top 模型">
    <template #actions>
      <span class="hint">按调用量降序 · 显示前 5</span>
    </template>

    <table v-if="items.length > 0" class="rank-table">
      <thead>
        <tr>
          <th class="col--name">modelId</th>
          <th class="col--bar">调用量</th>
          <th class="col--num">扣费</th>
          <th class="col--num">失败率</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="m in items" :key="m.modelId">
          <td class="rank-table__name">
            <span class="mono">{{ m.modelId }}</span>
          </td>
          <td class="rank-table__bar">
            <div class="bar-inline">
              <div
                class="bar-inline__fill"
                :style="{
                  width: `${maxCalls === 0 ? 0 : (m.calls / maxCalls) * 100}%`,
                }"
              />
              <span class="bar-inline__value num">{{ m.calls.toLocaleString() }}</span>
            </div>
          </td>
          <td class="rank-table__num cell-money">{{ formatMoney(m.cost) }}</td>
          <td
            class="rank-table__num num"
            :class="{ 'num--danger': m.errorRate > 0.05 }"
          >
            {{ pct(m.errorRate) }}
          </td>
        </tr>
      </tbody>
    </table>
    <div v-else class="empty">暂无数据</div>
  </Panel>
</template>

<style scoped>
.hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.rank-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.rank-table thead th {
  font-weight: 500;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  text-align: left;
  padding: 4px 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.rank-table tbody td {
  padding: 10px 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  vertical-align: middle;
}
.rank-table tbody tr:last-child td {
  border-bottom: none;
}
.col--num {
  text-align: right;
}
.rank-table__num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.rank-table__name {
  color: var(--el-text-color-primary);
  font-weight: 500;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rank-table__bar {
  width: 45%;
}
.bar-inline {
  position: relative;
  height: 18px;
  background: var(--el-fill-color-lighter);
  border-radius: 3px;
  overflow: hidden;
}
.bar-inline__fill {
  height: 100%;
  background: rgba(99, 102, 241, 0.85);
  border-radius: 3px;
}
.bar-inline__value {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 6px;
  font-size: 11.5px;
  color: var(--el-text-color-primary);
  font-variant-numeric: tabular-nums;
}
.cell-money {
  color: var(--el-color-success);
  font-weight: 500;
}
.num--danger {
  color: var(--el-color-danger);
}
.num {
  font-variant-numeric: tabular-nums;
}
.mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
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
