<script setup lang="ts">
/**
 * Top 模型渠道排行：调用量条形 + 失败次数 + 平均首字延迟（TTFT，单位 ms）。
 *
 * 渠道名由服务端 `providerName` 字段提供，缺失时回退为 `#providerId`。
 *
 * **延迟列含义**：仅基于有 TTFT 样本（流式 + 成功）求均值；纯图像 / 视频渠道无 TTFT，
 * 显示为 `—`，符合 `LogStatsTopProvider.avgTokenLatency` 的语义。
 */
import { computed } from 'vue';

import type { LogStatsTopProvider } from '@demux/common';
import Panel from './Panel.vue';

const props = defineProps<{
  items: LogStatsTopProvider[];
}>();

function displayName(p: LogStatsTopProvider): string {
  const name = p.providerName?.trim();
  return name || `#${p.providerId}`;
}

const maxCalls = computed(() => props.items.reduce((m, x) => Math.max(m, x.calls), 0));
</script>

<template>
  <Panel title="Top 模型渠道">
    <template #actions>
      <span class="hint">按调用量降序 · 显示前 5</span>
    </template>

    <table v-if="items.length > 0" class="rank-table">
      <thead>
        <tr>
          <th class="col--name">渠道</th>
          <th class="col--bar">调用量</th>
          <th class="col--num">失败</th>
          <th class="col--num">平均首字延迟</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="p in items" :key="p.providerId">
          <td class="rank-table__name">{{ displayName(p) }}</td>
          <td class="rank-table__bar">
            <div class="bar-inline">
              <div
                class="bar-inline__fill"
                :style="{
                  width: `${maxCalls === 0 ? 0 : (p.calls / maxCalls) * 100}%`,
                }"
              />
              <span class="bar-inline__value num">{{ p.calls.toLocaleString() }}</span>
            </div>
          </td>
          <td class="rank-table__num num" :class="{ 'num--danger': p.errors > 0 }">
            {{ p.errors.toLocaleString() }}
          </td>
          <td class="rank-table__num num">
            <span v-if="p.avgTokenLatency > 0">
              {{ p.avgTokenLatency.toLocaleString() }} ms
            </span>
            <span v-else class="muted">—</span>
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
  background: rgba(16, 185, 129, 0.85);
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
.num--danger {
  color: var(--el-color-danger);
}
.num {
  font-variant-numeric: tabular-nums;
}
.muted {
  color: var(--el-text-color-secondary);
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
