<script setup lang="ts">
/**
 * Tavern 系统设置 › 市场分成：平台抽成和卖家所得的积分换算。改了只影响之后成交的单，已成的单行上有当时的快照。
 */
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Refresh } from '@element-plus/icons-vue';

import PageHeader from '@/shared/ui/PageHeader.vue';
import { formatDateTime } from '@/shared/lib/date';

import type { MarketSettingsView } from '../../model/market.types';
import { getTavernMarketPort } from '../../services';

const port = getTavernMarketPort();

const view = ref<MarketSettingsView | null>(null);
/** 表单里抽成按百分比填，存的是 0–1。 */
const form = ref({ commissionPercent: 30, creditsPerYuan: 100 });
const loading = ref(false);
const saving = ref(false);

function fill(v: MarketSettingsView): void {
  view.value = v;
  form.value = {
    commissionPercent: Math.round(v.settings.commissionRate * 1000) / 10,
    creditsPerYuan: v.settings.creditsPerYuan,
  };
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    const r = await port.settings();
    if (r.success) fill(r.data);
    else ElMessage.error(r.error.message);
  } finally {
    loading.value = false;
  }
}

async function save(): Promise<void> {
  saving.value = true;
  try {
    const r = await port.saveSettings({
      commissionRate: form.value.commissionPercent / 100,
      creditsPerYuan: form.value.creditsPerYuan,
    });
    if (!r.success) {
      ElMessage.error(r.error.message);
      return;
    }
    fill(r.data);
    ElMessage.success('已保存');
  } finally {
    saving.value = false;
  }
}

onMounted(() => void load());
</script>

<template>
  <div
    v-loading="loading && !view"
    class="market-settings"
  >
    <PageHeader
      title="市场分成"
      description="买家付人民币进平台钱包；平台抽成之后，剩下的按换算比例记成卖家的积分。"
    >
      <template #actions>
        <el-button
          :icon="Refresh"
          :disabled="loading || saving"
          @click="load"
        >
          刷新
        </el-button>
      </template>
    </PageHeader>

    <section class="market-settings__card">
      <el-form
        label-width="120px"
        @submit.prevent
      >
        <el-form-item label="平台抽成">
          <el-input-number
            v-model="form.commissionPercent"
            :min="0"
            :max="100"
            :precision="1"
            :step="5"
            controls-position="right"
          />
          <span class="unit">%</span>
        </el-form-item>
        <el-form-item label="每 1 元换算">
          <el-input-number
            v-model="form.creditsPerYuan"
            :min="0.01"
            :precision="2"
            :step="10"
            controls-position="right"
          />
          <span class="unit">积分</span>
        </el-form-item>
        <el-form-item>
          <el-button
            type="primary"
            :loading="saving"
            @click="save"
          >
            保存
          </el-button>
          <span
            v-if="view"
            class="meta"
          >{{ view.updatedAt != null ? `最近更新 ${formatDateTime(view.updatedAt)}` : '还没配过，现在用的是默认值' }}</span>
        </el-form-item>
      </el-form>
    </section>
  </div>
</template>

<style scoped>
.market-settings {
  padding: 0 4px 24px;
}

.market-settings__card {
  max-width: 560px;
  padding: 20px 24px 4px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}

.unit {
  margin-left: 8px;
  color: var(--el-text-color-secondary);
}

.meta {
  margin-left: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
