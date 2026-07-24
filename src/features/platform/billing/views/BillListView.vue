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

import { InfoFilled, View } from '@element-plus/icons-vue';

import PageHeader from '@/shared/ui/PageHeader.vue';
import StatusTag from '@/shared/ui/StatusTag.vue';
import FilterBar from '@/shared/ui/FilterBar.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import FillListPageLayout from '@/shared/ui/FillListPageLayout.vue';
import { formatMoney } from '@/shared/lib/money';
import { formatDateTime, toLocalDateTimeValue } from '@/shared/lib/date';
import { dateRangeToEpochMillis } from '@/shared/lib/epoch';

import {
  billStatusValues,
  billSubTypeValues,
  BillFailureCodeLabel,
  BillReversedCodeLabel,
  BillStatusLabel,
  BillStatusTone,
  BillSubTypeLabel,
  type BillingEntry,
  type BillStatus,
  type BillSubType,
} from '../model/billing.types';
import { getBillingPort } from '../services';
import type { ListBillsFilter } from '../services/ports/billingPort';
import BillDetailDrawer from '../components/BillDetailDrawer.vue';

const router = useRouter();
const billingPort = getBillingPort();

const records = ref<BillingEntry[]>([]);
const total = ref(0);
const loading = ref(false);

const page = ref(1);
const pageSize = ref(20);

interface PageFilter {
  accountUid: string;
  contactKeyword: string;
  dateRange: [string, string] | null;
  productCode: string;
  subType: BillSubType | 'all';
  status: BillStatus | 'all';
}

const last24h = (): [string, string] => {
  const now = new Date();
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return [toLocalDateTimeValue(from), toLocalDateTimeValue(now)];
};

const defaultFilter = (): PageFilter => ({
  accountUid: '',
  contactKeyword: '',
  dateRange: last24h(),
  productCode: '',
  subType: 'all',
  status: 'all',
});

const filter = ref<PageFilter>(defaultFilter());

