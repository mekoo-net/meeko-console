<script setup lang="ts">
import { computed, inject, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { formatMoney } from '@/shared/lib/money';
import { formatDateTime } from '@/shared/lib/date';

import { AccountDetailKey } from '../../../composables/accountDetailContext';
import type { ReferralRebate } from '../../../model/referral.types';
import { getReferralAdminPort } from '../../../services';

const ctx = inject(AccountDetailKey);
const router = useRouter();
const referralPort = getReferralAdminPort();

const account = computed(() => ctx?.account.value ?? null);

const rebates = ref<ReferralRebate[]>([]);
const loading = ref(false);
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);

async function load(): Promise<void> {
  const uid = account.value?.uid;
  if (!uid) return;
  loading.value = true;
  try {
    const r = await referralPort.listRebates(uid, { page: page.value, pageSize: pageSize.value });
    if (r.success) {
      rebates.value = r.data.items;
      total.value = r.data.total;
    }
  } finally {
    loading.value = false;
  }
}

function openInvitee(uid: string): void {
  void router.push(`/accounts/${uid}`);
}

function openBill(rechargeId: string): void {
  const uid = account.value?.uid;
  if (!uid) return;
  void router.push({
    path: `/accounts/${uid}/billing/recharges`,
    query: { highlight: rechargeId },
  });
}

watch([page, pageSize], () => void load());
watch(() => account.value?.uid, () => {
  page.value = 1;
  void load();
});

onMounted(() => void load());
</script>

<template>
  <div class="acc-page">
    <div class="acc-page__head">
      <h4 class="acc-page__title">
        返利流水
        <span class="acc-page__count">共 {{ total }} 条</span>
      </h4>
    </div>

    <div class="acc-table-wrap">
      <el-table
        v-loading="loading"
        :data="rebates"
        row-key="id"
        size="small"
        height="100%"
        class="compact-table"
        empty-text="暂无返利记录"
      >
        <el-table-column label="来源账户" min-width="140">
          <template #default="{ row }: { row: ReferralRebate }">
            <button type="button" class="ref-link" @click="openInvitee(row.sourceAccountUid)">
              {{ row.sourceLabel }}
            </button>
          </template>
        </el-table-column>
        <el-table-column label="下级充值" width="120" align="right">
          <template #default="{ row }: { row: ReferralRebate }">
            {{ formatMoney(row.rechargeAmount, { currency: row.currency }) }}
          </template>
        </el-table-column>
        <el-table-column label="返利率" width="90" align="right">
          <template #default="{ row }: { row: ReferralRebate }">
            {{ row.rebateRatePercent }}%
          </template>
        </el-table-column>
        <el-table-column label="返利金额" width="120" align="right">
          <template #default="{ row }: { row: ReferralRebate }">
            <span class="cell-money cell-money--in">
              +{{ formatMoney(row.rebateAmount, { currency: row.currency }) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="关联账单" min-width="180">
          <template #default="{ row }: { row: ReferralRebate }">
            <span class="cell-uid">{{ row.linkedRechargeId }}</span>
          </template>
        </el-table-column>
        <el-table-column label="时间" width="170">
          <template #default="{ row }: { row: ReferralRebate }">
            <span class="cell-date">{{ formatDateTime(row.occurredAtUtc) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ row }: { row: ReferralRebate }">
            <el-button link type="primary" size="small" @click="openBill(row.linkedRechargeId)">
              查看账单
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div class="pagination-bar">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        background
      />
    </div>
  </div>
</template>

<style scoped>
.ref-link {
  border: none;
  background: none;
  padding: 0;
  color: var(--el-color-primary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}
.cell-money--in {
  color: var(--el-color-success);
}
</style>
