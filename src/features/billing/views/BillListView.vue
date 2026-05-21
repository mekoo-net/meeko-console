<script setup lang="ts">
/**
 * 账单（钱包扣款流水）列表。
 *
 * 与「充值记录」分表：充值是钱包"入账"事件，账单是"扣款"事件。
 * 错扣回滚 / 部分退还不另起一条，而是直接驳回原条目
 * （status='reversed' 且 actualAmount=0；或 status='partial_refunded'）。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { InfoFilled } from '@element-plus/icons-vue';

import PageHeader from '@/shared/ui/PageHeader.vue';
import StatusTag from '@/shared/ui/StatusTag.vue';
import FilterBar from '@/shared/ui/FilterBar.vue';
import { formatMoney } from '@/shared/lib/money';
import { formatDateTime } from '@/shared/lib/date';
import { getAccountAdminPort } from '@/features/accounts/services';
import type { Account } from '@/features/accounts/model/account.types';

import {
  billStatusValues,
  billSubTypeValues,
  businessCodeValues,
  BillFailureCodeLabel,
  BillReversedCodeLabel,
  BillStatusLabel,
  BillStatusTone,
  BillSubTypeLabel,
  BusinessCodeLabel,
  type BillingEntry,
  type BillStatus,
  type BillSubType,
  type BusinessCode,
} from '../model/billing.types';
import { getBillingPort } from '../services';
import type { ListBillsFilter } from '../services/ports/billingPort';

const router = useRouter();
const billingPort = getBillingPort();
const accountPort = getAccountAdminPort();

const records = ref<BillingEntry[]>([]);
const total = ref(0);
const loading = ref(false);

const page = ref(1);
const pageSize = ref(20);

interface PageFilter {
  accountUid: string;
  contactKeyword: string;
  dateRange: [string, string] | null;
  business: BusinessCode | 'all';
  subType: BillSubType | 'all';
  status: BillStatus | 'all';
}

const defaultFilter = (): PageFilter => ({
  accountUid: '',
  contactKeyword: '',
  dateRange: null,
  business: 'all',
  subType: 'all',
  status: 'all',
});

const filter = ref<PageFilter>(defaultFilter());
const accountMap = ref<Map<string, Account>>(new Map());

async function loadAccounts(): Promise<void> {
  const r = await accountPort.listAccounts({
    page: 1,
    pageSize: 999,
    filter: { accountUid: '', contactKeyword: '', type: 'all', status: 'all' },
  });
  if (r.success) {
    const m = new Map<string, Account>();
    r.data.items.forEach((a) => m.set(a.uid, a));
    accountMap.value = m;
  }
}

function buildPortFilter(): ListBillsFilter {
  const f: ListBillsFilter = {
    business: filter.value.business,
    subType: filter.value.subType,
    status: filter.value.status,
  };
  if (filter.value.accountUid.trim()) {
    f.accountUid = filter.value.accountUid.trim();
  }
  if (filter.value.dateRange && filter.value.dateRange[0]) {
    f.fromUtc = filter.value.dateRange[0];
  }
  if (filter.value.dateRange && filter.value.dateRange[1]) {
    f.toUtc = filter.value.dateRange[1];
  }
  return f;
}

async function fetchData(): Promise<void> {
  loading.value = true;
  try {
    const r = await billingPort.listBills({
      page: page.value,
      pageSize: pageSize.value,
      filter: buildPortFilter(),
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
  const kw = filter.value.contactKeyword.trim().toLowerCase();
  if (!kw) return records.value;
  return records.value.filter((r) => {
    const a = accountMap.value.get(r.ownerAccountUid);
    if (!a) return false;
    const email = (a.ownerEmail ?? '').toLowerCase();
    const phone = a.ownerPhone ?? '';
    return email.includes(kw) || phone.includes(kw);
  });
});

watch(
  () => ({
    page: page.value,
    pageSize: pageSize.value,
    business: filter.value.business,
    subType: filter.value.subType,
    status: filter.value.status,
    accountUid: filter.value.accountUid,
    dateRange: filter.value.dateRange,
  }),
  () => void fetchData(),
  { deep: true },
);

watch(
  () =>
    [
      filter.value.business,
      filter.value.subType,
      filter.value.status,
      filter.value.accountUid,
      filter.value.dateRange,
    ] as const,
  () => {
    page.value = 1;
  },
  { deep: true },
);

function resetFilter(): void {
  filter.value = defaultFilter();
  page.value = 1;
}

/** 第二行账户标签：主账户 / IAM 子账户 */
function operatorLabel(row: BillingEntry): string {
  if (row.operatorAccountUid === row.ownerAccountUid) return '主账户';
  return `IAM 子账户 · ${row.operatorAccountUid}`;
}

function isReverseLike(row: BillingEntry): boolean {
  return row.status === 'reversed' || row.status === 'partial_refunded';
}

onMounted(() => {
  void loadAccounts();
  void fetchData();
});
</script>

