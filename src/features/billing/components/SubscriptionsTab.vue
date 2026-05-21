<script setup lang="ts">
import { ElMessage } from 'element-plus';
import { computed, toRef, unref } from 'vue';

import DataTableShell from '@/shared/ui/DataTableShell.vue';
import StatusTag from '@/shared/ui/StatusTag.vue';
import { confirmDanger } from '@/shared/composables/useConfirm';
import { formatDateTime } from '@/shared/lib/date';

import {
  SubscriptionPeriodLabel,
  SubscriptionStatusLabel,
  SubscriptionStatusTone,
} from '../model/billingEnums';
import type { SubscriptionDto } from '../model/billing.types';
import type { SubscriptionStatus } from '../model/billingEnums';
import { useSubscriptionList } from '../composables/useSubscriptionList';
import { getBillingPort } from '../services';

const props = defineProps<{ accountUid: string | null }>();

const uidRef = toRef(props, 'accountUid');
const subs = useSubscriptionList(uidRef);

const loading = computed(() => unref(subs.loading));
const error = computed(() => unref(subs.error));
const rows = computed(() => unref(subs.data) ?? []);

function periodLabel(row: SubscriptionDto): string {
  return SubscriptionPeriodLabel[row.period];
}

function statusLabel(s: SubscriptionStatus): string {
  return SubscriptionStatusLabel[s];
}

function statusTone(s: SubscriptionStatus): 'success' | 'info' | 'warning' | 'danger' | 'primary' {
  return SubscriptionStatusTone[s];
}

async function toggleCancel(
  row: { id: string; cancelAtPeriodEnd: boolean },
  next: boolean,
): Promise<void> {
  const ok = await confirmDanger({
    title: '变更续订策略',
    message: next
      ? '确定在当前周期结束后取消订阅吗？'
      : '确定恢复自动续订（取消「期末取消」）吗？',
    type: 'warning',
  });
  if (!ok) return;
  const r = await getBillingPort().setSubscriptionCancelAtPeriodEnd(row.id, next);
  if (r.success) {
    ElMessage.success('已更新');
    void subs.run();
  } else {
    ElMessage.error(r.error.message);
  }
}
</script>

<template>
  <DataTableShell
    :loading="loading"
    :error="error"
    :items="rows"
    empty-title="暂无订阅"
  >
    <template #toolbar>
      <el-button :disabled="!accountUid" @click="subs.run()">刷新</el-button>
    </template>

    <el-table :data="rows" stripe style="width: 100%">
      <el-table-column prop="id" label="订阅 ID" min-width="140" />
      <el-table-column prop="productCode" label="商品" min-width="120" />
      <el-table-column label="周期" width="88">
        <template #default="{ row }">{{ periodLabel(row) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="120">
        <template #default="{ row }">
          <StatusTag :label="statusLabel(row.status)" :tone="statusTone(row.status)" />
        </template>
      </el-table-column>
      <el-table-column label="当前周期">
        <template #default="{ row }">
          {{ formatDateTime(row.currentPeriodStartUtc) }} — {{ formatDateTime(row.currentPeriodEndUtc) }}
        </template>
      </el-table-column>
      <el-table-column label="下期账单">
        <template #default="{ row }">{{ formatDateTime(row.nextBillingAtUtc) }}</template>
      </el-table-column>
      <el-table-column label="期末取消" width="200">
        <template #default="{ row }">
          <el-button
            v-if="!row.cancelAtPeriodEnd"
            link
            type="warning"
            :disabled="!accountUid"
            @click="toggleCancel(row, true)"
          >
            设为期末取消
          </el-button>
          <el-button
            v-else
            link
            type="primary"
            :disabled="!accountUid"
            @click="toggleCancel(row, false)"
          >
            恢复续订
          </el-button>
        </template>
      </el-table-column>
    </el-table>
  </DataTableShell>
</template>
