<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Refresh, Search } from '@element-plus/icons-vue';

import PageHeader from '@/shared/ui/PageHeader.vue';
import StatusTag from '@/shared/ui/StatusTag.vue';
import { formatMoney } from '@/shared/lib/money';
import { formatDateTime } from '@/shared/lib/date';
import { getAccountAdminPort } from '@/features/accounts/services';
import type { Account } from '@/features/accounts/model/account.types';
import {
  rechargeStatusValues,
  RechargeStatusLabel,
  RechargeStatusTone,
  type RechargeRecord,
} from '../model/billing.types';
import { PaymentProviderLabel } from '../model/paymentChannel.types';
import { getBillingPort } from '../services';
import type { ListRechargesFilter } from '../services/ports/billingPort';

const router = useRouter();
const billingPort = getBillingPort();
const accountPort = getAccountAdminPort();

const records = ref<RechargeRecord[]>([]);
const total = ref(0);
const loading = ref(false);

const page = ref(1);
const pageSize = ref(20);

const filter = ref<ListRechargesFilter>({ status: 'all' });
const accountKeyword = ref('');

const accountMap = ref<Map<string, Account>>(new Map());

const totalAmount = computed(() =>
  records.value.filter((r) => r.status === 'paid').reduce((s, r) => s + r.amount, 0),
);

async function loadAccounts(): Promise<void> {
  const r = await accountPort.listAccounts({
    page: 1, pageSize: 999,
    filter: { keyword: '', type: 'all', status: 'all' },
  });
  if (r.success) {
    const m = new Map<string, Account>();
    r.data.items.forEach((a) => m.set(a.uid, a));
    accountMap.value = m;
  }
}

async function fetchData(): Promise<void> {
  loading.value = true;
  try {
    const r = await billingPort.listRecharges({
      page: page.value,
      pageSize: pageSize.value,
      filter: filter.value,
    });
    if (r.success) {
      records.value = r.data.items;
      total.value = r.data.total;
    }
  } finally {
    loading.value = false;
  }
}

const displayRecords = computed(() => {
  if (!accountKeyword.value.trim()) return records.value;
  const kw = accountKeyword.value.trim().toLowerCase();
  return records.value.filter((r) => {
    const a = accountMap.value.get(r.accountUid);
    return (
      a?.name.toLowerCase().includes(kw) ||
      a?.slug.toLowerCase().includes(kw) ||
      r.accountUid.includes(kw)
    );
  });
});

watch([page, pageSize, filter], () => void fetchData(), { deep: true });

onMounted(() => {
  void loadAccounts();
  void fetchData();
});
</script>

<template>
  <div class="page">
    <PageHeader title="充值记录" description="平台全量充值流水，支持按账户、状态筛选。">
      <template #actions>
        <el-button :icon="Refresh" :loading="loading" @click="fetchData()">刷新</el-button>
      </template>
    </PageHeader>

    <!-- 统计 -->
    <div class="stat-row">
      <el-card shadow="never" class="stat-card">
        <div class="stat-card__num">{{ total }}</div>
        <div class="stat-card__label">充值笔数（当前筛选）</div>
      </el-card>
      <el-card shadow="never" class="stat-card stat-card--green">
        <div class="stat-card__num">{{ formatMoney(totalAmount) }}</div>
        <div class="stat-card__label">已支付金额合计</div>
      </el-card>
    </div>

    <!-- 筛选栏 -->
    <div class="filter-bar">
      <el-input
        v-model="accountKeyword"
        :prefix-icon="Search"
        placeholder="按账户名 / slug / UID 过滤"
        clearable
        style="max-width: 280px"
      />
      <el-select v-model="filter.status" style="width: 140px">
        <el-option label="全部状态" value="all" />
        <el-option
          v-for="s in rechargeStatusValues"
          :key="s"
          :label="RechargeStatusLabel[s]"
          :value="s"
        />
      </el-select>
      <el-button plain @click="filter = { status: 'all' }; accountKeyword = ''">重置</el-button>
    </div>

    <el-table v-loading="loading" :data="displayRecords" border stripe row-key="uid">
      <el-table-column label="所属账户" min-width="200">
        <template #default="{ row }: { row: RechargeRecord }">
          <template v-if="accountMap.has(row.accountUid)">
            <el-link type="primary" @click="router.push(`/accounts/${row.accountUid}`)">
              {{ accountMap.get(row.accountUid)?.name }}
            </el-link>
            <div class="cell-sub">{{ accountMap.get(row.accountUid)?.slug }} · {{ row.accountUid }}</div>
          </template>
          <span v-else class="cell-muted">{{ row.accountUid }}</span>
        </template>
      </el-table-column>

      <el-table-column label="金额" width="140" align="right">
        <template #default="{ row }: { row: RechargeRecord }">
          <span class="money">{{ formatMoney(row.amount, { currency: row.currency }) }}</span>
        </template>
      </el-table-column>

      <el-table-column label="渠道" width="130">
        <template #default="{ row }: { row: RechargeRecord }">
          {{ (PaymentProviderLabel as Record<string, string>)[row.provider] ?? row.provider }}
        </template>
      </el-table-column>

      <el-table-column label="状态" width="110">
        <template #default="{ row }: { row: RechargeRecord }">
          <StatusTag
            :label="RechargeStatusLabel[row.status]"
            :tone="RechargeStatusTone[row.status]"
          />
        </template>
      </el-table-column>

      <el-table-column label="单号" min-width="200">
        <template #default="{ row }: { row: RechargeRecord }">
          <span class="cell-trade-no">{{ row.outTradeNo }}</span>
        </template>
      </el-table-column>

      <el-table-column label="创建时间" min-width="160">
        <template #default="{ row }: { row: RechargeRecord }">
          {{ formatDateTime(row.createdAtUtc) }}
        </template>
      </el-table-column>

      <el-table-column label="支付时间" min-width="160">
        <template #default="{ row }: { row: RechargeRecord }">
          <span v-if="row.paidAtUtc">{{ formatDateTime(row.paidAtUtc) }}</span>
          <span v-else class="cell-muted">—</span>
        </template>
      </el-table-column>
    </el-table>

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
.stat-row {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}
.stat-card {
  flex: 1;
  border-radius: 10px;
  text-align: center;
}
.stat-card__num {
  font-size: 24px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  line-height: 1.3;
}
.stat-card--green .stat-card__num { color: var(--el-color-success); }
.stat-card__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}
.filter-bar {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}
.money {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--el-color-success);
}
.cell-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
.cell-trade-no {
  font-family: monospace;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.cell-muted { color: var(--el-text-color-placeholder); }
.pagination-bar {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
