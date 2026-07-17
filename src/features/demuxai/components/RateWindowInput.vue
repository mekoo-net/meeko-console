<script setup lang="ts">
/**
 * 统计窗口输入：数值 + 单位（秒 / 分钟 / 小时）。
 * 用法：<RateWindowInput v-model:value="p.windowValue" v-model:unit="p.windowUnit" />
 */
import { windowUnits } from '@/features/demuxai/composables/useRateLimitSettings';
import type { WindowUnit } from '@/features/demuxai/model/rateLimit.types';

defineProps<{ disabled?: boolean }>();

const value = defineModel<number>('value', { required: true });
const unit = defineModel<WindowUnit>('unit', { required: true });

function onValueInput(v: string | number): void {
  const n = Number(v);
  if (Number.isFinite(n)) value.value = Math.max(1, Math.trunc(n));
}
</script>

<template>
  <el-input
    :model-value="value"
    type="number"
    :min="1"
    :disabled="disabled"
    @update:model-value="onValueInput"
  >
    <template #append>
      <el-select
        v-model="unit"
        :disabled="disabled"
        class="unit"
      >
        <el-option
          v-for="u in windowUnits"
          :key="u.value"
          :label="u.label"
          :value="u.value"
        />
      </el-select>
    </template>
  </el-input>
</template>

<style scoped>
.unit {
  width: 80px;
}
</style>
