<script setup lang="ts">
import { computed, inject, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Coin, Money, Refresh, Wallet } from '@element-plus/icons-vue';

import { formatMoney } from '@/shared/lib/money';
import { formatDate } from '@/shared/lib/date';

import { AccountDetailKey } from '../../../composables/accountDetailContext';
import type { ReferralAccountSummary, ReferralRebate } from '../../../model/referral.types';
import { getReferralAdminPort } from '../../../services';

const ctx = inject(AccountDetailKey);
const router = useRouter();
const referralPort = getReferralAdminPort();

const account = computed(() => ctx?.account.value ?? null);

const rebates = ref<ReferralRebate[]>([]);
const summary = ref<ReferralAccountSummary | null>(null);
const loading = ref(false);
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);

const currency = computed(() => summary.value?.currency ?? rebates.value[0]?.currency ?? 'CNY');

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
      key: 'total',
      label: '累计返利',
      value: formatMoney(s?.totalRebateAmount ?? 0, { currency: currency.value }),
      icon: Coin,
      tone: 'emerald',
    },
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
  ];
});

async function load(): Promise<void> {
  const uid = account.value?.uid;
  if (!uid) return;
  loading.value = true;
  try {
    const [r, s] = await Promise.all([
      referralPort.listRebates(uid, { page: page.value, pageSize: pageSize.value }),
      referralPort.getSummary(uid),
    ]);
    if (r.success) {
      rebates.value = r.data.items;
      total.value = r.data.total;
    }
    if (s.success) summary.value = s.data;
  } finally {
    loading.value = false;
  }
}

function openSource(uid: string): void {
  if (uid) void router.push(`/accounts/${uid}/overview`);
}

watch([page, pageSize], () => void load());
watch(() => account.value?.uid, () => {
  page.value = 1;
  void load();
});

onMounted(() => void load());
</script>

<template>
  <div class="acc-page rebates">
    <div class="rebates__metrics">
      <div v-for="m in metrics" :key="m.key" class="metric" :class="`metric--${m.tone}`">
        <span class="metric__icon"><el-icon :size="20"><component :is="m.icon" /></el-icon></span>
        <span class="metric__body">
          <span class="metric__value">{{ m.value }}</span>
          <span class="metric__label">{{ m.label }}</span>
        </span>
      </div>
    </div>

    <div class="acc-page__head">
      <h4 class="acc-page__title">返利流水</h4>
      <el-button :icon="Refresh" size="small" text :loading="loading" @click="load">刷新</el-button>
    </div>

    <div class="acc-table-wrap">
      <el-table
        v-loading="loading"
        :data="rebates"
        row-key="id"
        size="small"
        class="compact-table"
        empty-text="暂无返利记录"
      >
        <el-table-column label="日期" min-width="130">
          <template #default="{ row }: { row: ReferralRebate }">
            <span class="cell-date">{{ formatDate(row.occurredAtUtc) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="返利来源" min-width="180">
          <template #default="{ row }: { row: ReferralRebate }">
            <button type="button" class="src-link" @click="openSource(row.sourceAccountUid)">
              {{ row.sourceLabel || row.sourceAccountUid }}
            </button>
            <div class="cell-sub cell-uid">{{ row.sourceAccountUid }}</div>
          </template>
        </el-table-column>
        <el-table-column label="充值金额" min-width="150" align="right">
          <template #default="{ row }: { row: ReferralRebate }">
            <span class="cell-amount">{{ formatMoney(row.rechargeAmount, { currency: row.currency }) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="返利比例" min-width="120" align="center">
          <template #default="{ row }: { row: ReferralRebate }">
            <el-tag type="warning" size="small" effect="plain" round>{{ row.rebateRatePercent }}%</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="返利金额" min-width="160" align="right">
          <template #default="{ row }: { row: ReferralRebate }">
            <span class="cell-money cell-money--strong">
              +{{ formatMoney(row.rebateAmount, { currency: row.currency }) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="关联充值单" min-width="240">
          <template #default="{ row }: { row: ReferralRebate }">
            <span class="cell-uid">{{ row.linkedRechargeId }}</span>
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
.rebates__metrics {
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
.rebates .acc-table-wrap {
  overflow: auto;
}
.cell-amount {
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-primary);
}
.src-link {
  border: none;
  background: none;
  padding: 0;
  color: var(--el-color-primary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
}
.src-link:hover {
  text-decoration: underline;
}
.compact-table .cell-money--strong {
  font-size: 13.5px;
  font-weight: 600;
}
</style>
