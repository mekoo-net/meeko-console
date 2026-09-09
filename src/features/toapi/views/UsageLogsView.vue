<script setup lang="ts">
/**
 * ToApi 调用日志：占用单读模型，形状对齐 Demux LogEntry。
 * - 必须带时间范围（最长 7 天）；输入 TraceId 精确检索时例外
 * - 供应商筛选按 vendorKey 精确匹配；模型名模糊
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Search, View } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

import {
  AiUsageStatusLabel,
  aiUsageStatusValues,
  billingTypeText,
  logErrorCodeText,
  logProtocolText,
  type AiUsageStatus,
} from '@demux/common';
import EmptyState from '@/shared/ui/EmptyState.vue';
import FillListPageLayout from '@/shared/ui/FillListPageLayout.vue';
import FilterBar from '@/shared/ui/FilterBar.vue';
import PageHeader from '@/shared/ui/PageHeader.vue';
import StatusTag from '@/shared/ui/StatusTag.vue';
import { formatDateTime, toLocalDateTimeValue } from '@/shared/lib/date';
import { dateRangeToEpochMillis } from '@/shared/lib/epoch';
import { BILLING_FRACTION_DIGITS, formatMoney } from '@/shared/lib/money';

import ChannelTag from '../components/ChannelTag.vue';
import UsageLogDetailDrawer from '../components/UsageLogDetailDrawer.vue';
import type { SupplyGroup } from '../model/pricing.types';
import {
  TokenKindLabel,
  tokenKindValues,
  type ListUsageLogsFilter,
  type TokenKind,
  type UsageLog,
  type UsageLogStats,
} from '../model/usage.types';
import { getToApiPricingPort, getToApiUsagePort } from '../services';

const route = useRoute();
const router = useRouter();
const usagePort = getToApiUsagePort();
const pricingPort = getToApiPricingPort();

const records = ref<UsageLog[]>([]);
const total = ref(0);
const loading = ref(false);
const stats = ref<UsageLogStats | null>(null);
const groups = ref<SupplyGroup[]>([]);

const page = ref(1);
const pageSize = ref(20);

interface PageFilter {
  accountUid: string;
  contactKeyword: string;
  dateRange: [string, string] | null;
  vendorKey: string;
  modelName: string;
  traceId: string;
  status: AiUsageStatus | 'all';
  tokenKind: TokenKind | 'all';
}

const last24h = (): [string, string] => {
  const now = new Date();
  return [toLocalDateTimeValue(new Date(now.getTime() - 24 * 60 * 60 * 1000)), toLocalDateTimeValue(now)];
};

const defaultFilter = (): PageFilter => ({
  accountUid: '',
  contactKeyword: '',
  dateRange: last24h(),
  vendorKey: typeof route.query.group === 'string' ? route.query.group : '',
  modelName: typeof route.query.model === 'string' ? route.query.model : '',
  traceId: '',
  status: 'all',
  tokenKind: 'all',
});

const filter = ref<PageFilter>(defaultFilter());

const detailOpen = ref(false);
const detailLog = ref<UsageLog | null>(null);

const groupName = computed(() => new Map(groups.value.map((g) => [g.key, g.name])));

/** `unknown` 是兜底态，不给运营当筛选项。 */
const statusOptions = aiUsageStatusValues.filter((s) => s !== 'unknown');

function buildPortFilter(): ListUsageLogsFilter | null {
  const f: ListUsageLogsFilter = {
    accountUid: filter.value.accountUid.trim() || undefined,
    contactKeyword: filter.value.contactKeyword.trim() || undefined,
    vendorKey: filter.value.vendorKey.trim() || undefined,
    modelName: filter.value.modelName.trim() || undefined,
    traceId: filter.value.traceId.trim() || undefined,
    status: filter.value.status,
    tokenKind: filter.value.tokenKind,
  };
  if (filter.value.dateRange?.[0] && filter.value.dateRange[1]) {
    Object.assign(f, dateRangeToEpochMillis(filter.value.dateRange));
  }
  if (!f.traceId && (f.fromUtc == null || f.toUtc == null)) return null;
  return f;
}

async function fetchData(): Promise<void> {
  const f = buildPortFilter();
  if (!f) {
    ElMessage.warning('请先选择时间范围（最长 7 天），或输入 TraceId');
    return;
  }
  loading.value = true;
  try {
    const [list, st] = await Promise.all([
      usagePort.list({ page: page.value, pageSize: pageSize.value, filter: f }),
      usagePort.stats(f),
    ]);
    if (list.success) {
      records.value = list.data.items;
      total.value = list.data.total;
    } else {
      ElMessage.error(list.error.message);
    }
    if (st.success) stats.value = st.data;
  } finally {
    loading.value = false;
  }
}

