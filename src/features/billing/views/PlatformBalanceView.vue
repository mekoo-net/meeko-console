<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Refresh } from '@element-plus/icons-vue';

import PageHeader from '@/shared/ui/PageHeader.vue';
import StatusTag from '@/shared/ui/StatusTag.vue';
import { formatMoney } from '@/shared/lib/money';
import { formatDateTime } from '@/shared/lib/date';
import { getAccountAdminPort } from '@/features/accounts/services';
import { accountStatusLabel, accountStatusTone, accountTypeLabel, type Account } from '@/features/accounts/model/account.types';
import { getBillingPort } from '../services';
import type { WalletSnapshot } from '../model/billing.types';

const router = useRouter();
const accountPort = getAccountAdminPort();
const billingPort = getBillingPort();

interface BalanceRow {
  account: Account;
  wallet: WalletSnapshot | null;
  walletLoading: boolean;
}

const rows = ref<BalanceRow[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

const totalAvailable = computed(() =>
  rows.value.reduce((s, r) => s + (r.wallet?.available ?? 0), 0),
);
const totalHeld = computed(() =>
  rows.value.reduce((s, r) => s + (r.wallet?.held ?? 0), 0),
);
const accountCount = computed(() => rows.value.length);

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const r = await accountPort.listAccounts({
      page: 1,
      pageSize: 999,
      filter: { keyword: '', type: 'all', status: 'all' },
    });
    if (!r.success) {
      error.value = r.error.message;
      return;
    }
    rows.value = r.data.items.map((a) => ({ account: a, wallet: null, walletLoading: true }));

    await Promise.all(
      r.data.items.map(async (a, idx) => {
        const wr = await billingPort.getWallet(a.uid);
        rows.value[idx] = {
          account: a,
          wallet: wr.success ? wr.data : null,
          walletLoading: false,
        };
      }),
    );
  } finally {
    loading.value = false;
  }
}

onMounted(() => void load());
</script>

<template>
  <div class="page">
    <PageHeader title="余额总览" description="平台所有主账户钱包快照，点击账户名进入账单详情。">
      <template #actions>
        <el-button :icon="Refresh" :loading="loading" @click="load()">刷新</el-button>
      </template>
    </PageHeader>

    <!-- 统计卡 -->
    <div class="stat-row">
      <el-card shadow="never" class="stat-card">
        <div class="stat-card__num">{{ accountCount }}</div>
        <div class="stat-card__label">账户总数</div>
      </el-card>
      <el-card shadow="never" class="stat-card stat-card--primary">
        <div class="stat-card__num">{{ formatMoney(totalAvailable) }}</div>
        <div class="stat-card__label">平台可用余额合计</div>
      </el-card>
      <el-card shadow="never" class="stat-card stat-card--warning">
        <div class="stat-card__num">{{ formatMoney(totalHeld) }}</div>
        <div class="stat-card__label">平台冻结合计</div>
      </el-card>
    </div>

    <el-alert
      v-if="error"
      type="error"
      :title="error"
      show-icon
      :closable="false"
      style="margin-bottom: 12px"
    />

    <el-table v-loading="loading" :data="rows" border stripe row-key="account.uid">
      <el-table-column label="账户" min-width="220">
        <template #default="{ row }: { row: BalanceRow }">
          <el-link type="primary" @click="router.push(`/accounts/${row.account.uid}`)">
            {{ row.account.name }}
          </el-link>
          <div class="cell-sub">{{ row.account.slug }} · UID {{ row.account.uid }}</div>
        </template>
      </el-table-column>

      <el-table-column label="类型" width="120">
        <template #default="{ row }: { row: BalanceRow }">
          <el-tag :type="row.account.type === 'organization' ? 'primary' : 'info'" effect="light" round>
            {{ accountTypeLabel[row.account.type] }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column label="账户状态" width="110">
        <template #default="{ row }: { row: BalanceRow }">
          <StatusTag :label="accountStatusLabel[row.account.status]" :tone="accountStatusTone[row.account.status]" />
        </template>
      </el-table-column>

      <el-table-column label="可用余额" width="160" align="right">
        <template #default="{ row }: { row: BalanceRow }">
          <el-skeleton v-if="row.walletLoading" :rows="1" animated style="width: 80px" />
          <span v-else-if="row.wallet" class="money money--available">
            {{ formatMoney(row.wallet.available, { currency: row.wallet.currency }) }}
          </span>
          <span v-else class="cell-muted">—</span>
        </template>
      </el-table-column>

      <el-table-column label="冻结" width="130" align="right">
        <template #default="{ row }: { row: BalanceRow }">
          <el-skeleton v-if="row.walletLoading" :rows="1" animated style="width: 70px" />
          <span v-else-if="row.wallet" class="money money--held">
            {{ formatMoney(row.wallet.held, { currency: row.wallet.currency }) }}
          </span>
          <span v-else class="cell-muted">—</span>
        </template>
      </el-table-column>

      <el-table-column label="余额更新时间" min-width="160">
        <template #default="{ row }: { row: BalanceRow }">
          <span v-if="row.wallet">{{ formatDateTime(row.wallet.updatedAtUtc) }}</span>
          <span v-else class="cell-muted">—</span>
        </template>
      </el-table-column>

      <el-table-column label="操作" width="110" fixed="right" align="right">
        <template #default="{ row }: { row: BalanceRow }">
          <el-button link type="primary" @click="router.push(`/accounts/${row.account.uid}`)">
            账单详情
          </el-button>
        </template>
      </el-table-column>
    </el-table>
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
.stat-card--primary .stat-card__num { color: var(--el-color-success); }
.stat-card--warning .stat-card__num { color: var(--el-color-warning); }
.stat-card__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}
.cell-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
.money {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.money--available { color: var(--el-color-success); }
.money--held { color: var(--el-color-warning); }
.cell-muted { color: var(--el-text-color-placeholder); }
</style>
