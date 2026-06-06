<script setup lang="ts">
import { computed, inject, onMounted, ref, watch } from 'vue';

import StatusTag from '@/shared/ui/StatusTag.vue';
import { formatMoney } from '@/shared/lib/money';
import { formatDateTime } from '@/shared/lib/date';

import { AccountDetailKey } from '../../../composables/accountDetailContext';
import type { ReferralWithdrawalAdmin } from '../../../model/referral.types';
import {
  ReferralWithdrawalMethodLabel,
  ReferralWithdrawalStatusLabel,
  ReferralWithdrawalStatusTone,
} from '../../../model/referral.types';
import { getReferralAdminPort } from '../../../services';

const ctx = inject(AccountDetailKey);
const referralPort = getReferralAdminPort();

const account = computed(() => ctx?.account.value ?? null);

const withdrawals = ref<ReferralWithdrawalAdmin[]>([]);
const loading = ref(false);
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);

async function load(): Promise<void> {
  const uid = account.value?.uid;
  if (!uid) return;
  loading.value = true;
  try {
    const w = await referralPort.listWithdrawals(uid, { page: page.value, pageSize: pageSize.value });
    if (w.success) {
      withdrawals.value = w.data.items;
      total.value = w.data.total;
    }
  } finally {
    loading.value = false;
  }
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
        提现记录
        <span class="acc-page__count">共 {{ total }} 条</span>
      </h4>
    </div>

    <div class="acc-table-wrap">
      <el-table
        v-loading="loading"
        :data="withdrawals"
        row-key="id"
        size="small"
        height="100%"
        class="compact-table"
        empty-text="暂无提现记录"
      >
        <el-table-column label="金额" width="120" align="right">
          <template #default="{ row }: { row: ReferralWithdrawalAdmin }">
            <span class="cell-money">
              {{ formatMoney(row.amount, { currency: row.currency }) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="收款方式" width="100">
          <template #default="{ row }: { row: ReferralWithdrawalAdmin }">
            {{ ReferralWithdrawalMethodLabel[row.method] }}
          </template>
        </el-table-column>
        <el-table-column label="收款账户" min-width="180">
          <template #default="{ row }: { row: ReferralWithdrawalAdmin }">
            <span>{{ row.accountName }} · {{ row.accountNo }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }: { row: ReferralWithdrawalAdmin }">
            <StatusTag
              :label="ReferralWithdrawalStatusLabel[row.status]"
              :tone="ReferralWithdrawalStatusTone[row.status]"
            />
          </template>
        </el-table-column>
        <el-table-column label="申请时间" width="170">
          <template #default="{ row }: { row: ReferralWithdrawalAdmin }">
            <span class="cell-date">{{ formatDateTime(row.appliedAtUtc) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="审核时间" width="170">
          <template #default="{ row }: { row: ReferralWithdrawalAdmin }">
            <span class="cell-date">
              {{ row.reviewedAtUtc ? formatDateTime(row.reviewedAtUtc) : '—' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="打款时间" width="170">
          <template #default="{ row }: { row: ReferralWithdrawalAdmin }">
            <span class="cell-date">
              {{ row.paidAtUtc ? formatDateTime(row.paidAtUtc) : '—' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="驳回原因" min-width="140">
          <template #default="{ row }: { row: ReferralWithdrawalAdmin }">
            <span class="cell-muted">{{ row.rejectReason ?? '—' }}</span>
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
.cell-muted {
  color: var(--el-text-color-placeholder);
  font-size: 13px;
}
</style>
