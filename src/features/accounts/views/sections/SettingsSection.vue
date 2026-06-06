<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';

import { AccountDetailKey } from '../../composables/accountDetailContext';
import { getAccountAdminPort } from '../../services';

const ctx = inject(AccountDetailKey);
const accountPort = getAccountAdminPort();

const account = computed(() => ctx?.account.value ?? null);

const rateInput = ref<number | null>(account.value?.rebateRatePercent ?? null);
const savingRate = ref(false);

watch(
  () => account.value?.rebateRatePercent,
  (v) => {
    rateInput.value = v ?? null;
  },
);

async function saveRate(): Promise<void> {
  const uid = account.value?.uid;
  if (!uid) return;
  savingRate.value = true;
  try {
    const r = await accountPort.setReferralRate(uid, rateInput.value);
    if (r.success) {
      ElMessage.success('返利率已更新');
      ctx?.refresh();
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    savingRate.value = false;
  }
}
</script>

<template>
  <div class="settings acc-page-fill">
    <section class="panel">
      <h3 class="panel__title">激励比率</h3>
      <p class="panel__desc">设置该账户的返利率覆盖，留空则使用全局默认返利率。</p>
      <div class="setting-row">
        <div class="setting-row__label">账户返利率覆盖</div>
        <div class="setting-row__control">
          <el-input-number
            v-model="rateInput"
            :min="0"
            :max="100"
            :precision="1"
            :step="0.5"
            controls-position="right"
            placeholder="默认"
            class="rate-input"
          />
          <span class="rate-suffix">%</span>
          <el-button type="primary" :loading="savingRate" @click="saveRate">保存</el-button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.panel {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 14px;
  padding: 18px 20px;
}
.panel__title {
  margin: 0 0 6px;
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.panel__desc {
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.setting-row {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.setting-row__label {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-regular);
}
.setting-row__control {
  display: flex;
  align-items: center;
  gap: 10px;
}
.rate-input {
  width: 160px;
}
.rate-suffix {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
</style>