<template>
  <div class="page">
    <PageHeader
      title="账单流水"
      description="账户钱包扣款流水（订阅 / 用量 / 一次性订单）。错扣回滚、部分退还直接驳回原账单，保留原始扣费与实际扣费便于审计。"
    />

    <FilterBar
      v-model:account-uid="filter.accountUid"
      v-model:contact-keyword="filter.contactKeyword"
      v-model:date-range="filter.dateRange"
      :loading="loading"
      @refresh="fetchData()"
      @reset="resetFilter()"
    >
      <el-form-item label="业务">
        <el-select v-model="filter.business">
          <el-option label="全部业务" value="all" />
          <el-option
            v-for="b in businessCodeValues"
            :key="b"
            :label="BusinessCodeLabel[b]"
            :value="b"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="类型">
        <el-select v-model="filter.subType">
          <el-option label="全部类型" value="all" />
          <el-option
            v-for="t in billSubTypeValues"
            :key="t"
            :label="BillSubTypeLabel[t]"
            :value="t"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="filter.status">
          <el-option label="全部状态" value="all" />
          <el-option
            v-for="s in billStatusValues"
            :key="s"
            :label="BillStatusLabel[s]"
            :value="s"
          />
        </el-select>
      </el-form-item>
    </FilterBar>

    <el-table
      v-loading="loading"
      :data="displayRecords"
      row-key="id"
      size="small"
      class="compact-table"
    >
      <el-table-column label="流水号" min-width="180" prop="id">
        <template #default="{ row }: { row: BillingEntry }">
          <span class="cell-uid">{{ row.id }}</span>
        </template>
      </el-table-column>

      <el-table-column label="账户" min-width="220">
        <template #default="{ row }: { row: BillingEntry }">
          <div class="cell-account">
            <el-button
              link
              class="cell-account__uid"
              @click="router.push(`/accounts/${row.ownerAccountUid}`)"
            >
              {{ row.ownerAccountUid }}
            </el-button>
            <div
              class="cell-account__role"
              :class="{ 'cell-account__role--iam': row.operatorAccountUid !== row.ownerAccountUid }"
            >
              {{ operatorLabel(row) }}
            </div>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="业务" width="120">
        <template #default="{ row }: { row: BillingEntry }">
          <el-tag
            size="small"
            :type="row.business === 'demux' ? 'primary' : 'info'"
            effect="plain"
            round
          >
            {{ BusinessCodeLabel[row.business] }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column label="产品" min-width="160">
        <template #default="{ row }: { row: BillingEntry }">
          <span v-if="row.productCode" class="cell-product">{{ row.productCode }}</span>
          <span v-else class="cell-muted">—</span>
        </template>
      </el-table-column>

      <el-table-column label="类型" width="120">
        <template #default="{ row }: { row: BillingEntry }">
          <el-tag
            size="small"
            :type="row.subType === 'usage' ? 'warning' : 'info'"
            effect="plain"
            round
          >
            {{ BillSubTypeLabel[row.subType] }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column label="状态" width="110">
        <template #default="{ row }: { row: BillingEntry }">
          <StatusTag
            :label="BillStatusLabel[row.status]"
            :tone="BillStatusTone[row.status]"
          />
        </template>
      </el-table-column>

      <el-table-column label="金额" width="180" align="right">
        <template #default="{ row }: { row: BillingEntry }">
          <div class="cell-amount">
            <span
              class="cell-money"
              :class="{
                'cell-money--reverted': isReverseLike(row),
                'cell-money--failed': row.status === 'failed',
                'cell-money--out': row.status === 'completed',
              }"
            >
              -{{ formatMoney(row.actualAmount, { currency: row.currency }) }}
            </span>
            <span
              v-if="row.actualAmount !== row.originalAmount"
              class="cell-amount__original"
            >
              原 {{ formatMoney(row.originalAmount, { currency: row.currency }) }}
            </span>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="日期" width="170">
        <template #default="{ row }: { row: BillingEntry }">
          <span class="cell-date">{{ formatDateTime(row.occurredAtUtc) }}</span>
        </template>
      </el-table-column>

      <el-table-column label="" width="40">
        <template #default="{ row }: { row: BillingEntry }">
          <el-tooltip
            v-if="row.failureCode || row.reversedCode"
            placement="left"
            effect="dark"
          >
            <template #content>
              <div class="tooltip-block">
                <div v-if="row.failureCode" class="tooltip-block__reason">
                  失败原因：{{ BillFailureCodeLabel[row.failureCode] }}
                </div>
                <div v-if="row.reversedCode" class="tooltip-block__reason">
                  驳回原因：{{ BillReversedCodeLabel[row.reversedCode] }}
                </div>
                <div v-if="row.reversedAtUtc" class="tooltip-block__time">
                  驳回时间：{{ formatDateTime(row.reversedAtUtc) }}
                </div>
              </div>
            </template>
            <el-icon class="cell-info-icon"><InfoFilled /></el-icon>
          </el-tooltip>
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
.pagination-bar {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

/* 账户列：第一行 UID 链接，第二行 主账户/IAM 标签 */
.cell-account {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  line-height: 1.35;
}
.cell-account__uid {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-secondary);
  padding: 0;
  height: auto;
  line-height: 1.4;
  justify-content: flex-start;
}
.cell-account__uid:hover {
  color: var(--el-color-primary);
}
.cell-account__role {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
.cell-account__role--iam {
  color: var(--el-color-warning);
}

/* 产品列：等宽字体的 productCode */
.cell-product {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12.5px;
  color: var(--el-text-color-primary);
}

/* 金额列：实际扣费 + （如不一致）原始扣费小字 */
.cell-amount {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  line-height: 1.35;
}
.cell-amount__original {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  text-decoration: line-through;
  font-variant-numeric: tabular-nums;
  margin-top: 2px;
}
.cell-money--out {
  color: var(--el-color-warning);
}
.cell-money--reverted {
  color: var(--el-text-color-secondary);
  text-decoration: line-through;
}
.cell-money--failed {
  color: var(--el-color-danger);
  opacity: 0.6;
}

.cell-info-icon {
  color: var(--el-text-color-placeholder);
  cursor: help;
  font-size: 16px;
}
.cell-info-icon:hover {
  color: var(--el-color-primary);
}

.tooltip-block {
  max-width: 320px;
  line-height: 1.5;
}
.tooltip-block__reason {
  margin-top: 4px;
  color: #fbbf24;
}
.tooltip-block__time {
  margin-top: 4px;
  font-size: 11px;
  opacity: 0.7;
}
</style>
