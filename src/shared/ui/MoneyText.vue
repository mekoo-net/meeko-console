<script setup lang="ts">
import { computed } from 'vue';

import { formatMoney, type MoneyOptions } from '@/shared/lib/money';

const props = defineProps<{
  value: number | string | null | undefined;
  options?: MoneyOptions;
  /** 强调样式：danger 红色（扣款），success 绿色（入账）。 */
  tone?: 'default' | 'success' | 'danger';
}>();

const text = computed(() => formatMoney(props.value, props.options));

const className = computed(() => {
  switch (props.tone) {
    case 'success':
      return 'money money--success';
    case 'danger':
      return 'money money--danger';
    default:
      return 'money';
  }
});
</script>

<template>
  <span :class="className">{{ text }}</span>
</template>

<style scoped>
.money {
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum';
}
.money--success {
  color: #16a34a;
}
.money--danger {
  color: #dc2626;
}
</style>
