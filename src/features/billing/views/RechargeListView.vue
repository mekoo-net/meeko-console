<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import PageHeader from '@/shared/ui/PageHeader.vue';
import StatusTag from '@/shared/ui/StatusTag.vue';
import FilterBar from '@/shared/ui/FilterBar.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import FillListPageLayout from '@/shared/ui/FillListPageLayout.vue';
import { formatMoney } from '@/shared/lib/money';
import { formatDateTime } from '@/shared/lib/date';
import { dateRangeToEpochMillis } from '@/shared/lib/epoch';

import {
  rechargeProviderValues,
  rechargeStatusValues,
  RechargeProviderLabel,
  RechargeStatusLabel,
  RechargeStatusTone,
  type RechargeProvider,
  type RechargeRecord,
  type RechargeStatus,
} from '../model/billing.types';
import { getBillingPort } from '../services';
import type { ListRechargesFilter } from '../services/ports/billingPort';

const router = useRouter();
const billingPort = getBillingPort();

const records = ref<RechargeRecord[]>([]);
const total = ref(0);
const loading = ref(false);

const page = ref(1);
const pageSize = ref(20);

interface PageFilter {
  accountUid: string;
  contactKeyword: string;
  dateRange: [string, string] | null;
  provider: RechargeProvider | 'all';
  status: RechargeStatus | 'all';
}

const defaultFilter = (): PageFilter => ({
  accountUid: '',
  contactKeyword: '',
  dateRange: null,
  provider: 'all',
  status: 'all',
});

const filter = ref<PageFilter>(defaultFilter());

function buildPortFilter(): ListRechargesFilter {
  const f: ListRechargesFilter = {
    provider: filter.value.provider,
    status: filter.value.status,
  };
  if (filter.value.accountUid.trim()) {
    f.accountUid = filter.value.accountUid.trim();
  }
  if (filter.value.dateRange?.[0] && filter.value.dateRange[1]) {
    Object.assign(f, dateRangeToEpochMillis(filter.value.dateRange));
  }
  return f;
}

async function fetchData(): Promise<void> {
  loading.value = true;
  try {
    const r = await billingPort.listRecharges({
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
    const email = (r.ownerEmail ?? '').toLowerCase();
    const phone = r.ownerPhone ?? '';
    return email.includes(kw) || phone.includes(kw);
  });
});

watch(
  () => [page.value, pageSize.value] as const,
  () => void fetchData(),
);

watch(
  () =>
    [
      filter.value.provider,
      filter.value.status,
      filter.value.accountUid,
      filter.value.dateRange,
    ] as const,
  () => {
    // filter 变化回到第一页：已在第 1 页则直接拉，否则只改 page，
    // 由上面的 page watcher 单次触发，避免「旧 page + 新 page」两次请求。
    if (page.value === 1) {
      void fetchData();
    } else {
      page.value = 1;
    }
  },
  { deep: true },
);

function resetFilter(): void {
  filter.value = defaultFilter();
  page.value = 1;
}

function isInternalProvider(p: RechargeProvider): boolean {
  return p === 'cs_compensation' || p === 'marketing_reward' || p === 'manual';
}

onMounted(() => {
  void fetchData();
});
</script>

<template>
  <FillListPageLayout>
    <template #header>
      <PageHeader
        title="充值记录"
        description="账户钱包入账事件，含用户付费充值（支付宝 / 微信）与平台内部充值（客服补偿 / 营销奖励 / 手工充值）。人工入账请前往对应账户详情页发起。"
      />
    </template>

    <template #filters>
      <FilterBar
        v-model:account-uid="filter.accountUid"
        v-model:contact-keyword="filter.contactKeyword"
        v-model:date-range="filter.dateRange"
        :loading="loading"
        @refresh="fetchData()"
        @reset="resetFilter()"
      >
        <el-form-item label="渠道">
          <el-select v-model="filter.provider">
            <el-option label="全部渠道" value="all" />
            <el-option
              v-for="p in rechargeProviderValues"
              :key="p"
              :label="RechargeProviderLabel[p]"
              :value="p"
            />
          </el-select>
        </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="filter.status">
          <el-option label="全部状态" value="all" />
          <el-option
            v-for="s in rechargeStatusValues"
            :key="s"
            :label="RechargeStatusLabel[s]"
            :value="s"
          />
        </el-select>
      </el-form-item>
    </FilterBar>
    </template>

    <el-table
      v-loading="loading"
      :data="displayRecords"
      row-key="id"
      size="small"
      class="compact-table"
      height="100%"
      :empty-text="' '"
    >
      <el-table-column label="流水号" min-width="180" prop="id">
        <template #default="{ row }: { row: RechargeRecord }">
          <span class="cell-uid">{{ row.id }}</span>
        </template>
      </el-table-column>

      <el-table-column label="账户" min-width="220">
        <template #default="{ row }: { row: RechargeRecord }">
          <div class="cell-account">
            <el-button
              link
              class="cell-account__uid"
              @click="router.push(`/accounts/${row.ownerAccountUid}`)"
            >
              {{ row.ownerAccountUid }}
            </el-button>
            <div class="cell-account__contact">
              <span v-if="row.ownerEmail">{{ row.ownerEmail }}</span>
              <span v-else-if="row.ownerPhone">{{ row.ownerPhone }}</span>
              <span v-else class="cell-muted">—</span>
            </div>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="渠道" width="120">
        <template #default="{ row }: { row: RechargeRecord }">
          <el-tag
            size="small"
            :type="isInternalProvider(row.provider) ? 'warning' : 'success'"
            effect="plain"
            round
          >
            {{ RechargeProviderLabel[row.provider] }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column label="业务单号" min-width="220">
        <template #default="{ row }: { row: RechargeRecord }">
          <span class="cell-refno">{{ row.refNo }}</span>
        </template>
      </el-table-column>

      <el-table-column label="状态" width="100">
        <template #default="{ row }: { row: RechargeRecord }">
          <StatusTag
            :label="RechargeStatusLabel[row.status]"
            :tone="RechargeStatusTone[row.status]"
          />
        </template>
      </el-table-column>

      <el-table-column label="金额" width="140" align="right">
        <template #default="{ row }: { row: RechargeRecord }">
          <span class="cell-money cell-money--in">
            +{{ formatMoney(row.amount, { currency: row.currency }) }}
          </span>
        </template>
      </el-table-column>

      <el-table-column label="日期" width="170">
        <template #default="{ row }: { row: RechargeRecord }">
          <span class="cell-date">{{ formatDateTime(row.paidAtUtc ?? row.createdAtUtc) }}</span>
        </template>
      </el-table-column>

      <template #empty>
        <EmptyState
          title="暂无充值记录"
          description="调整筛选条件或扩大时间范围后重试。"
        />
      </template>
    </el-table>

    <template #footer>
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        background
      />
    </template>
  </FillListPageLayout>
</template>

<style scoped>
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
.cell-account__contact {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}

.cell-refno {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12.5px;
  color: var(--el-text-color-primary);
}

.cell-money--in {
  color: var(--el-color-success);
}
</style>
