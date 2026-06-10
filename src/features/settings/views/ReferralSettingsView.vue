<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Refresh } from '@element-plus/icons-vue';

import EmptyState from '@/shared/ui/EmptyState.vue';
import { clientPaginate, usePagination } from '@/shared/composables/usePagination';
import { formatDateTime } from '@/shared/lib/date';
import type {
  ReferralProductRate,
  ReferralSettingsAdmin,
  UpdateReferralSettingsInput,
} from '../model/settings.types';
import { getReferralSettingsPort } from '../services';

const port = getReferralSettingsPort();
const loading = ref(false);
const saving = ref(false);
const snapshot = ref<string>('');
const rows = ref<ReferralProductRate[]>([]);
const pagination = usePagination({ pageSize: 20 });
const displayRows = computed(() =>
  clientPaginate(rows.value, pagination.state.page, pagination.state.pageSize),
);
const updatedAtUtc = ref(0);

function cloneRates(list: ReferralProductRate[]): ReferralProductRate[] {
  return list.map((r) => ({ ...r }));
}

function applyStatus(status: ReferralSettingsAdmin): void {
  rows.value = cloneRates(status.productRates);
  pagination.setTotal(rows.value.length);
  updatedAtUtc.value = status.updatedAtUtc;
  snapshot.value = JSON.stringify(rows.value);
}

const isDirty = computed(() => snapshot.value !== '' && snapshot.value !== JSON.stringify(rows.value));

async function load(): Promise<void> {
  loading.value = true;
  try {
    const r = await port.get();
    if (r.success) applyStatus(r.data);
    else ElMessage.error(r.error.message);
  } finally {
    loading.value = false;
  }
}

async function save(): Promise<void> {
  saving.value = true;
  try {
    const payload: UpdateReferralSettingsInput = {
      productRates: cloneRates(rows.value),
    };
    const r = await port.update(payload);
    if (r.success) {
      ElMessage.success('返利设置已保存');
      applyStatus(r.data);
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    saving.value = false;
  }
}

onMounted(() => load());
</script>

<template>
  <div class="settings-panel">
    <header class="settings-panel__head">
      <div>
        <h3 class="settings-panel__title">返利设置</h3>
        <p class="settings-panel__desc">
          按注册产品 / 渠道分别配置返利率与提现规则，产品列表与配置由后端返回
        </p>
      </div>
      <div class="settings-panel__head-actions">
        <span v-if="updatedAtUtc" class="settings-panel__meta">
          最近更新 {{ formatDateTime(updatedAtUtc) }}
        </span>
        <el-button :icon="Refresh" text @click="load">刷新</el-button>
      </div>
    </header>

    <div class="settings-panel__body">
      <div class="settings-panel__table-wrap">
      <el-table
        v-loading="loading"
        :data="displayRows"
        row-key="productCode"
        size="small"
        class="compact-table"
        height="100%"
        :empty-text="' '"
      >
        <el-table-column label="产品 / 渠道" min-width="200">
          <template #default="{ row }: { row: ReferralProductRate }">
            <div class="cell-product">
              <span class="cell-product__name">{{ row.productName }}</span>
              <span class="cell-product__code">{{ row.productCode }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="启用返利" width="100">
          <template #default="{ row }: { row: ReferralProductRate }">
            <el-switch v-model="row.enabled" />
          </template>
        </el-table-column>
        <el-table-column label="返利率（%）" width="170">
          <template #default="{ row }: { row: ReferralProductRate }">
            <el-input-number
              v-model="row.rebateRatePercent"
              :min="0"
              :max="100"
              :precision="1"
              :step="0.5"
              :disabled="!row.enabled"
              size="small"
              controls-position="right"
              style="width: 140px"
            />
          </template>
        </el-table-column>
        <el-table-column label="最低提现金额（元）" width="190">
          <template #default="{ row }: { row: ReferralProductRate }">
            <el-input-number
              v-model="row.minWithdrawAmount"
              :min="0"
              :precision="2"
              :step="10"
              :disabled="!row.enabled"
              size="small"
              controls-position="right"
              style="width: 150px"
            />
          </template>
        </el-table-column>
        <el-table-column label="提现需人工审核" width="140" align="center">
          <template #default="{ row }: { row: ReferralProductRate }">
            <el-switch v-model="row.withdrawReviewRequired" :disabled="!row.enabled" />
          </template>
        </el-table-column>

        <template #empty>
          <EmptyState
            title="暂无产品配置"
            description="请先在「计费产品」中注册产品，或点击刷新拉取最新配置。"
          />
        </template>
      </el-table>
      </div>

      <div class="settings-panel__pagination">
        <el-pagination
          v-model:current-page="pagination.state.page"
          v-model:page-size="pagination.state.pageSize"
          :total="pagination.state.total"
          :page-sizes="pagination.pageSizes"
          layout="total, sizes, prev, pager, next"
          background
        />
      </div>
    </div>

    <footer class="settings-panel__footer">
      <el-button type="primary" :disabled="!isDirty" :loading="saving" @click="save">
        保存设置
      </el-button>
    </footer>
  </div>
</template>

<style scoped>
.settings-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.settings-panel__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 24px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.settings-panel__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.settings-panel__desc {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.settings-panel__head-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.settings-panel__meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.settings-panel__body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 16px 24px 0;
  display: flex;
  flex-direction: column;
}

.settings-panel__table-wrap {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.settings-panel__pagination {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  padding: 12px 0;
  border-top: 1px solid var(--el-border-color-lighter);
}

.cell-product {
  display: flex;
  flex-direction: column;
  line-height: 1.35;
}

.cell-product__name {
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.cell-product__code {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  margin-top: 2px;
}

.settings-panel__footer {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 24px;
  border-top: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
}
</style>
