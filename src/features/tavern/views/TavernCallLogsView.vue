<script setup lang="ts">
/**
 * Tavern 调用日志，版式同 Yomi 调用日志页：一行一次上游模型调用，扣费挂在行上。
 *
 *  - Tavern 按回合扣费：一回合多次调用（工具轮次）挂同一笔钱，「扣费」列在这几行上重复，标出共几次调用；
 *    没挂回合的由平台承担，「扣费」列给按现行价目的折算
 *  - 表格里可点的字段（管线 / 状态 / 渠道 / 模型 / 账户）写入筛选条件，筛选一变就重查
 *  - 驳回：行尾、详情抽屉驳回单个回合；「批量驳回」进勾选模式，勾这一页里能驳回的一次驳掉
 */
import { computed, onMounted, ref, watch } from 'vue';
import { ElMessage, type TableInstance } from 'element-plus';
import { RefreshLeft, Search, View } from '@element-plus/icons-vue';

import { AiUsageStatusLabel, logErrorCodeText } from '@yomi/common';
import PageHeader from '@/shared/ui/PageHeader.vue';
import StatusTag from '@/shared/ui/StatusTag.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import FilterBar from '@/shared/ui/FilterBar.vue';
import FillListPageLayout from '@/shared/ui/FillListPageLayout.vue';
import { formatDateTime } from '@/shared/lib/date';

import CallLogDrawer from '../components/metering/CallLogDrawer.vue';
import TurnReverseDialog from '../components/metering/TurnReverseDialog.vue';
import {
  TurnStatusLabel,
  callStatusValues,
  type CallLog,
  type CallStatus,
  type PipelineRef,
  type TurnReversed,
} from '../model/metering.types';
import {
  checkRange,
  formatCny,
  formatDuration,
  formatTokens,
  last24h,
  parseAccountUid,
  shortId,
} from '../model/meteringFormat';
import { roundTo } from '../model/pricingPreview';
import { getTavernCallLogPort, getTavernLlmSettingsPort } from '../services';

const port = getTavernCallLogPort();

type BilledFilter = '' | 'billed' | 'unbilled';

interface PageFilter {
  accountUid: string;
  dateRange: [string, string] | null;
  traceId: string;
  pipeline: string;
  /** 不分大小写匹配「渠道/模型」的一段。 */
  model: string;
  status: '' | CallStatus;
  billed: BilledFilter;
}

const defaultFilter = (): PageFilter => ({
  accountUid: '',
  dateRange: last24h(),
  traceId: '',
  pipeline: '',
  model: '',
  status: '',
  billed: '',
});

