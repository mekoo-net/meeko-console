<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import PageHeader from '@/shared/ui/PageHeader.vue';
import StatusTag from '@/shared/ui/StatusTag.vue';
import { formatMoney } from '@/shared/lib/money';
import { formatDateTime } from '@/shared/lib/date';
import { getAccountAdminPort } from '@/features/accounts/services';
import type { Account } from '@/features/accounts/model/account.types';

import FilterBar from '@/shared/ui/FilterBar.vue';
import {
  consumptionStatusValues,
  consumptionTypeValues,
  ConsumptionStatusLabel,
  ConsumptionStatusTone,
  ConsumptionTypeLabel,
  type ConsumptionRecord,
  type ConsumptionStatus,
  type ConsumptionType,
} from '../model/billing.types';
import { getBillingPort } from '../services';
import type { ListConsumptionsFilter } from '../services/ports/billingPort';

const router = useRouter();
const billingPort = getBillingPort();
const accountPort = getAccountAdminPort();

const records = ref<ConsumptionRecord[]>([]);
const total = ref(0);
const loading = ref(false);

const page = ref(1);
const pageSize = ref(20);

interface PageFilter {
  accountUid: string;
  contactKeyword: string;
  dateRange: [string, string] | null;
  type: ConsumptionType | 'all';
  status: ConsumptionStatus | 'all';
}

const defaultFilter = (): PageFilter => ({
  accountUid: '',
  contactKeyword: '',
  dateRange: null,
  type: 'all',
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

function buildPortFilter(): ListConsumptionsFilter {
  const f: ListConsumptionsFilter = {
    status: filter.value.status,
    type: filter.value.type,
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
    const r = await billingPort.listConsumptions({
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
    const a = accountMap.value.get(r.accountUid);
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
    type: filter.value.type,
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
      filter.value.type,
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

onMounted(() => {
  void loadAccounts();
  void fetchData();
});
</script>

<template>
  <div class="page">
    <PageHeader
      title="消费记录"
      description="账户钱包扣费流水（订阅 / 用量 / 一次性订单 / 人工调账），支持账户、邮箱/手机、时间范围、类型与状态筛选。"
    />

    <FilterBar
      v-model:account-uid="filter.accountUid"
      v-model:contact-keyword="filter.contactKeyword"
      v-model:date-range="filter.dateRange"
      :loading="loading"
      @refresh="fetchData()"
      @reset="resetFilter()"
    >
      <el-form-item label="类型">
        <el-select v-model="filter.type">
          <el-option label="全部类型" value="all" />
          <el-option
            v-for="t in consumptionTypeValues"
            :key="t"
            :label="ConsumptionTypeLabel[t]"
            :value="t"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="filter.status">
          <el-option label="全部状态" value="all" />
          <el-option
            v-for="s in consumptionStatusValues"
            :key="s"
            :label="ConsumptionStatusLabel[s]"
            :value="s"
          />
        </el-select>
      </el-form-item>
    </FilterBar>

    <el-table
      v-loading="loading"
      :data="displayRecords"
      row-key="uid"
      size="small"
      class="compact-table"
    >
      <el-table-column label="账户 UID" width="130">
        <template #default="{ row }: { row: ConsumptionRecord }">
          <el-button
            link
            class="cell-uid-btn"
            @click="router.push(`/accounts/${row.accountUid}`)"
          >
            {{ row.accountUid }}
          </el-button>
        </template>
      </el-table-column>

      <el-table-column label="账户" min-width="200">
        <template #default="{ row }: { row: ConsumptionRecord }">
          <template v-if="accountMap.has(row.accountUid)">
            <div class="cell-contact">
              <div class="cell-contact__email">
                <span v-if="accountMap.get(row.accountUid)?.ownerEmail">
                  {{ accountMap.get(row.accountUid)?.ownerEmail }}
                </span>
                <span v-else class="cell-muted">—</span>
              </div>
              <div class="cell-contact__phone">
                <span v-if="accountMap.get(row.accountUid)?.ownerPhone">
                  {{ accountMap.get(row.accountUid)?.ownerPhone }}
                </span>
                <span v-else class="cell-muted">—</span>
              </div>
            </div>
          </template>
          <span v-else class="cell-muted">—</span>
        </template>
      </el-table-column>

      <el-table-column label="项目" min-width="220">
        <template #default="{ row }: { row: ConsumptionRecord }">
          <div class="cell-product">
            <div class="cell-product__code">{{ row.productCode }}</div>
            <div v-if="row.description" class="cell-product__desc">{{ row.description }}</div>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="类型" width="110">
        <template #default="{ row }: { row: ConsumptionRecord }">
          <el-tag size="small" type="info" effect="plain" round>
            {{ ConsumptionTypeLabel[row.type] }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column label="金额" width="140" align="right">
        <template #default="{ row }: { row: ConsumptionRecord }">
          <span class="cell-money cell-money--warning">
            -{{ formatMoney(row.amount, { currency: row.currency }) }}
          </span>
        </template>
      </el-table-column>

      <el-table-column label="状态" width="100">
        <template #default="{ row }: { row: ConsumptionRecord }">
          <StatusTag
            :label="ConsumptionStatusLabel[row.status]"
            :tone="ConsumptionStatusTone[row.status]"
          />
        </template>
      </el-table-column>

      <el-table-column label="发生时间" width="170">
        <template #default="{ row }: { row: ConsumptionRecord }">
          <span class="cell-date">{{ formatDateTime(row.occurredAtUtc) }}</span>
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

/* UID 按钮：等宽数字 + 灰色，hover 主题色 */
.cell-uid-btn {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-secondary);
  padding: 0;
  height: auto;
  line-height: 1.4;
}
.cell-uid-btn:hover {
  color: var(--el-color-primary);
}

/* 账户单元格：上邮箱、下手机号 */
.cell-contact {
  display: flex;
  flex-direction: column;
  line-height: 1.35;
}
.cell-contact__email {
  font-weight: 500;
  color: var(--el-text-color-primary);
  font-size: 13px;
}
.cell-contact__phone {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
  margin-top: 2px;
}

/* 项目单元格：上 productCode、下描述 */
.cell-product {
  display: flex;
  flex-direction: column;
  line-height: 1.35;
}
.cell-product__code {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12.5px;
  color: var(--el-text-color-primary);
  font-weight: 500;
}
.cell-product__desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
</style>
