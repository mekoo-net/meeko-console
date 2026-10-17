<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';

import PageHeader from '@/shared/ui/PageHeader.vue';

import RedemptionCodeDrawer from '../components/RedemptionCodeDrawer.vue';
import RedemptionCodesPanel from '../components/RedemptionCodesPanel.vue';
import '../components/redemptionPanel.css';
import { codeStatusValues, type CodeStatus, type RedemptionBatch, type RedemptionCode } from '../model/redemption.types';
import { getRedemptionPort } from '../services';

const route = useRoute();
const port = getRedemptionPort();

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
/** 其他页面带 query 跳过来，如账户详情「查此人兑换的卡密」→ ?accountUid=。 */
const initial = {
  batchId: str(route.query.batchId),
  accountUid: str(route.query.accountUid),
  ip: str(route.query.ip),
  status: codeStatusValues.includes(route.query.status as CodeStatus) ? (route.query.status as CodeStatus) : undefined,
};

const batchOptions = ref<Pick<RedemptionBatch, 'id' | 'name'>[]>([]);
const panel = ref<InstanceType<typeof RedemptionCodesPanel> | null>(null);
const drawerVisible = ref(false);
const activeCode = ref<RedemptionCode | null>(null);

function openCode(c: RedemptionCode): void {
  activeCode.value = c;
  drawerVisible.value = true;
}

onMounted(async () => {
  const r = await port.listBatchOptions();
  if (r.success) batchOptions.value = r.data;
});
</script>

<template>
  <div class="rd-page">
    <PageHeader title="兑换记录" />
    <RedemptionCodesPanel
      ref="panel"
      :batch-options="batchOptions"
      :initial="initial"
      @open="openCode"
    />
    <RedemptionCodeDrawer
      v-model:visible="drawerVisible"
      :code="activeCode"
      @changed="panel?.reload()"
    />
  </div>
</template>
