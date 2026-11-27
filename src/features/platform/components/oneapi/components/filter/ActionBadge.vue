<script setup lang="ts">
/** 放行 / 拒绝。规则链上每条规则右边、默认动作那一格都用它。 */
import { CircleCheck, CircleClose } from '@element-plus/icons-vue';

import type { FilterAction } from '../../model/filter';

defineProps<{ action: FilterAction }>();
</script>

<template>
  <span
    class="action-badge"
    :class="`action-badge--${action}`"
  >
    <el-icon :size="13"><component :is="action === 'deny' ? CircleClose : CircleCheck" /></el-icon>
    {{ action === 'deny' ? '拒绝' : '放行' }}
  </span>
</template>

<style scoped>
.action-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 10px;
  border-radius: 12px;
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
}
.action-badge--deny {
  color: var(--el-color-danger);
  background: var(--el-color-danger-light-9);
}
.action-badge--allow {
  color: var(--el-color-success);
  background: var(--el-color-success-light-9);
}
</style>
