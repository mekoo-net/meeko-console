<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus, Refresh } from '@element-plus/icons-vue';

import PageHeader from '@/shared/ui/PageHeader.vue';

import RedemptionBatchFormDrawer from '../components/RedemptionBatchFormDrawer.vue';
import RedemptionBatchDialog from '../components/RedemptionBatchDialog.vue';
import RedemptionBatchesPanel from '../components/RedemptionBatchesPanel.vue';
import RedemptionKeysDialog from '../components/RedemptionKeysDialog.vue';
import RedemptionOverviewStrip from '../components/RedemptionOverviewStrip.vue';
import '../components/redemptionPanel.css';
import type { KeysPayload, PlainCodes, PlainMode, RedemptionBatch, RedemptionOverview } from '../model/redemption.types';
import { getRedemptionPort } from '../services';

const port = getRedemptionPort();

const overview = ref<RedemptionOverview | null>(null);
const refreshing = ref(false);

const batchesPanel = ref<InstanceType<typeof RedemptionBatchesPanel> | null>(null);

const formVisible = ref(false);
/** null = 生成新批次；有值 = 编辑该批次。 */
const formBatch = ref<RedemptionBatch | null>(null);
const keysVisible = ref(false);
const keysPayload = ref<KeysPayload | null>(null);
const keysMode = ref<PlainMode>('created');

const batchDialogVisible = ref(false);
const activeBatch = ref<RedemptionBatch | null>(null);

async function loadOverview(): Promise<void> {
  const r = await port.overview();
  if (r.success) overview.value = r.data;
  else ElMessage.error(r.error.message);
}

async function refreshAll(): Promise<void> {
  refreshing.value = true;
  try {
    await Promise.all([loadOverview(), batchesPanel.value?.reload()]);
  } finally {
    refreshing.value = false;
  }
}

function showKeys(payload: KeysPayload, mode: PlainMode): void {
  keysPayload.value = payload;
  keysMode.value = mode;
  keysVisible.value = true;
}

function openBatch(b: RedemptionBatch): void {
  activeBatch.value = b;
  batchDialogVisible.value = true;
}

/** 批次动作发生在面板或弹窗里，这里只负责让 KPI 和列表跟上。 */
function onBatchChanged(): void {
  void loadOverview();
  void batchesPanel.value?.reload();
}

function openCreate(): void {
  formBatch.value = null;
  formVisible.value = true;
}

function openEdit(b: RedemptionBatch): void {
  formBatch.value = b;
  formVisible.value = true;
}

function onUpdated(payload: PlainCodes): void {
  if (payload.codes.length) showKeys(payload, 'appended');
  else ElMessage.success('已保存');
  if (activeBatch.value?.id === payload.batch.id) activeBatch.value = payload.batch;
  onBatchChanged();
}

function onCreated(payload: PlainCodes): void {
  showKeys(payload, 'created');
  void loadOverview();
  void batchesPanel.value?.reload();
}

onMounted(() => {
  void loadOverview();
});
</script>

<template>
  <div class="rd-page">
    <PageHeader
      title="兑换码批次"
    >
      <template #actions>
        <el-button
          :icon="Refresh"
          :loading="refreshing"
          @click="refreshAll"
        >
          刷新
        </el-button>
        <el-button
          type="primary"
          :icon="Plus"
          @click="openCreate"
        >
          批量生成
        </el-button>
      </template>
    </PageHeader>

    <RedemptionOverviewStrip :overview="overview" />

    <RedemptionBatchesPanel
      ref="batchesPanel"
      @open="openBatch"
      @edit="openEdit"
      @plain="showKeys"
      @changed="loadOverview"
    />

    <RedemptionBatchFormDrawer
      v-model:visible="formVisible"
      :batch="formBatch"
      @created="onCreated"
      @updated="onUpdated"
    />

    <RedemptionBatchDialog
      v-model:visible="batchDialogVisible"
      :batch="activeBatch"
      @plain="showKeys"
      @edit="openEdit"
      @changed="onBatchChanged"
    />

    <RedemptionKeysDialog
      v-if="keysPayload"
      v-model:visible="keysVisible"
      :payload="keysPayload"
      :mode="keysMode"
      @closed="keysPayload = null"
    />
  </div>
</template>
