<script setup lang="ts">
/**
 * 消耗报表：时间范围内按小时（可改按天 / 合计）拆渠道或模型，分页看调用与扣费。
 * 点渠道名下钻到该渠道的模型；点模型名回到渠道。
 */
import { computed, onMounted, ref, watch } from 'vue';

import { Download } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

import PageHeader from '@/shared/ui/PageHeader.vue';
import { BILLING_FRACTION_DIGITS, formatMoney } from '@/shared/lib/money';
import { dateRangeToEpochMillis } from '@/shared/lib/epoch';
import { toLocalDateTimeValue } from '@/shared/lib/date';
import { clientPaginate, usePagination } from '@/shared/composables/usePagination';
import { formatBucketLabel, pct, shortNumber } from '../components/overview/chartUtils';
import type { ConsumptionReport, ReportBreakdown, ReportTimeBucket } from '@demux/common';
import type { ProviderGroup } from '../model/catalog.types';
import {
  cellsToTableRows,
  groupLabel,
  isTimedBucket,
  sumCells,
  type ReportTableRow,
} from '../model/consumptionReport';
import { getDemuxCatalogPort, getDemuxLogsPort } from '../services';

import DateRangeBar from '../components/overview/DateRangeBar.vue';
import Panel from '../components/overview/Panel.vue';

const logsPort = getDemuxLogsPort();
const catalogPort = getDemuxCatalogPort();

const last24h = (): [string, string] => {
  const now = new Date();
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return [toLocalDateTimeValue(from), toLocalDateTimeValue(now)];
};

const dateRange = ref<[string, string] | null>(last24h());
const timeBucket = ref<ReportTimeBucket>('hour');
const breakdown = ref<Extract<ReportBreakdown, 'vendor' | 'model'>>('vendor');
const vendorKeys = ref<string[]>([]);

const groups = ref<ProviderGroup[]>([]);
const loading = ref(false);
const report = ref<ConsumptionReport | null>(null);
const pagination = usePagination({ pageSize: 20, pageSizes: [20, 50, 100] });

const rangeMs = computed(() => {
  if (!dateRange.value?.[0] || !dateRange.value[1]) return null;
  const r = dateRangeToEpochMillis(dateRange.value);
  if (r.fromUtc == null || r.toUtc == null) return null;
  return { fromUtc: r.fromUtc, toUtc: r.toUtc };
});

const cells = computed(() => report.value?.cells ?? []);
const sortKey = ref<keyof Pick<
  ReportTableRow,
  'bucketStartUtc' | 'requestCount' | 'totalPromptTokens' | 'totalCompletionTokens' | 'totalTokens' | 'totalCost'
>>('totalCost');
const sortAsc = ref(false);

const rows = computed(() => {
  const list = cellsToTableRows(cells.value);
  const key = sortKey.value;
  const dir = sortAsc.value ? 1 : -1;
  return [...list].sort((a, b) => {
    const d = (a[key] - b[key]) * dir;
    return d !== 0 ? d : b.totalCost - a.totalCost;
  });
});
const pagedRows = computed(() =>
  clientPaginate(rows.value, pagination.state.page, pagination.state.pageSize),
);
const totals = computed(() => sumCells(cells.value));
const avgCost = computed(() => (totals.value.calls > 0 ? totals.value.cost / totals.value.calls : 0));
const avgTokens = computed(() =>
  totals.value.calls > 0
    ? Math.round((totals.value.prompt + totals.value.completion) / totals.value.calls)
    : 0,
);
const showTime = computed(() => isTimedBucket(timeBucket.value));
const nameColumn = computed(() => (breakdown.value === 'vendor' ? '渠道' : '模型'));
const bucketSeconds = computed(() => report.value?.bucketSeconds ?? (timeBucket.value === 'day' ? 86400 : 3600));

watch(rows, (list) => {
  pagination.setTotal(list.length);
});

