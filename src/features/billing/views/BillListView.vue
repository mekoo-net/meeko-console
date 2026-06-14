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
  VoucherDeductKindLabel,
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
  return row.ownerDisplayName?.trim() || row.ownerAccountUid;
}

function ownerSecondaryLine(row: BillingEntry): string {
  const email = row.ownerEmail?.trim() || '—';
  const phone = row.ownerPhone?.trim() || '—';
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

interface DeductionRow {
  tag: string;
  name: string;
  sub: string;
  amount: number;
  kind: 'voucher' | 'balance';
}

/** 把账单扣费聚合对象拆成表格行：先逐券抵扣（券名 + 序列号 + 类型），再钱包余额。 */
function deductionRows(row: BillingEntry): DeductionRow[] {
  const d = row.deduction;
  if (!d) return [];
  const rows: DeductionRow[] = [];
  for (const v of d.voucherItems) {
    const tag = v.deductKind ? VoucherDeductKindLabel[v.deductKind] : '代金券';
    rows.push({
      tag,
      name: v.name?.trim() || tag,
      sub: v.serialNo ?? `#${v.userVoucherId}`,
      amount: v.amountDeducted,
      kind: 'voucher',
    });
  }
  if (d.voucherItems.length === 0 && d.voucherDeducted > 0) {
    rows.push({ tag: '券', name: '代金券抵扣', sub: '', amount: d.voucherDeducted, kind: 'voucher' });
  }
  rows.push({ tag: '余额', name: '钱包余额', sub: '', amount: d.balanceDeducted, kind: 'balance' });
  return rows;
}

/** 仅当确实用了代金券抵扣时才展开明细，避免纯余额扣费刷屏。 */
function hasVoucherDeduction(row: BillingEntry): boolean {
  return row.deduction != null && row.deduction.voucherDeducted > 0;
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
              @click="router.push(`/accounts/${row.ownerAccountUid}`)"
            >
              <span class="cell-account__lines">
                <span class="cell-account__primary">{{ ownerPrimaryLine(row) }}</span>
                <span class="cell-account__secondary">{{ ownerSecondaryLine(row) }}</span>
              </span>
            </el-button>
            <span
              v-if="row.operatorAccountUid !== row.ownerAccountUid"
              class="cell-account__iam"
            >
              IAM · {{ row.operatorAccountUid }}
            </span>
          </div>
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
            v-if="row.subType != null"
            size="small"
            :type="row.subType === 'usage' ? 'warning' : 'info'"
            effect="plain"
            round
          >
            {{ BillSubTypeLabel[row.subType] }}
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

      <el-table-column label="金额 / 扣款明细" min-width="240" align="right">
        <template #default="{ row }: { row: BillingEntry }">
          <div class="cell-amount">
            <span
              class="cell-money"
              :class="{
                'cell-money--reverted': isReverseLike(row),
                'cell-money--failed': row.status === 'failed',
                'cell-money--out': row.status === 'completed' && row.refType !== 'recharge',
                'cell-money--in': row.refType === 'recharge',
              }"
            >
              {{ row.refType === 'recharge' ? '+' : '-' }}{{ formatMoney(row.actualAmount, { currency: row.currency }) }}
            </span>
            <template v-if="hasVoucherDeduction(row)">
              <span class="cell-amount__saved">
                券抵 {{ formatMoney(row.deduction!.voucherDeducted, { currency: row.currency }) }}
              </span>
              <div class="deduct-detail">
                <div
                  v-for="(d, i) in deductionRows(row)"
                  :key="i"
                  class="deduct-detail__row"
                >
                  <span
                    class="deduct-detail__tag"
                    :class="d.kind === 'voucher' ? 'is-voucher' : 'is-balance'"
                  >
                    {{ d.tag }}
                  </span>
                  <span class="deduct-detail__name">
                    {{ d.name }}
                    <span v-if="d.sub" class="deduct-detail__serial">{{ d.sub }}</span>
                  </span>
                  <span class="deduct-detail__amount">
                    -{{ formatMoney(d.amount, { currency: row.currency }) }}
                  </span>
                </div>
                <div class="deduct-detail__total">
                  应扣 {{ formatMoney(row.deduction!.total, { currency: row.currency }) }}
                </div>
              </div>
            </template>
            <span
              v-else-if="row.actualAmount !== row.originalAmount"
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
  font-size: 11px;
  color: var(--el-color-success);
  font-weight: 600;
  margin-top: 2px;
}
.deduct-detail {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  margin-top: 4px;
}
.deduct-detail__row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  line-height: 1.4;
}
.deduct-detail__tag {
  flex-shrink: 0;
  font-size: 10px;
  padding: 0 4px;
  border-radius: 3px;
  border: 1px solid currentColor;
  line-height: 1.4;
}
.deduct-detail__tag.is-voucher {
  color: var(--el-color-success);
}
.deduct-detail__tag.is-balance {
  color: var(--el-color-warning);
}
.deduct-detail__name {
  color: var(--el-text-color-regular);
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.deduct-detail__serial {
  margin-left: 4px;
  color: var(--el-text-color-placeholder);
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10px;
}
.deduct-detail__amount {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  color: var(--el-text-color-regular);
  font-variant-numeric: tabular-nums;
}
.deduct-detail__total {
  font-size: 11px;
  color: var(--el-text-color-primary);
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