const filter = ref<PageFilter>(defaultFilter());
const records = ref<CallLog[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const loading = ref(false);
const pipelines = ref<PipelineRef[]>([]);
let seq = 0;

async function fetchData(): Promise<void> {
  const f = filter.value;
  const range = checkRange(f.dateRange);
  if (!range.ok) {
    ElMessage.warning(range.message);
    return;
  }
  const uid = parseAccountUid(f.accountUid);
  if (!uid.ok) {
    ElMessage.warning('账户 UID 只能是数字');
    return;
  }

  const mine = ++seq;
  loading.value = true;
  try {
    const r = await port.list({
      page: page.value,
      pageSize: pageSize.value,
      fromUtc: range.fromUtc,
      toUtc: range.toUtc,
      accountUid: uid.value,
      traceId: f.traceId.trim() || undefined,
      pipeline: f.pipeline || undefined,
      model: f.model.trim() || undefined,
      status: f.status || undefined,
      billed: f.billed === '' ? undefined : f.billed === 'billed',
    });
    if (mine !== seq) return;
    if (r.success) {
      records.value = r.data.items;
      total.value = r.data.total;
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    if (mine === seq) loading.value = false;
  }
}

watch([page, pageSize], () => void fetchData());

watch(
  filter,
  () => {
    // 已在第 1 页就直接拉，否则只改页码，由翻页 watcher 拉一次。
    if (page.value === 1) void fetchData();
    else page.value = 1;
  },
  { deep: true },
);

function resetFilter(): void {
  filter.value = defaultFilter();
}

function filterBy(patch: Partial<PageFilter>): void {
  Object.assign(filter.value, patch);
}

async function loadPipelines(): Promise<void> {
  const r = await getTavernLlmSettingsPort().get();
  if (r.success) pipelines.value = r.data.pipelines.map(({ id, label }) => ({ id, label }));
}

// ─── 详情 ────────────────────────────────────────────────

const detailOpen = ref(false);
const detailCall = ref<CallLog | null>(null);

function openDetail(row: CallLog): void {
  detailCall.value = row;
  detailOpen.value = true;
}

// ─── 驳回 ────────────────────────────────────────────────

const tableRef = ref<TableInstance>();
const selecting = ref(false);
const selected = ref<CallLog[]>([]);
const reverseOpen = ref(false);
/** 打开对话框那一刻要驳的调用；提交途中列表变了也不影响。 */
const reverseCalls = ref<CallLog[]>([]);

/** 勾的是调用，驳的是回合：同一回合的几行只算一次。 */
const selectedTurns = computed(() => {
  const byTurn = new Map<number, number>();
  for (const { bill } of selected.value) if (bill) byTurn.set(bill.usageLogId, bill.amount);
  return { count: byTurn.size, amount: roundTo([...byTurn.values()].reduce((s, a) => s + a, 0), 6) };
});

function toggleSelecting(): void {
  selecting.value = !selecting.value;
  if (!selecting.value) tableRef.value?.clearSelection();
}

function onRowClick(row: CallLog): void {
  if (selecting.value && row.bill?.reversible) tableRef.value?.toggleRowSelection(row);
}

function openReverse(calls: CallLog[]): void {
  reverseCalls.value = calls;
  reverseOpen.value = true;
}

/** 抽屉里点驳回：先收抽屉再开对话框，免得两层浮层抢焦点。 */
function onDrawerReverse(call: CallLog): void {
  detailOpen.value = false;
  setTimeout(() => openReverse([call]), 200);
}

/** 回合其余不变，只把驳回记录贴到挂这些回合的每一行上。 */
function onReversed(done: TurnReversed[]): void {
  const byTurn = new Map(done.map((o) => [o.id, o.reversal]));
  records.value = records.value.map((r): CallLog => {
    const reversal = r.bill && byTurn.get(r.bill.usageLogId);
    return r.bill && reversal
      ? { ...r, bill: { ...r.bill, status: 'reversed', reversible: false, reversal } }
      : r;
  });
  tableRef.value?.clearSelection();
}

// ─── 单元格 ──────────────────────────────────────────────

function statusLabel(row: CallLog): string {
  const code = row.content.error?.code;
  return row.status === 'failure' && code ? logErrorCodeText(code) : AiUsageStatusLabel[row.status];
}

/** 同 Yomi：模型名哈希到固定色板，同名同色，便于扫读。 */
const MODEL_TAG_PALETTE: ReadonlyArray<{ bg: string; fg: string }> = [
  { bg: '#eef2ff', fg: '#4f46e5' },
  { bg: '#ecfdf5', fg: '#059669' },
  { bg: '#eff6ff', fg: '#2563eb' },
  { bg: '#fff1f2', fg: '#e11d48' },
  { bg: '#fff7ed', fg: '#ea580c' },
  { bg: '#fdf4ff', fg: '#c026d3' },
  { bg: '#f0fdfa', fg: '#0d9488' },
  { bg: '#fefce8', fg: '#ca8a04' },
  { bg: '#f5f3ff', fg: '#7c3aed' },
  { bg: '#f0f9ff', fg: '#0284c7' },
];

function modelTagStyle(name: string): { backgroundColor: string; color: string } {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const c = MODEL_TAG_PALETTE[h % MODEL_TAG_PALETTE.length]!;
  return { backgroundColor: c.bg, color: c.fg };
}

interface UsageTag {
  key: string;
  arrow: string;
  value: string;
  kind: 'in' | 'out' | 'cache' | 'reason';
  title: string;
}

/** 同 Yomi 两行用量：第一行输入 + 缓存读，第二行输出 + 缓存写 + 推理。 */
function usageTagRows({ usage: { input, output } }: CallLog): UsageTag[][] {
  const inputRow: UsageTag[] = [
    { key: 'in', arrow: '▲', value: formatTokens(input.tokens), kind: 'in', title: `输入 ${input.tokens.toLocaleString()} tokens` },
  ];
  if (input.cachedReadTokens > 0) {
    inputRow.push({
      key: 'cache',
      arrow: '⚡',
      value: formatTokens(input.cachedReadTokens),
      kind: 'cache',
      title: `缓存命中 ${input.cachedReadTokens.toLocaleString()} tokens`,
    });
  }
  const outputRow: UsageTag[] = [
    { key: 'out', arrow: '▼', value: formatTokens(output.tokens), kind: 'out', title: `输出 ${output.tokens.toLocaleString()} tokens` },
  ];
  if (input.cachedWriteTokens > 0) {
    outputRow.push({
      key: 'cachew',
      arrow: '✎',
      value: formatTokens(input.cachedWriteTokens),
      kind: 'cache',
      title: `缓存写入 ${input.cachedWriteTokens.toLocaleString()} tokens`,
    });
  }
  if (output.reasoningTokens > 0) {
    outputRow.push({
      key: 'reason',
      arrow: '✦',
      value: formatTokens(output.reasoningTokens),
      kind: 'reason',
      title: `推理 ${output.reasoningTokens.toLocaleString()} tokens`,
    });
  }
  return [inputRow, outputRow];
}

onMounted(() => {
  void fetchData();
  void loadPipelines();
});
</script>

<template>
  <FillListPageLayout>
    <template #header>
      <PageHeader title="调用日志">
        <template #actions>
          <el-button
            :icon="RefreshLeft"
            type="danger"
            :plain="!selecting"
            @click="toggleSelecting"
          >
            {{ selecting ? '退出批量驳回' : '批量驳回' }}
          </el-button>
        </template>
      </PageHeader>
    </template>

    <template #filters>
      <FilterBar
        v-model:account-uid="filter.accountUid"
        v-model:date-range="filter.dateRange"
        :loading="loading"
        @refresh="fetchData"
        @reset="resetFilter"
      >
        <el-form-item label="TraceId">
          <el-input
            v-model="filter.traceId"
            :prefix-icon="Search"
            placeholder="精确匹配，看一个回合的全部调用"
            clearable
            class="mono-input"
            style="width: 300px"
          />
        </el-form-item>
        <el-form-item label="管线">
          <el-select
            v-model="filter.pipeline"
            placeholder="全部"
            clearable
            style="width: 160px"
          >
            <el-option
              v-for="p in pipelines"
              :key="p.id"
              :label="p.label"
              :value="p.id"
            />
          </el-select>
        </el-form-item>
        <template #extra-row>
          <el-form-item label="模型">
            <el-input
              v-model="filter.model"
              :prefix-icon="Search"
              placeholder="如 opus 或 kiro/"
              clearable
              style="width: 220px"
            />
          </el-form-item>
          <el-form-item label="状态">
            <el-select
              v-model="filter.status"
              placeholder="全部"
              clearable
              style="width: 140px"
            >
              <el-option
                v-for="s in callStatusValues"
                :key="s"
                :label="AiUsageStatusLabel[s]"
                :value="s"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="扣费">
            <el-select
              v-model="filter.billed"
              placeholder="全部"
              clearable
              style="width: 140px"
            >
              <el-option
                label="向用户收费"
                value="billed"
              />
              <el-option
                label="平台承担"
                value="unbilled"
              />
            </el-select>
          </el-form-item>
        </template>
      </FilterBar>

      <div
        v-if="selecting"
        class="select-bar"
      >
        <span>
          已选 <strong class="num">{{ selectedTurns.count }}</strong> 个回合<template v-if="selectedTurns.count">，退回
            <strong class="num">{{ formatCny(selectedTurns.amount) }}</strong></template>
        </span>
        <el-button
          type="danger"
          size="small"
          :disabled="!selectedTurns.count"
          @click="openReverse([...selected])"
        >
          驳回所选
        </el-button>
      </div>
    </template>

    <el-table
      ref="tableRef"
      v-loading="loading"
      :data="records"
      row-key="id"
      size="small"
      stripe
      class="log-table"
      :class="{ 'log-table--selecting': selecting }"
      height="100%"
      :empty-text="' '"
      @row-click="onRowClick"
      @selection-change="(rows: CallLog[]) => (selected = rows)"
    >
      <el-table-column
        v-if="selecting"
        type="selection"
        width="40"
        fixed
        :selectable="(row: CallLog) => row.bill?.reversible === true"
      />

      <el-table-column
        label="详情"
        width="56"
        align="center"
        fixed
      >
        <template #default="{ row }: { row: CallLog }">
          <el-button
            :icon="View"
            link
            type="primary"
            title="查看详情"
            @click.stop="openDetail(row)"
          />
        </template>
      </el-table-column>

      <el-table-column
        label="时间"
        width="172"
        fixed
      >
        <template #default="{ row }: { row: CallLog }">
          <span class="cell-time mono">{{ formatDateTime(row.createdAt, 'YYYY-MM-DD HH:mm:ss') }}</span>
        </template>
      </el-table-column>

      <el-table-column
        label="日志编号"
        min-width="190"
      >
        <template #default="{ row }: { row: CallLog }">
          <div class="cell-ids">
            <span class="cell-logid mono">{{ row.id }}</span>
            <span
              v-if="row.traceId"
              class="cell-trace mono"
            >{{ row.traceId }}</span>
            <span
              v-else
              class="cell-trace cell-muted"
            >—</span>
          </div>
        </template>
      </el-table-column>

      <el-table-column
        label="调用"
        min-width="150"
      >
        <template #default="{ row }: { row: CallLog }">
          <div class="cell-call">
            <div class="cell-call__meta">
              <el-button
                link
                type="primary"
                class="cell-link"
                :title="`按管线「${row.pipeline.label}」过滤`"
                @click.stop="filterBy({ pipeline: row.pipeline.id })"
              >
                {{ row.pipeline.label }}
              </el-button>
              <el-tag
                v-if="row.content.proactive"
                size="small"
                type="warning"
                effect="plain"
              >
                自主
              </el-tag>
            </div>
            <span
              class="cell-conv mono"
              :title="row.content.sessionId ?? '世界级调用，没有会话'"
            >{{ shortId(row.content.sessionId) }}</span>
          </div>
        </template>
      </el-table-column>

      <el-table-column
        label="状态"
        width="88"
        align="center"
      >
        <template #default="{ row }: { row: CallLog }">
          <button
            type="button"
            class="cell-status"
            :title="`按状态「${AiUsageStatusLabel[row.status]}」过滤`"
            @click.stop="filterBy({ status: row.status })"
          >
            <StatusTag
              :label="statusLabel(row)"
              :tone="row.status === 'success' ? 'success' : row.status === 'cancelled' ? 'info' : 'danger'"
            />
          </button>
        </template>
      </el-table-column>

      <el-table-column
        label="渠道"
        width="110"
      >
        <template #default="{ row }: { row: CallLog }">
          <el-button
            link
            type="primary"
            class="cell-link"
            :title="`按渠道「${row.vendorKey}」过滤`"
            @click.stop="filterBy({ model: `${row.vendorKey}/` })"
          >
            {{ row.vendorKey }}
          </el-button>
        </template>
      </el-table-column>

      <el-table-column
        label="模型"
        min-width="200"
      >
        <template #default="{ row }: { row: CallLog }">
          <span
            class="model-pill mono"
            :style="modelTagStyle(row.modelName)"
            :title="`按模型「${row.modelName}」过滤`"
            @click.stop="filterBy({ model: row.modelName })"
          >{{ row.modelName }}</span>
        </template>
      </el-table-column>

      <el-table-column
        label="用量"
        min-width="200"
      >
        <template #default="{ row }: { row: CallLog }">
          <div class="usage-tags">
            <div
              v-for="(line, i) in usageTagRows(row)"
              :key="i"
              class="usage-tags__line"
            >
              <span
                v-for="t in line"
                :key="t.key"
                class="usage-tag"
                :class="`usage-tag--${t.kind}`"
                :title="t.title"
              >
                <span class="usage-tag__arrow">{{ t.arrow }}</span><span class="usage-tag__value">{{ t.value }}</span><span class="usage-tag__unit">Token</span>
              </span>
            </div>
          </div>
        </template>
      </el-table-column>

      <el-table-column
        label="扣费"
        width="128"
        align="right"
      >
        <template #default="{ row }: { row: CallLog }">
          <div
            v-if="row.bill"
            class="cell-cost"
          >
            <span
              class="cell-cost__amount"
              :class="{ 'cell-cost__amount--void': row.bill.status !== 'charged' }"
            >{{ formatCny(row.bill.amount) }}</span>
            <el-tag
              v-if="row.bill.status !== 'charged'"
              size="small"
              type="info"
              effect="plain"
              class="cell-cost__tag"
            >
              {{ TurnStatusLabel[row.bill.status] }}
            </el-tag>
            <span
              v-if="row.bill.calls > 1"
              class="cell-cost__sub"
              title="一个回合扣一次，这几次调用挂的是同一笔"
            >整回合 · {{ row.bill.calls }} 次调用</span>
          </div>
          <div
            v-else
            class="cell-cost"
          >
            <span
              class="cell-cost__amount cell-cost__amount--platform"
              title="按现行价目折算"
            >{{ formatCny(row.cost.amount) }}</span>
            <el-tag
              size="small"
              type="info"
              effect="plain"
              class="cell-cost__tag"
            >
              平台承担
            </el-tag>
          </div>
        </template>
      </el-table-column>

      <el-table-column
        label="耗时"
        width="100"
        align="right"
      >
        <template #default="{ row }: { row: CallLog }">
          <span
            class="cell-latency num"
            :title="row.content.latencyMs != null ? `首字 ${formatDuration(row.content.latencyMs)}` : undefined"
          >{{ formatDuration(row.content.durationMs) }}</span>
        </template>
      </el-table-column>

      <el-table-column
        label="账户"
        width="120"
      >
        <template #default="{ row }: { row: CallLog }">
          <el-button
            link
            type="primary"
            class="cell-link mono"
            :title="`按账户 UID「${row.accountUid}」过滤`"
            @click.stop="filterBy({ accountUid: String(row.accountUid) })"
          >
            {{ row.accountUid }}
          </el-button>
        </template>
      </el-table-column>

      <el-table-column
        label="操作"
        width="72"
        align="center"
        fixed="right"
      >
        <template #default="{ row }: { row: CallLog }">
          <el-button
            v-if="row.bill?.reversible"
            :icon="RefreshLeft"
            link
            type="danger"
            @click.stop="openReverse([row])"
          >
            驳回
          </el-button>
          <span
            v-else
            class="cell-muted"
          >—</span>
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

  <CallLogDrawer
    v-model:visible="detailOpen"
    :call="detailCall"
    @reverse="onDrawerReverse"
    @trace="(traceId) => filterBy({ traceId })"
  />

  <TurnReverseDialog
    v-model:visible="reverseOpen"
    :calls="reverseCalls"
    @reversed="onReversed"
  />
</template>

<style scoped>
.mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}

.mono-input :deep(.el-input__inner) {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}

.num {
  font-variant-numeric: tabular-nums;
}

.select-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 14px;
  border: 1px solid var(--el-color-danger-light-7);
  border-radius: 8px;
  background: var(--el-color-danger-light-9);
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.log-table--selecting :deep(.el-table__row) {
  cursor: pointer;
}

.cell-time {
  font-size: 12px;
  color: var(--el-text-color-regular);
  white-space: nowrap;
}

.cell-ids {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  line-height: 1.35;
}

.cell-logid,
.cell-trace {
  display: block;
  width: 100%;
  font-size: 12px;
  line-height: 1.35;
  word-break: break-all;
  white-space: normal;
}

.cell-logid {
  color: var(--el-text-color-primary);
}

.cell-trace {
  color: var(--el-text-color-secondary);
}

.cell-call {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  line-height: 1.35;
}

.cell-call__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.cell-conv {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.cell-link {
  padding: 0;
  height: auto;
  font-size: 12.5px;
}

.cell-status {
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  line-height: 0;
}

.cell-muted {
  color: var(--el-text-color-placeholder);
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
  transition: filter 0.15s ease;
}

.model-pill:hover {
  filter: brightness(0.95);
}

.usage-tags {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.usage-tags__line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.usage-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
  font-size: 11.5px;
  font-weight: 500;
  line-height: 1.7;
  white-space: nowrap;
}

.usage-tag__arrow {
  font-size: 9px;
  font-weight: 700;
}

.usage-tag__value {
  font-weight: 600;
}

.usage-tag__unit {
  font-size: 10px;
  opacity: 0.6;
}

.usage-tag--in {
  background: var(--el-color-success-light-9);
  border-color: var(--el-color-success-light-7);
  color: var(--el-color-success);
}

.usage-tag--out {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary-light-7);
  color: var(--el-color-primary);
}

.usage-tag--cache {
  background: var(--el-color-warning-light-9);
  border-color: var(--el-color-warning-light-7);
  color: var(--el-color-warning);
}

.usage-tag--reason {
  background: var(--el-color-info-light-9);
  border-color: var(--el-color-info-light-7);
  color: var(--el-color-info);
}

.cell-cost {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.cell-cost__amount {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
  color: var(--el-color-warning);
  font-weight: 500;
}

.cell-cost__amount--void {
  color: var(--el-text-color-secondary);
  text-decoration: line-through;
  font-weight: 400;
}

.cell-cost__amount--platform {
  color: var(--el-text-color-secondary);
  font-weight: 400;
}

.cell-cost__tag {
  font-size: 11px;
  height: 18px;
  padding: 0 6px;
}

.cell-cost__sub {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.cell-latency {
  font-size: 12.5px;
}
</style>