async function fetchReport(): Promise<void> {
  const range = rangeMs.value;
  if (!range) {
    ElMessage.warning('请先选择时间范围');
    return;
  }
  loading.value = true;
  try {
    const r = await logsPort.statConsumption({
      fromUtc: range.fromUtc,
      toUtc: range.toUtc,
      timeBucket: timeBucket.value,
      breakdown: breakdown.value,
      vendorKeys: vendorKeys.value,
    });
    if (r.success) {
      report.value = r.data;
      pagination.setPage(1);
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    loading.value = false;
  }
}

function onReset(): void {
  dateRange.value = last24h();
  timeBucket.value = 'hour';
  breakdown.value = 'vendor';
  vendorKeys.value = [];
}

function drill(key: string): void {
  if (!key) return;
  if (breakdown.value === 'vendor') {
    vendorKeys.value = [key];
    breakdown.value = 'model';
  } else {
    vendorKeys.value = [];
    breakdown.value = 'vendor';
  }
  void fetchReport();
}

function csvCell(v: string | number): string {
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

function exportCsv(): void {
  if (rows.value.length === 0) {
    ElMessage.warning('没有可导出的数据');
    return;
  }
  const costTotal = totals.value.cost;
  const header = showTime.value
    ? ['时间', nameColumn.value, '调用次数', '输入 Token', '输出 Token', 'Token 合计', '扣费', '占比']
    : [nameColumn.value, '调用次数', '输入 Token', '输出 Token', 'Token 合计', '扣费', '占比'];
  const lines = [
    header.join(','),
    ...rows.value.map((r) => {
      const share = costTotal > 0 ? (r.totalCost / costTotal).toFixed(4) : '0';
      const body = [
        csvCell(groupLabel(r.key, breakdown.value)),
        r.requestCount,
        r.totalPromptTokens,
        r.totalCompletionTokens,
        r.totalTokens,
        r.totalCost,
        share,
      ];
      if (showTime.value) {
        body.unshift(csvCell(formatBucketLabel(r.bucketStartUtc, bucketSeconds.value)));
      }
      return body.join(',');
    }),
  ];
  const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `demux-report-${breakdown.value}-${timeBucket.value}-${stamp}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function shareOf(row: ReportTableRow): number {
  return totals.value.cost > 0 ? row.totalCost / totals.value.cost : 0;
}

function onSortChange(payload: { prop?: string; order?: string | null }): void {
  const prop = payload.prop;
  if (
    prop === 'bucketStartUtc' ||
    prop === 'requestCount' ||
    prop === 'totalPromptTokens' ||
    prop === 'totalCompletionTokens' ||
    prop === 'totalTokens' ||
    prop === 'totalCost'
  ) {
    sortKey.value = prop;
    sortAsc.value = payload.order === 'ascending';
    pagination.setPage(1);
    return;
  }
  sortKey.value = 'totalCost';
  sortAsc.value = false;
}

async function loadGroups(): Promise<void> {
  const r = await catalogPort.listProviderGroups();
  if (r.success) groups.value = r.data;
}

onMounted(() => {
  void loadGroups();
  void fetchReport();
});
</script>

<template>
  <div class="page">
    <PageHeader title="报表" description="按成功调用看扣费。默认按小时、按渠道；点渠道名可看该渠道下的模型。">
      <template #actions>
        <el-button :icon="Download" :disabled="rows.length === 0" @click="exportCsv">导出 CSV</el-button>
      </template>
    </PageHeader>

    <DateRangeBar
      v-model:date-range="dateRange"
      :loading="loading"
      @refresh="fetchReport"
      @reset="onReset"
    >
      <el-form-item label="粒度">
        <el-radio-group v-model="timeBucket" @change="fetchReport">
          <el-radio-button value="hour">按小时</el-radio-button>
          <el-radio-button value="day">按天</el-radio-button>
          <el-radio-button value="none">合计</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="拆分">
        <el-radio-group v-model="breakdown" @change="fetchReport">
          <el-radio-button value="vendor">按渠道</el-radio-button>
          <el-radio-button value="model">按模型</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="渠道">
        <el-select
          v-model="vendorKeys"
          multiple
          filterable
          clearable
          collapse-tags
          collapse-tags-tooltip
          placeholder="全部渠道"
          style="width: 280px"
        >
          <el-option
            v-for="g in groups"
            :key="g.queueGroup"
            :label="g.queueGroup"
            :value="g.queueGroup"
          />
        </el-select>
      </el-form-item>
    </DateRangeBar>

    <div class="kpis">
      <div class="kpi">
        <div class="kpi__label">成功调用</div>
        <div class="kpi__value">{{ totals.calls.toLocaleString() }}</div>
      </div>
      <div class="kpi">
        <div class="kpi__label">Tokens</div>
        <div class="kpi__value">{{ shortNumber(totals.prompt + totals.completion) }}</div>
        <div class="kpi__sub">
          入 {{ totals.prompt.toLocaleString() }} · 出 {{ totals.completion.toLocaleString() }}
        </div>
      </div>
      <div class="kpi">
        <div class="kpi__label">均次扣费</div>
        <div class="kpi__value">{{ formatMoney(avgCost, { fractionDigits: BILLING_FRACTION_DIGITS }) }}</div>
        <div class="kpi__sub">均次 {{ avgTokens.toLocaleString() }} tokens</div>
      </div>
      <div class="kpi kpi--accent">
        <div class="kpi__label">总扣费</div>
        <div class="kpi__value">{{ formatMoney(totals.cost, { fractionDigits: BILLING_FRACTION_DIGITS }) }}</div>
      </div>
    </div>

    <Panel fill title="消耗">
      <template #actions>
        <span class="hint">仅成功调用 · 按扣费降序</span>
      </template>
      <div class="table-shell">
        <el-table
          :key="`${breakdown}-${timeBucket}`"
          v-loading="loading"
          class="report-table"
          :data="pagedRows"
          height="100%"
          row-key="rowKey"
          size="small"
          stripe
          :default-sort="{ prop: 'totalCost', order: 'descending' }"
          empty-text="该时间范围内没有成功调用"
          @sort-change="onSortChange"
        >
        <el-table-column v-if="showTime" prop="bucketStartUtc" label="时间" min-width="140" sortable>
          <template #default="{ row }: { row: ReportTableRow }">
            <span class="num">{{ formatBucketLabel(row.bucketStartUtc, bucketSeconds) }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="nameColumn" min-width="220">
          <template #default="{ row }: { row: ReportTableRow }">
            <el-button
              v-if="row.key"
              link
              type="primary"
              class="name-btn mono"
              :title="breakdown === 'vendor' ? '查看该渠道下的模型消耗' : '改回按渠道查看'"
              @click="drill(row.key)"
            >
              {{ groupLabel(row.key, breakdown) }}
            </el-button>
            <span v-else class="mono">{{ groupLabel(row.key, breakdown) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="requestCount" label="调用" min-width="100" align="right" sortable>
          <template #default="{ row }: { row: ReportTableRow }">
            <span class="num">{{ row.requestCount.toLocaleString() }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="totalPromptTokens" label="输入 Token" min-width="120" align="right" sortable>
          <template #default="{ row }: { row: ReportTableRow }">
            <span class="num">{{ row.totalPromptTokens.toLocaleString() }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="totalCompletionTokens" label="输出 Token" min-width="120" align="right" sortable>
          <template #default="{ row }: { row: ReportTableRow }">
            <span class="num">{{ row.totalCompletionTokens.toLocaleString() }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="totalTokens" label="Token 合计" min-width="120" align="right" sortable>
          <template #default="{ row }: { row: ReportTableRow }">
            <span class="num">{{ row.totalTokens.toLocaleString() }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="totalCost" label="扣费" min-width="140" align="right" sortable>
          <template #default="{ row }: { row: ReportTableRow }">
            <span class="cell-money">{{ formatMoney(row.totalCost, { fractionDigits: BILLING_FRACTION_DIGITS }) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="占比" min-width="88" align="right">
          <template #default="{ row }: { row: ReportTableRow }">
            <span class="num">{{ pct(shareOf(row)) }}</span>
          </template>
        </el-table-column>
      </el-table>
      </div>
      <div class="pagination-bar">
        <el-pagination
          v-model:current-page="pagination.state.page"
          v-model:page-size="pagination.state.pageSize"
          :total="pagination.state.total"
          :page-sizes="pagination.pageSizes"
          layout="total, sizes, prev, pager, next"
          background
        />
      </div>
    </Panel>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: calc(100vh - 56px - 52px);
  min-height: 480px;
  box-sizing: border-box;
}
.page :deep(.page-header) {
  margin-bottom: 0;
  flex-shrink: 0;
}
.kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  flex-shrink: 0;
}
@media (max-width: 1100px) {
  .kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
.kpi {
  background: #fff;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 14px 16px;
}
.kpi--accent {
  background: linear-gradient(135deg, #ecfdf5 0%, #fff 70%);
  border-color: #a7f3d0;
}
.kpi__label {
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
}
.kpi__value {
  margin-top: 6px;
  font-size: 22px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-primary);
  line-height: 1.2;
}
.kpi__sub {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}
.hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.name-btn {
  padding: 0;
  height: auto;
  font-weight: 600;
}
.mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}
.num {
  font-variant-numeric: tabular-nums;
}
.cell-money {
  color: var(--el-color-success);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.pagination-bar {
  display: flex;
  justify-content: flex-end;
  padding: 12px 0 0;
  flex-shrink: 0;
}
.table-shell {
  flex: 1;
  min-height: 0;
  height: 100%;
}
.report-table {
  width: 100%;
}
.page :deep(.filter-bar) {
  margin-bottom: 0;
  flex-shrink: 0;
}
</style>
