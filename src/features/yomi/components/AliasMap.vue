<script setup lang="ts">
/**
 * 对外别名。和上游注册名不同时，第二行用映射箭头标出实际模型。
 */
import { Right } from '@element-plus/icons-vue';

defineProps<{
  alias: string;
  target: string;
}>();
</script>

<template>
  <div class="alias-map">
    <div class="alias-map__name">{{ alias }}</div>
    <div v-if="target !== alias" class="alias-map__to">
      <el-tooltip content="映射到实际模型" placement="top" :show-after="300">
        <span class="alias-map__icon">
          <el-icon :size="12"><Right /></el-icon>
        </span>
      </el-tooltip>
      <span class="alias-map__target">{{ target }}</span>
    </div>
  </div>
</template>

<style scoped>
.alias-map {
  min-width: 0;
}
.alias-map__name {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: -0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.alias-map__to {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  margin-top: 3px;
}
.alias-map__icon {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-placeholder);
}
.alias-map__target {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
