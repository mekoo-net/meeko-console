<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RefreshLeft, Search } from '@element-plus/icons-vue';

import StatusTag from '@/shared/ui/StatusTag.vue';
import { formatDateTime } from '@/shared/lib/date';

import {
  BusinessStatusLabel,
  BusinessStatusTone,
  businessStatusValues,
  type BusinessInstance,
  type BusinessStatus,
} from '../model/business.types';
import { getBillingPort } from '../services';

const props = defineProps<{ accountUid: string }>();

const billingPort = getBillingPort();
const items = ref<BusinessInstance[]>([]);
const loading = ref(false);
const statusFilter = ref<BusinessStatus | 'all'>('all');

async function fetchData(): Promise<void> {
  loading.value = true;
  try {
    const r = await billingPort.listBusinesses(props.accountUid, { status: statusFilter.value });
    if (r.success) items.value = r.data;
  } finally {
    loading.value = false;
  }
}

function resetFilter(): void {
  statusFilter.value = 'all';
}

watch(statusFilter, () => void fetchData());
watch(() => props.accountUid, () => void fetchData());

onMounted(() => void fetchData());

const empty = computed(() => !loading.value && items.value.length === 0);
</script>

<template>
  <div class="tab-section">
    <div class="tab-filter">
      <el-form :inline="true" @submit.prevent>
        <el-form-item label="状态">
          <el-select v-model="statusFilter" style="width: 200px">
            <el-option label="全部状态" value="all" />
            <el-option
              v-for="s in businessStatusValues"
              :key="s"
              :label="BusinessStatusLabel[s]"
              :value="s"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <div class="tab-filter__actions">
        <el-button type="primary" :icon="Search" :loading="loading" @click="fetchData()">
          查询
        </el-button>
        <el-button :icon="RefreshLeft" @click="resetFilter()">重置</el-button>
      </div>
    </div>

    <el-table
      v-loading="loading"
      :data="items"
      row-key="uid"
      size="small"
      class="compact-table"
      empty-text="该账户暂未开通任何业务"
    >
      <el-table-column label="业务" min-width="220">
        <template #default="{ row }: { row: BusinessInstance }">
          <div class="cell-business">
            <span class="cell-business__name">{{ row.productName }}</span>
            <span class="cell-business__code">{{ row.productCode }}</span>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="状态" width="110">
        <template #default="{ row }: { row: BusinessInstance }">
          <StatusTag
            :label="BusinessStatusLabel[row.status]"
            :tone="BusinessStatusTone[row.status]"
          />
        </template>
      </el-table-column>

      <el-table-column label="开通时间" width="170">
        <template #default="{ row }: { row: BusinessInstance }">
          <span class="cell-date">{{ formatDateTime(row.openedAtUtc) }}</span>
        </template>
      </el-table-column>

      <el-table-column label="当前期到期" width="170">
        <template #default="{ row }: { row: BusinessInstance }">
          <span v-if="row.currentPeriodEndUtc" class="cell-date">
            {{ formatDateTime(row.currentPeriodEndUtc) }}
          </span>
          <span v-else class="cell-muted">—</span>
        </template>
      </el-table-column>

      <el-table-column label="暂停时间" width="170">
        <template #default="{ row }: { row: BusinessInstance }">
          <span v-if="row.pausedAtUtc" class="cell-date">
            {{ formatDateTime(row.pausedAtUtc) }}
          </span>
          <span v-else class="cell-muted">—</span>
        </template>
      </el-table-column>

      <el-table-column label="停止时间" width="170">
        <template #default="{ row }: { row: BusinessInstance }">
          <span v-if="row.stoppedAtUtc" class="cell-date">
            {{ formatDateTime(row.stoppedAtUtc) }}
          </span>
          <span v-else class="cell-muted">—</span>
        </template>
      </el-table-column>
    </el-table>

    <div v-if="empty" class="tab-section__empty" />
  </div>
</template>

<style scoped>
.tab-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.tab-filter {
  display: flex;
  align-items: center;
  background: #fff;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 14px 18px;
}
.tab-filter :deep(.el-form) {
  flex: 1;
}
.tab-filter :deep(.el-form-item) {
  margin: 0 16px 0 0;
}
.tab-filter :deep(.el-form-item__label) {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-regular);
}
.tab-filter__actions {
  display: flex;
  gap: 10px;
  margin-left: auto;
}
.cell-business {
  display: flex;
  flex-direction: column;
  line-height: 1.35;
}
.cell-business__name {
  font-weight: 500;
  color: var(--el-text-color-primary);
}
.cell-business__code {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  margin-top: 2px;
}
</style>
