<script setup lang="ts">
/**
 * 错误码 TOP —— 横向条形列表（已在 mock/server 端 TOP-N + other 合并）。
 */
import { computed } from 'vue';

import type { LogStatsErrorCode } from '../../model/log.types';
import Panel from './Panel.vue';

const props = defineProps<{ items: LogStatsErrorCode[] }>();

const maxCount = computed(() => props.items.reduce((m, e) => Math.max(m, e.count), 0));
</script>

<template>
  <Panel title="错误码 TOP">
    <ul v-if="items.length > 0" class="barlist">
      <li v-for="e in items" :key="e.code" class="barlist__item">
        <div class="barlist__row">
          <span class="barlist__label mono">{{ e.code }}</span>
          <span class="barlist__value num">{{ e.count.toLocaleString() }}</span>
        </div>
        <div class="barlist__track">
          <div
            class="barlist__fill"
            :style="{ width: `${maxCount === 0 ? 0 : (e.count / maxCount) * 100}%` }"
          />
        </div>
      </li>
    </ul>
    <div v-else class="empty">范围内无错误</div>
  </Panel>
</template>

<style scoped>
.barlist {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.barlist__row {
  display: flex;
  justify-content: space-between;
  font-size: 12.5px;
  margin-bottom: 4px;
}
.barlist__label {
  color: var(--el-text-color-primary);
}
.barlist__value {
  color: var(--el-text-color-secondary);
}
.barlist__track {
  height: 6px;
  background: var(--el-fill-color-light);
  border-radius: 3px;
  overflow: hidden;
}
.barlist__fill {
  height: 100%;
  background: #ef4444;
  border-radius: 3px;
  transition: width 200ms ease;
}
.mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
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