async function fetchGroups(): Promise<void> {
  const r = await pricingPort.listGroups();
  if (r.success) groups.value = r.data;
}

watch([page, pageSize], () => void fetchData());

watch(
  () => [
    filter.value.accountUid,
    filter.value.contactKeyword,
    filter.value.dateRange,
    filter.value.vendorKey,
    filter.value.modelName,
    filter.value.traceId,
    filter.value.status,
    filter.value.tokenKind,
  ],
  () => {
    if (page.value === 1) void fetchData();
    else page.value = 1;
  },
  { deep: true },
);

function resetFilter(): void {
  filter.value = { ...defaultFilter(), vendorKey: '', modelName: '' };
  page.value = 1;
}

function openDetail(row: UsageLog): void {
  detailLog.value = row;
  detailOpen.value = true;
}

function setVendor(key: string): void {
  filter.value.vendorKey = key;
}
function setModel(name: string): void {
  filter.value.modelName = name;
}

function statusTone(row: UsageLog): 'success' | 'warning' | 'danger' | 'info' {
  switch (row.status) {
    case 'success': return 'success';
    case 'pending': return 'warning';
    case 'failure': return 'danger';
    default: return 'info';
  }
}

function statusText(row: UsageLog): string {
  return row.status !== 'success' && row.content.error
    ? logErrorCodeText(row.content.error.code)
    : AiUsageStatusLabel[row.status];
}

function usageText(row: UsageLog): { main: string; sub: string } {
  switch (row.billingType) {
    case 'per_token':
      return {
        main: `${row.usage.totalTokens.toLocaleString()} tokens`,
        sub: `入 ${row.usage.input.tokens.toLocaleString()} · 出 ${row.usage.output.tokens.toLocaleString()}${row.usage.input.cachedReadTokens ? ` · 缓存 ${row.usage.input.cachedReadTokens.toLocaleString()}` : ''}`,
      };
    case 'per_image':
      return { main: `${row.usage.count} 张`, sub: `${row.usage.tier.size} · ${row.usage.tier.quality}` };
    case 'per_video':
      return { main: `${row.usage.seconds}s`, sub: row.usage.tier.resolution };
    default:
      return { main: '', sub: '' };
  }
}

function tokenText(row: UsageLog): string {
  const t = row.token;
  if (!t) return '—';
  return t.name?.trim() || `#${t.id}`;
}

const MODEL_TAG_PALETTE: ReadonlyArray<{ bg: string; fg: string }> = [
  { bg: '#eef2ff', fg: '#4f46e5' },
  { bg: '#ecfdf5', fg: '#059669' },
  { bg: '#eff6ff', fg: '#2563eb' },
  { bg: '#fff1f2', fg: '#e11d48' },
  { bg: '#fff7ed', fg: '#ea580c' },
  { bg: '#fdf4ff', fg: '#c026d3' },
  { bg: '#f0fdfa', fg: '#0d9488' },
  { bg: '#fefce8', fg: '#ca8a04' },
];
function modelTagStyle(name: string): { backgroundColor: string; color: string } {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const c = MODEL_TAG_PALETTE[h % MODEL_TAG_PALETTE.length]!;
  return { backgroundColor: c.bg, color: c.fg };
}

onMounted(() => {
  void fetchGroups();
  void fetchData();
});
</script>

