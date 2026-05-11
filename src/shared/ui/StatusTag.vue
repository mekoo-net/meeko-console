<script setup lang="ts">
type Tone = 'success' | 'info' | 'warning' | 'danger' | 'primary';

defineProps<{
  /** 显示文本（标签映射后的值，不要直接 toString 枚举数字）。 */
  label: string;
  tone?: Tone;
}>();
</script>

<template>
  <el-tag :type="tone ?? 'info'" effect="light" round>{{ label }}</el-tag>
</template>
