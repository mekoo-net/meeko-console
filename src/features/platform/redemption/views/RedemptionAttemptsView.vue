<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';

import PageHeader from '@/shared/ui/PageHeader.vue';

import RedemptionAttemptsPanel from '../components/RedemptionAttemptsPanel.vue';
import RedemptionCodeDrawer from '../components/RedemptionCodeDrawer.vue';
import '../components/redemptionPanel.css';
import {
  attemptResultValues,
  type AttemptResult,
  type AttemptResultFilter,
  type RedemptionBatch,
  type RedemptionCode,
} from '../model/redemption.types';
import { getRedemptionPort } from '../services';

const route = useRoute();
const port = getRedemptionPort();

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
const rawResult = route.query.result as string | undefined;
/** 概览卡片「24h 失败尝试」带 ?result=failed，批次弹窗带 ?batchId=。 */
const initial = {
  result:
    rawResult === 'failed' || attemptResultValues.includes(rawResult as AttemptResult)
      ? (rawResult as AttemptResultFilter)
      : undefined,
  accountUid: str(route.query.accountUid),
  ip: str(route.query.ip),
  batchId: str(route.query.batchId),
};

const batchOptions = ref<Pick<RedemptionBatch, 'id' | 'name'>[]>([]);
const panel = ref<InstanceType<typeof RedemptionAttemptsPanel> | null>(null);
const drawerVisible = ref(false);
const activeCode = ref<RedemptionCode | null>(null);

async function openCode(codeId: string): Promise<void> {
  const r = await port.getCode(codeId);
  if (!r.success) {
    ElMessage.error(r.error.message);
    return;
  }
  activeCode.value = r.data;
  drawerVisible.value = true;
}

onMounted(async () => {
  const r = await port.listBatchOptions();
  if (r.success) batchOptions.value = r.data;
});
</script>

<template>
  <div class="rd-page">
    <PageHeader title="兑换日志" />
    <RedemptionAttemptsPanel
      ref="panel"
      :batch-options="batchOptions"
      :initial="initial"
      @open-code="openCode"
    />
    <RedemptionCodeDrawer
      v-model:visible="drawerVisible"
      :code="activeCode"
      @changed="panel?.reload()"
    />
  </div>
</template>
