<script setup lang="ts">
import { computed } from 'vue';
import FilterBar from '@/shared/ui/FilterBar.vue';

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
  <FilterBar
    :account-uid="filter.accountUid"
    :contact-keyword="filter.contactKeyword"
    :loading="loading"
    @update:account-uid="(v: string) => patch('accountUid', v)"
    @update:contact-keyword="(v: string) => patch('contactKeyword', v)"
    @refresh="emit('refresh')"
    @reset="emit('reset')"
  >
    <el-form-item label="账户类型">
      <el-select
        :model-value="filter.type"
        @update:model-value="(v: AccountListFilter['type']) => patch('type', v)"
      >
        <el-option label="全部类型" value="all" />
        <el-option v-for="t in accountTypeValues" :key="t" :label="accountTypeLabel[t]" :value="t" />
      </el-select>
    </el-form-item>
    <el-form-item label="状态">
      <el-select
        :model-value="filter.status"
        @update:model-value="(v: AccountListFilter['status']) => patch('status', v)"
      >
        <el-option label="全部状态" value="all" />
        <el-option
          v-for="s in accountStatusValues"
          :key="s"
          :label="accountStatusLabel[s]"
          :value="s"
        />
      </el-select>
    </el-form-item>
  </FilterBar>
</template>