function buildPortFilter(): ListBillsFilter {
  const f: ListBillsFilter = {
    productCode: filter.value.productCode.trim() || 'all',
    subType: filter.value.subType,
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
    const email = (r.owner.email ?? '').toLowerCase();
    const phone = r.owner.phone ?? '';
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
      filter.value.productCode,
      filter.value.subType,
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

function ownerPrimaryLine(row: BillingEntry): string {
  return row.owner.displayName?.trim() || row.owner.accountUid;
}

function ownerSecondaryLine(row: BillingEntry): string {
  const email = row.owner.email?.trim() || '—';
  const phone = row.owner.phone?.trim() || '—';
  return `${email} · ${phone}`;
}

function isReverseLike(row: BillingEntry): boolean {
  return row.status === 'reversed' || row.status === 'partial_refunded';
}

const detailOpen = ref(false);
const detailBillId = ref<string | null>(null);

function openDetail(row: BillingEntry): void {
  detailBillId.value = row.id;
  detailOpen.value = true;
}

/** 第一行展示的金额：有扣费拆分时取钱包余额扣除额（可能为 0），否则回落到实际扣费额。 */
function balanceAmount(row: BillingEntry): number {
  return row.deduction ? row.deduction.balanceDeducted : row.amount.actual;
}

/** 第二行券抵金额，仅当本笔有代金券抵扣时返回 > 0，用于决定是否渲染。 */
function voucherAmount(row: BillingEntry): number {
  return row.deduction?.voucherDeducted ?? 0;
}

onMounted(() => {
  void fetchData();
});
</script>

<template>
  <FillListPageLayout>
    <template #header>
      <PageHeader
        title="账单流水"
        description="账户钱包扣款流水（订阅 / 用量 / 一次性订单）。错扣回滚、部分退还直接驳回原账单，保留原始扣费与实际扣费便于审计。"
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
        <el-form-item label="产品">
          <el-input
            v-model="filter.productCode"
            placeholder="产品代码，如 demux"
            clearable
          />
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
      <el-table-column label="详情" width="56" align="center" fixed>
        <template #default="{ row }: { row: BillingEntry }">
          <el-button
            :icon="View"
            link
            type="primary"
            title="查看详情"
            @click="openDetail(row)"
          />
        </template>
      </el-table-column>

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
              type="primary"
              class="cell-account__link"
              @click="router.push(`/accounts/${row.owner.accountUid}`)"
            >
              <span class="cell-account__lines">
                <span class="cell-account__primary">{{ ownerPrimaryLine(row) }}</span>
                <span class="cell-account__secondary">{{ ownerSecondaryLine(row) }}</span>
              </span>
            </el-button>
            <span
              v-if="row.operator.accountUid !== row.owner.accountUid"
              class="cell-account__iam"
            >
              IAM · {{ row.operator.accountUid }}
            </span>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="产品" min-width="160">
        <template #default="{ row }: { row: BillingEntry }">
          <span v-if="row.business.productCode" class="cell-product">{{ row.business.productCode }}</span>
          <span v-else class="cell-muted">—</span>
        </template>
      </el-table-column>

      <el-table-column label="类型" width="120">
        <template #default="{ row }: { row: BillingEntry }">
          <el-tag
            v-if="row.business.subType != null"
            size="small"
            :type="row.business.subType === 'usage' ? 'warning' : 'info'"
            effect="plain"
            round
          >
            {{ BillSubTypeLabel[row.business.subType] }}
          </el-tag>
          <span v-else class="cell-muted">—</span>
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

      <el-table-column label="金额" min-width="150" align="right">
        <template #default="{ row }: { row: BillingEntry }">
          <div class="cell-amount">
            <span
              v-if="row.business.refType === 'recharge'"
              class="cell-money cell-money--in"
            >
              +{{ formatMoney(row.amount.actual, { currency: row.amount.currency }) }}
            </span>
            <template v-else>
              <span
                class="cell-money"
                :class="{
                  'cell-money--reverted': isReverseLike(row),
                  'cell-money--failed': row.status === 'failed',
                  'cell-money--out': row.status === 'completed',
                }"
              >
                -{{ formatMoney(balanceAmount(row), { currency: row.amount.currency }) }}
              </span>
              <span v-if="voucherAmount(row) > 0" class="cell-amount__saved">
                券抵 {{ formatMoney(voucherAmount(row), { currency: row.amount.currency }) }}
              </span>
              <span
                v-else-if="!row.deduction && row.amount.actual !== row.amount.original"
                class="cell-amount__original"
              >
                原 {{ formatMoney(row.amount.original, { currency: row.amount.currency }) }}
              </span>
            </template>
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
            v-if="row.failureCode || row.reversal?.code"
            placement="left"
            effect="dark"
          >
            <template #content>
              <div class="tooltip-block">
                <div v-if="row.failureCode" class="tooltip-block__reason">
                  失败原因：{{ BillFailureCodeLabel[row.failureCode] }}
                </div>
                <div v-if="row.reversal?.code" class="tooltip-block__reason">
                  驳回原因：{{ BillReversedCodeLabel[row.reversal.code] }}
                </div>
                <div v-if="row.reversal?.atUtc" class="tooltip-block__time">
                  驳回时间：{{ formatDateTime(row.reversal.atUtc) }}
                </div>
              </div>
            </template>
            <el-icon class="cell-info-icon"><InfoFilled /></el-icon>
          </el-tooltip>
        </template>
      </el-table-column>

      <template #empty>
        <EmptyState
          title="暂无账单流水"
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

  <BillDetailDrawer v-model="detailOpen" :bill-id="detailBillId" />
</template>

<style scoped>
/* 账户列：第一行名称，第二行邮箱/手机；IAM 子账户时附一个紧凑标签 */
.cell-account {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  line-height: 1.35;
}
.cell-account__link {
  padding: 0;
  height: auto;
  justify-content: flex-start;
}
.cell-account__lines {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  text-align: left;
}
.cell-account__primary {
  font-size: 12.5px;
  color: var(--el-text-color-primary);
  word-break: break-all;
}
.cell-account__secondary {
  font-size: 11.5px;
  color: var(--el-text-color-secondary);
  word-break: break-all;
}
.cell-account__iam {
  margin-top: 3px;
  font-size: 11px;
  color: var(--el-color-warning);
  border: 1px solid currentColor;
  border-radius: 3px;
  padding: 0 4px;
  line-height: 1.4;
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
.cell-amount__saved {
  font-size: 12px;
  color: var(--el-color-success);
  margin-top: 2px;
}
.cell-money--out {
  color: var(--el-color-warning);
}
.cell-money--in {
  color: var(--el-color-success);
}
.cell-money--reverted {
  color: var(--el-text-color-secondary);
  text-decoration: line-through;
}
.cell-money--failed {
  color: var(--el-color-danger);
  opacity: 0.6;
}

.cell-muted {
  color: var(--el-text-color-placeholder);
  font-size: 13px;
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
