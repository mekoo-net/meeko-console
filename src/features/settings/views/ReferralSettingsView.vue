<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Refresh } from '@element-plus/icons-vue';

import { formatDateTime } from '@/shared/lib/date';
import type {
  ReferralProductRate,
  ReferralSettingsAdmin,
  UpdateReferralSettingsInput,
} from '../model/settings.types';
import { getReferralSettingsPort } from '../services';

interface ReferralSettingsForm {
  enabled: boolean;
  defaultRebateRatePercent: number;
  minWithdrawAmount: number;
  withdrawReviewRequired: boolean;
  productRates: ReferralProductRate[];
  updatedAtUtc: number;
}

const port = getReferralSettingsPort();
const loading = ref(false);
const saving = ref(false);
const snapshot = ref<string>('');
const form = reactive<ReferralSettingsForm>({
  enabled: true,
  defaultRebateRatePercent: 5,
  minWithdrawAmount: 10,
  withdrawReviewRequired: true,
  productRates: [],
  updatedAtUtc: 0,
});

function cloneRates(rates: ReferralProductRate[]): ReferralProductRate[] {
  return rates.map((r) => ({ ...r }));
}

function serialize(): string {
  return JSON.stringify({
    enabled: form.enabled,
    defaultRebateRatePercent: form.defaultRebateRatePercent,
    minWithdrawAmount: form.minWithdrawAmount,
    withdrawReviewRequired: form.withdrawReviewRequired,
    productRates: form.productRates,
  });
}

function applyStatus(status: ReferralSettingsAdmin): void {
  form.enabled = status.enabled;
  form.defaultRebateRatePercent = status.defaultRebateRatePercent;
  form.minWithdrawAmount = status.minWithdrawAmount;
  form.withdrawReviewRequired = status.withdrawReviewRequired;
  form.productRates = cloneRates(status.productRates);
  form.updatedAtUtc = status.updatedAtUtc;
  snapshot.value = serialize();
}

const isDirty = computed(() => snapshot.value !== '' && snapshot.value !== serialize());

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
      enabled: form.enabled,
      defaultRebateRatePercent: form.defaultRebateRatePercent,
      minWithdrawAmount: form.minWithdrawAmount,
      withdrawReviewRequired: form.withdrawReviewRequired,
      productRates: cloneRates(form.productRates),
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
  <section v-loading="loading" class="settings-panel">
    <header class="settings-panel__head">
      <div>
        <h2 class="settings-panel__title">返利设置</h2>
        <p class="settings-panel__desc">配置全局邀请返利策略、各注册产品返利率与提现规则</p>
      </div>
      <el-button :icon="Refresh" plain @click="load">刷新</el-button>
    </header>

    <el-form label-position="top" class="settings-panel__form">
      <el-form-item label="启用邀请返利">
        <el-switch v-model="form.enabled" />
      </el-form-item>

      <el-form-item label="默认返利率（%）">
        <el-input-number
          v-model="form.defaultRebateRatePercent"
          :min="0"
          :max="100"
          :precision="1"
          :step="0.5"
          controls-position="right"
        />
        <p class="field-hint">未在下方单独配置的注册产品，按此默认返利率结算</p>
      </el-form-item>

      <el-form-item label="最低提现金额（元）">
        <el-input-number
          v-model="form.minWithdrawAmount"
          :min="0"
          :precision="2"
          :step="10"
          controls-position="right"
        />
      </el-form-item>

      <el-form-item label="提现需人工审核">
        <el-switch v-model="form.withdrawReviewRequired" />
        <p class="field-hint">开启后用户提现申请需后台审核并手动打款</p>
      </el-form-item>
    </el-form>

    <div class="product-rates">
      <h3 class="product-rates__title">按产品 / 渠道细分返利率</h3>
      <p class="product-rates__desc">针对不同注册产品设置独立返利率，例如 DemuxAI 返利 5%。</p>
      <el-table :data="form.productRates" size="small" class="compact-table" empty-text="暂无产品配置">
        <el-table-column label="产品 / 渠道" min-width="200">
          <template #default="{ row }: { row: ReferralProductRate }">
            <div class="cell-product">
              <span class="cell-product__name">{{ row.productName }}</span>
              <span class="cell-product__code">{{ row.productCode }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="启用返利" width="120">
          <template #default="{ row }: { row: ReferralProductRate }">
            <el-switch v-model="row.enabled" />
          </template>
        </el-table-column>
        <el-table-column label="返利率（%）" width="200">
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
              style="width: 150px"
            />
          </template>
        </el-table-column>
      </el-table>
    </div>

    <footer class="settings-panel__footer">
      <span v-if="form.updatedAtUtc" class="settings-panel__meta">
        最近更新：{{ formatDateTime(form.updatedAtUtc) }}
      </span>
      <el-button type="primary" :disabled="!isDirty" :loading="saving" @click="save">
        保存设置
      </el-button>
    </footer>
  </section>
</template>

<style scoped>
.settings-panel {
  max-width: 760px;
}
.settings-panel__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 20px;
}
.settings-panel__title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
.settings-panel__desc {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.field-hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.product-rates {
  margin-top: 8px;
}
.product-rates__title {
  margin: 0 0 4px;
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.product-rates__desc {
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.settings-panel__meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
