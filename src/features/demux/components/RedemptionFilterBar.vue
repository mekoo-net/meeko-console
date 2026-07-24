<script setup lang="ts">
import { RefreshLeft, Search } from '@element-plus/icons-vue';

import type { RedemptionCodeKind, RedemptionStatus } from '../model/redemption.types';
import { RedemptionStatusLabel } from '../model/redemptionEnums';

const keyword = defineModel<string>('keyword', { required: true });
const status = defineModel<RedemptionStatus | 'all'>('status', { required: true });
const kind = defineModel<RedemptionCodeKind>('kind', { required: true });

defineProps<{ loading: boolean }>();

const emit = defineEmits<{
  (e: 'refresh'): void;
  (e: 'reset'): void;
}>();

const kindOptions = [
  { label: '全部', value: 'all' as const },
  { label: '活动码', value: 'shared' as const },
  { label: '一次性', value: 'single' as const },
];

const statusOptions: Array<{ value: RedemptionStatus | 'all'; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 1, label: RedemptionStatusLabel[1] },
  { value: 2, label: RedemptionStatusLabel[2] },
  { value: 3, label: RedemptionStatusLabel[3] },
  { value: 4, label: RedemptionStatusLabel[4] },
];
</script>

<template>
  <el-form label-width="72px" class="filter-bar" @submit.prevent="emit('refresh')">
    <div class="filter-bar__row">
      <el-form-item label="关键字">
        <el-input
          v-model="keyword"
          :prefix-icon="Search"
          placeholder="批次名称 / 激活码 / 创建人"
          clearable
          @keyup.enter="emit('refresh')"
        />
      </el-form-item>
      <el-form-item label="类型">
        <el-radio-group v-model="kind" size="small">
          <el-radio-button
            v-for="opt in kindOptions"
            :key="opt.value"
            :value="opt.value"
          >
            {{ opt.label }}
          </el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="status" placeholder="全部状态">
          <el-option
            v-for="opt in statusOptions"
            :key="String(opt.value)"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </el-form-item>
      <div class="filter-bar__actions">
        <el-button type="primary" :icon="Search" :loading="loading" native-type="submit">
          查询
        </el-button>
        <el-button :icon="RefreshLeft" @click="emit('reset')">重置</el-button>
      </div>
    </div>
  </el-form>
</template>

<style scoped>
.filter-bar {
  background: #fff;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 18px 20px;
}
.filter-bar__row {
  display: flex;
  align-items: center;
  gap: 28px;
  flex-wrap: wrap;
}
.filter-bar :deep(.el-form-item) {
  margin: 0;
  flex-shrink: 0;
}
.filter-bar :deep(.el-form-item__label) {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-regular);
}
.filter-bar :deep(.el-form-item__content > .el-input),
.filter-bar :deep(.el-form-item__content > .el-select) {
  width: 240px;
}
.filter-bar__actions {
  margin-left: auto;
  display: flex;
  gap: 10px;
}
</style>
