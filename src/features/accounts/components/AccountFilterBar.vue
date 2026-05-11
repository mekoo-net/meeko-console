<script setup lang="ts">
import { computed } from 'vue';
import { Refresh, Search } from '@element-plus/icons-vue';

import {
  accountStatusLabel,
  accountStatusValues,
  accountTypeLabel,
  accountTypeValues,
  type AccountListFilter,
} from '../model/account.types';

const props = defineProps<{ modelValue: AccountListFilter; loading: boolean }>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: AccountListFilter): void;
  (e: 'refresh'): void;
  (e: 'reset'): void;
}>();

const filter = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

function patch<K extends keyof AccountListFilter>(key: K, value: AccountListFilter[K]): void {
  filter.value = { ...filter.value, [key]: value };
}
</script>

<template>
  <div class="filter">
    <el-input
      :model-value="filter.keyword"
      :prefix-icon="Search"
      placeholder="搜索名称、slug 或 UID"
      clearable
      style="max-width: 280px"
      @update:model-value="(v: string | undefined) => patch('keyword', v ?? '')"
    />
    <el-select
      :model-value="filter.type"
      placeholder="账户类型"
      style="width: 140px"
      @update:model-value="(v: AccountListFilter['type']) => patch('type', v)"
    >
      <el-option label="全部类型" value="all" />
      <el-option v-for="t in accountTypeValues" :key="t" :label="accountTypeLabel[t]" :value="t" />
    </el-select>
    <el-select
      :model-value="filter.status"
      placeholder="状态"
      style="width: 140px"
      @update:model-value="(v: AccountListFilter['status']) => patch('status', v)"
    >
      <el-option label="全部状态" value="all" />
      <el-option v-for="s in accountStatusValues" :key="s" :label="accountStatusLabel[s]" :value="s" />
    </el-select>
    <el-button :icon="Refresh" :loading="loading" @click="emit('refresh')">刷新</el-button>
    <el-button text @click="emit('reset')">重置</el-button>
  </div>
</template>

<style scoped>
.filter {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
</style>