<template>
  <FillListPageLayout>
    <template #header>
      <PageHeader
        title="调用日志"
        description="每条 = 一张占用单：Reserve 建行、Commit 落用量与实扣、失败释放。金额 CNY，按当时钉住的定价行结算。"
      />
    </template>

    <template #filters>
      <FilterBar
        v-model:account-uid="filter.accountUid"
        v-model:contact-keyword="filter.contactKeyword"
        v-model:date-range="filter.dateRange"
        :loading="loading"
        @refresh="fetchData"
        @reset="resetFilter"
      >
        <el-form-item label="TraceId">
          <el-input
            v-model="filter.traceId"
            :prefix-icon="Search"
            placeholder="精确匹配"
            clearable
            class="mono-input"
            style="width: 260px"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select
            v-model="filter.status"
            style="width: 140px"
          >
            <el-option
              label="全部"
              value="all"
            />
            <el-option
              v-for="s in statusOptions"
              :key="s"
              :label="AiUsageStatusLabel[s]"
              :value="s"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="调用方">
          <el-select
            v-model="filter.tokenKind"
            style="width: 140px"
          >
            <el-option
              label="全部"
              value="all"
            />
            <el-option
              v-for="k in tokenKindValues"
              :key="k"
              :label="TokenKindLabel[k]"
              :value="k"
            />
          </el-select>
        </el-form-item>

        <template #extra-row>
          <el-form-item label="供应商">
            <el-select
              v-model="filter.vendorKey"
              placeholder="全部"
              clearable
              style="width: 220px"
            >
              <el-option
                v-for="g in groups"
                :key="g.key"
                :label="`${g.name} (${g.key})`"
                :value="g.key"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="模型名">
            <el-input
              v-model="filter.modelName"
              :prefix-icon="Search"
              placeholder="模糊匹配"
              clearable
              style="width: 220px"
            />
          </el-form-item>
        </template>
      </FilterBar>

      <div
        v-if="stats"
        class="kpi"
      >
        <div class="kpi__item">
          <span class="kpi__label">请求</span><span class="kpi__value num">{{ stats.totalCalls.toLocaleString() }}</span>
        </div>
        <div class="kpi__item">
          <span class="kpi__label">成功</span><span class="kpi__value num">{{ stats.successCalls.toLocaleString() }}</span>
        </div>
        <div class="kpi__item">
          <span class="kpi__label">失败</span><span
            class="kpi__value num"
            :class="{ 'kpi__value--warn': stats.errorCalls > 0 }"
          >{{ stats.errorCalls.toLocaleString() }}</span>
        </div>
        <div class="kpi__item">
          <span class="kpi__label">实扣</span><span class="kpi__value num">{{ formatMoney(stats.totalCost) }}</span>
        </div>
        <div class="kpi__item">
          <span class="kpi__label">Tokens</span><span class="kpi__value num">{{ stats.totalTokens.toLocaleString() }}</span>
        </div>
        <div class="kpi__item">
          <span class="kpi__label">平均耗时</span><span class="kpi__value num">{{ stats.avgTokenLatency ? `${stats.avgTokenLatency.toLocaleString()} ms` : '—' }}</span>
        </div>
      </div>
    </template>

    <el-table
      v-loading="loading"
      :data="records"
      row-key="id"
      size="small"
      stripe
      class="log-table"
      height="100%"
      :empty-text="' '"
    >
      <el-table-column
        label="详情"
        width="56"
        align="center"
        fixed
      >
        <template #default="{ row }: { row: UsageLog }">
          <el-button
            :icon="View"
            link
            type="primary"
            title="查看详情"
            @click="openDetail(row)"
          />
        </template>
      </el-table-column>

      <el-table-column
        label="时间"
        width="172"
        fixed
      >
        <template #default="{ row }: { row: UsageLog }">
          <span class="cell-time mono">{{ formatDateTime(row.createAt, 'YYYY-MM-DD HH:mm:ss') }}</span>
        </template>
      </el-table-column>

      <el-table-column
        label="TraceId"
        min-width="200"
      >
        <template #default="{ row }: { row: UsageLog }">
          <span class="cell-trace mono">{{ row.traceId }}</span>
        </template>
      </el-table-column>

      <el-table-column
        label="状态"
        width="100"
        align="center"
      >
        <template #default="{ row }: { row: UsageLog }">
          <StatusTag
            :label="statusText(row)"
            :tone="statusTone(row)"
          />
        </template>
      </el-table-column>

      <el-table-column
        label="供应商"
        width="130"
      >
        <template #default="{ row }: { row: UsageLog }">
          <button
            type="button"
            class="link-btn"
            :title="`按「${row.vendorKey}」过滤`"
            @click="setVendor(row.vendorKey)"
          >
            <ChannelTag :vendor-key="row.vendorKey" />
          </button>
          <span class="cell-sub mono">{{ groupName.get(row.vendorKey) ?? row.vendorKey }}</span>
        </template>
      </el-table-column>

      <el-table-column
        label="模型"
        min-width="200"
      >
        <template #default="{ row }: { row: UsageLog }">
          <span
            class="model-pill mono"
            :style="modelTagStyle(row.modelName)"
            :title="`按模型「${row.modelName}」过滤`"
            @click="setModel(row.modelName)"
          >{{ row.modelName }}</span>
        </template>
      </el-table-column>

      <el-table-column
        label="计费"
        width="90"
        align="center"
      >
        <template #default="{ row }: { row: UsageLog }">
          <el-tag
            size="small"
            :type="row.billingType === 'unknown' ? 'warning' : 'info'"
            effect="plain"
            round
          >
            {{ billingTypeText(row.billingType) }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column
        label="用量"
        min-width="200"
      >
        <template #default="{ row }: { row: UsageLog }">
          <div
            v-if="usageText(row).main"
            class="cell-usage"
          >
            <span class="cell-usage__main num">{{ usageText(row).main }}</span>
            <span
              v-if="usageText(row).sub"
              class="cell-usage__sub num"
            >{{ usageText(row).sub }}</span>
          </div>
          <span
            v-else
            class="cell-muted"
          >—</span>
        </template>
      </el-table-column>

      <el-table-column
        label="扣费"
        width="112"
        align="right"
      >
        <template #default="{ row }: { row: UsageLog }">
          <span
            class="cell-cost num"
            :class="{ 'cell-cost--zero': row.cost.total === 0 }"
          >
            {{ formatMoney(row.cost.total, { fractionDigits: BILLING_FRACTION_DIGITS }) }}
          </span>
        </template>
      </el-table-column>

      <el-table-column
        label="耗时"
        width="96"
        align="right"
      >
        <template #default="{ row }: { row: UsageLog }">
          <span
            v-if="row.content.latencyMs != null"
            class="num cell-latency"
          >{{ row.content.latencyMs.toLocaleString() }} ms</span>
          <span
            v-else
            class="cell-muted"
          >—</span>
        </template>
      </el-table-column>

      <el-table-column
        label="调用方"
        min-width="150"
      >
        <template #default="{ row }: { row: UsageLog }">
          <div class="cell-caller">
            <span class="cell-caller__name">{{ tokenText(row) }}</span>
            <span class="cell-sub">
              <template v-if="row.token">{{ TokenKindLabel[row.token.kind] }} · </template>{{ logProtocolText(row.content.protocol) }}<template v-if="row.content.streamed"> · 流式</template>
            </span>
          </div>
        </template>
      </el-table-column>

      <el-table-column
        label="账户"
        min-width="168"
      >
        <template #default="{ row }: { row: UsageLog }">
          <el-button
            link
            type="primary"
            class="cell-account-link"
            @click="router.push(`/accounts/${row.account.uid}`)"
          >
            <span class="cell-account">
              <span class="cell-account__line">{{ row.account.email || row.account.uid }}</span>
              <span class="cell-account__line cell-account__line--sub">{{ row.account.phone || row.account.uid }}</span>
            </span>
          </el-button>
        </template>
      </el-table-column>

      <template #empty>
        <EmptyState
          title="该时间范围内无调用日志"
          description="尝试扩大时间窗口或清除其它过滤条件。"
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

  <UsageLogDetailDrawer
    v-model:visible="detailOpen"
    :log="detailLog"
  />
</template>

<style scoped>
.kpi {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.kpi__item {
  flex: 1;
  min-width: 120px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 14px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
}
.kpi__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.kpi__value {
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.kpi__value--warn {
  color: var(--el-color-danger);
}
.mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}
.mono-input :deep(.el-input__inner) {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}
.num {
  font-variant-numeric: tabular-nums;
}
.cell-time {
  font-size: 12px;
  color: var(--el-text-color-regular);
  white-space: nowrap;
}
.cell-trace {
  font-size: 11.5px;
  color: var(--el-text-color-secondary);
  word-break: break-all;
}
.cell-sub {
  display: block;
  font-size: 11.5px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
.cell-muted {
  color: var(--el-text-color-placeholder);
}
.link-btn {
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
}
.model-pill {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  padding: 1px 8px;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.7;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}
.model-pill:hover {
  filter: brightness(0.95);
}
.cell-usage {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.35;
}
.cell-usage__main {
  font-size: 12.5px;
  color: var(--el-text-color-primary);
}
.cell-usage__sub {
  font-size: 11.5px;
  color: var(--el-text-color-secondary);
}
.cell-cost {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  color: var(--el-color-warning);
  font-weight: 500;
}
.cell-cost--zero {
  color: var(--el-text-color-placeholder);
  font-weight: 400;
}
.cell-latency {
  font-size: 12.5px;
}
.cell-caller {
  display: flex;
  flex-direction: column;
  line-height: 1.35;
}
.cell-caller__name {
  font-size: 12.5px;
}
.cell-account-link {
  padding: 0;
  height: auto;
  font-size: 12.5px;
  justify-content: flex-start;
}
.cell-account {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  line-height: 1.35;
  text-align: left;
}
.cell-account__line {
  font-size: 12.5px;
  word-break: break-all;
}
.cell-account__line--sub {
  font-size: 11.5px;
  color: var(--el-text-color-secondary);
}
</style>
