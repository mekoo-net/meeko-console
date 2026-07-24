<script setup lang="ts">
import { computed, inject, onMounted, ref, watch } from 'vue';
import { Coin, Money, Refresh, Wallet } from '@element-plus/icons-vue';

import { formatMoney } from '@/shared/lib/money';
import { formatDateTime } from '@/shared/lib/date';

import { AccountDetailKey } from '../../../composables/accountDetailContext';
import {
  ReferralWithdrawalMethodLabel,
  ReferralWithdrawalStatusLabel,
  ReferralWithdrawalStatusTone,
  type ReferralAccountSummary,
  type ReferralWithdrawalAdmin,
} from '../../../model/referral.types';
import { getReferralAdminPort } from '../../../services';

const ctx = inject(AccountDetailKey);
const referralPort = getReferralAdminPort();

const account = computed(() => ctx?.account.value ?? null);

const withdrawals = ref<ReferralWithdrawalAdmin[]>([]);
const summary = ref<ReferralAccountSummary | null>(null);
const loading = ref(false);
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);

const currency = computed(() => summary.value?.currency ?? withdrawals.value[0]?.currency ?? 'CNY');

interface Metric {
  key: string;
  label: string;
  value: string;
  icon: unknown;
  tone: string;
}

const metrics = computed<Metric[]>(() => {
  const s = summary.value;
  return [
    {
      key: 'withdrawable',
      label: '可提现',
      value: formatMoney(s?.withdrawableAmount ?? 0, { currency: currency.value }),
      icon: Wallet,
      tone: 'blue',
    },
    {
      key: 'withdrawn',
      label: '已提现',
      value: formatMoney(s?.withdrawnAmount ?? 0, { currency: currency.value }),
      icon: Money,
      tone: 'violet',
    },
    {
      key: 'total',
      label: '累计返利',
      value: formatMoney(s?.totalRebateAmount ?? 0, { currency: currency.value }),
      icon: Coin,
      tone: 'emerald',
    },
  ];
});

async function load(): Promise<void> {
  const uid = account.value?.uid;
  if (!uid) return;
  loading.value = true;
  try {
    const [w, s] = await Promise.all([
      referralPort.listWithdrawals(uid, { page: page.value, pageSize: pageSize.value }),
      referralPort.getSummary(uid),
    ]);
    if (w.success) {
      withdrawals.value = w.data.items;
      total.value = w.data.total;
    }
    if (s.success) summary.value = s.data;
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
  <div class="acc-page withdrawals">
    <div class="withdrawals__metrics">
      <div v-for="m in metrics" :key="m.key" class="metric" :class="`metric--${m.tone}`">
        <span class="metric__icon"><el-icon :size="20"><component :is="m.icon" /></el-icon></span>
        <span class="metric__body">
          <span class="metric__value">{{ m.value }}</span>
          <span class="metric__label">{{ m.label }}</span>
        </span>
      </div>
    </div>

    <div class="acc-page__head">
      <h4 class="acc-page__title">提现记录</h4>
      <el-button :icon="Refresh" size="small" text :loading="loading" @click="load">刷新</el-button>
    </div>

    <div class="acc-table-wrap">
      <el-table
        v-loading="loading"
        :data="withdrawals"
        row-key="id"
        size="small"
        class="compact-table"
        empty-text="暂无提现记录"
      >
        <el-table-column label="申请时间" min-width="180">
          <template #default="{ row }: { row: ReferralWithdrawalAdmin }">
            <span class="cell-date">{{ formatDateTime(row.appliedAtUtc) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="提现金额" min-width="150" align="right">
          <template #default="{ row }: { row: ReferralWithdrawalAdmin }">
            <span class="cell-money cell-money--warning cell-money--strong">
              {{ formatMoney(row.amount, { currency: row.currency }) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="方式" min-width="110" align="center">
          <template #default="{ row }: { row: ReferralWithdrawalAdmin }">
            <el-tag size="small" effect="plain" round>{{ ReferralWithdrawalMethodLabel[row.method] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="收款信息" min-width="220">
          <template #default="{ row }: { row: ReferralWithdrawalAdmin }">
            <div class="payee">
              <span class="payee__name">{{ row.accountName || '—' }}</span>
              <span v-if="row.accountNo" class="payee__no">{{ row.accountNo }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" min-width="160">
          <template #default="{ row }: { row: ReferralWithdrawalAdmin }">
            <el-tag :type="ReferralWithdrawalStatusTone[row.status]" size="small" effect="light" round>
              {{ ReferralWithdrawalStatusLabel[row.status] }}
            </el-tag>
            <div v-if="row.status === 'rejected' && row.rejectReason" class="cell-sub reject-reason">
              {{ row.rejectReason }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="处理时间" min-width="180">
          <template #default="{ row }: { row: ReferralWithdrawalAdmin }">
            <span v-if="row.paidAtUtc" class="cell-date">{{ formatDateTime(row.paidAtUtc) }}</span>
            <span v-else-if="row.reviewedAtUtc" class="cell-date">{{ formatDateTime(row.reviewedAtUtc) }}</span>
            <span v-else class="cell-muted">—</span>
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
.withdrawals__metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  flex-shrink: 0;
}
.metric {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border-radius: 14px;
  background: var(--el-fill-color-lighter);
}
.metric__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 12px;
  color: #fff;
  flex-shrink: 0;
}
.metric--emerald .metric__icon {
  background: linear-gradient(135deg, #059669, #10b981);
}
.metric--blue .metric__icon {
  background: linear-gradient(135deg, #2563eb, #3b82f6);
}
.metric--violet .metric__icon {
  background: linear-gradient(135deg, #7c3aed, #a855f7);
}
.metric__body {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
  min-width: 0;
}
.metric__value {
  font-size: 19px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  font-variant-numeric: tabular-nums;
}
.metric__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.acc-page__head {
  justify-content: space-between;
  align-items: center;
}
.withdrawals .acc-table-wrap {
  overflow: auto;
}
.payee {
  display: flex;
  flex-direction: column;
  line-height: 1.35;
}
.payee__name {
  color: var(--el-text-color-primary);
}
.payee__no {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}
.reject-reason {
  color: var(--el-color-danger);
}
.compact-table .cell-money--strong {
  font-size: 13.5px;
  font-weight: 600;
}
</style>
