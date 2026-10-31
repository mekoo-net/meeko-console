<script setup lang="ts">
/**
 * Tavern 调用日志：每次上游模型调用一行，不论是否向用户收费；表格与详情对齐 Yomi 调用日志。
 *
 *  - 管线汇总给出每条管线按现行价目的折算，并拆出「平台承担」（没挂扣费回合的部分）——
 *    纪事、摘要、唤醒这类后台管线只烧 token 不收费，运营靠这一块决定是否计费或换便宜模型
 *  - 汇总只受时间与账号影响；管线 / 模型 / 状态 / 收费筛选只作用于明细
 *  - 翻页沿用发起查询时的条件，改了筛选没点查询不会混进来
 */
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Search } from '@element-plus/icons-vue';

import { AiUsageStatusLabel, logErrorCodeText, logStopReasonTruncated } from '@yomi/common';
import PageHeader from '@/shared/ui/PageHeader.vue';
import StatusTag from '@/shared/ui/StatusTag.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import { formatDateTime } from '@/shared/lib/date';
import DateRangeBar from '@/features/yomi/components/overview/DateRangeBar.vue';

import CallLogDrawer from '../components/metering/CallLogDrawer.vue';
import {
  CallStatusTone,
  TurnStatusLabel,
  TurnStatusTone,
  callStatusValues,
  type CallLog,
  type CallLogQuery,
  type CallStatus,
  type CallSummary,
  type PipelineTally,
} from '../model/metering.types';
import {
  checkRange,
  formatCny,
  formatDuration,
  formatPercent,
  formatTokens,
  last24h,
  parseAccountUid,
} from '../model/meteringFormat';
import { getTavernCallLogPort } from '../services';

const port = getTavernCallLogPort();

type BilledFilter = '' | 'billed' | 'unbilled';

interface PageFilter {
  dateRange: [string, string] | null;
  accountUid: string;
  pipeline: string;
  model: string;
  status: '' | CallStatus;
  billed: BilledFilter;
}

const defaultFilter = (): PageFilter => ({
  dateRange: last24h(),
  accountUid: '',
  pipeline: '',
  model: '',
  status: '',
  billed: '',
});

const filter = reactive<PageFilter>(defaultFilter());

const records = ref<CallLog[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const summary = ref<CallSummary | null>(null);
const loading = ref(false);
const summaryLoading = ref(false);
const searched = ref(false);

type CallFilters = Omit<CallLogQuery, 'page' | 'pageSize'>;

let activeFilters: CallFilters | null = null;
let listSeq = 0;
let summarySeq = 0;

const detailOpen = ref(false);
const detailCall = ref<CallLog | null>(null);

function buildFilters(): CallFilters | null {
  const range = checkRange(filter.dateRange);
  if (!range.ok) {
    ElMessage.warning(range.message);
    return null;
  }
  const uid = parseAccountUid(filter.accountUid);
  if (!uid.ok) {
    ElMessage.warning('账号 UID 只能是数字');
    return null;
  }
  return {
    fromUtc: range.fromUtc,
    toUtc: range.toUtc,
    accountUid: uid.value,
    pipeline: filter.pipeline || undefined,
    model: filter.model.trim() || undefined,
    status: filter.status || undefined,
    billed: filter.billed === '' ? undefined : filter.billed === 'billed',
  };
}

async function loadPage(): Promise<void> {
  if (!activeFilters) return;
  const mine = ++listSeq;
  loading.value = true;
  try {
    const r = await port.list({ ...activeFilters, page: page.value, pageSize: pageSize.value });
    if (mine !== listSeq) return;
    searched.value = true;
    if (r.success) {
      records.value = r.data.items;
      total.value = r.data.total;
    } else {
      records.value = [];
      total.value = 0;
      ElMessage.error(r.error.message);
    }
  } finally {
    if (mine === listSeq) loading.value = false;
  }
}

async function loadSummary({ fromUtc, toUtc, accountUid }: CallFilters): Promise<void> {
  const mine = ++summarySeq;
  summaryLoading.value = true;
  try {
    const r = await port.summary({ fromUtc, toUtc, accountUid });
    if (mine !== summarySeq) return;
    summary.value = r.success ? r.data : null;
    if (!r.success) ElMessage.error(r.error.message);
  } finally {
    if (mine === summarySeq) summaryLoading.value = false;
  }
}

function search(): void {
  const filters = buildFilters();
  if (!filters) return;
  activeFilters = filters;
  void loadSummary(filters);
  // 已在第 1 页就直接拉，否则只改页码，由翻页 watcher 拉一次。
  if (page.value === 1) void loadPage();
  else page.value = 1;
}

watch([page, pageSize], () => void loadPage());

function onReset(): void {
  Object.assign(filter, defaultFilter());
}

function filterBy(patch: Partial<PageFilter>): void {
  Object.assign(filter, patch);
  search();
}

function openDetail(row: CallLog): void {
  detailCall.value = row;
  detailOpen.value = true;
}

// ─── 管线汇总 ────────────────────────────────────────────

function platformShare({ tally }: Pick<PipelineTally, 'tally'>): number {
  return tally.cost.total > 0 ? tally.cost.platformBorne / tally.cost.total : 0;
}

/** 整条管线都不向用户收费：最该关注的那类。 */
function summaryRowClass({ row }: { row: PipelineTally }): string {
  return row.tally.cost.billed === 0 && row.tally.cost.total > 0 ? 'summary-row--unbilled' : '';
}

/** 汇总里的管线 + 当前选中的，切了时间范围也不会让选中项变成裸 id。 */
const pipelineOptions = computed(() => {
  const options = (summary.value?.pipelines ?? []).map(({ pipeline }) => ({ value: pipeline.id, label: pipeline.label }));
  if (filter.pipeline && !options.some((o) => o.value === filter.pipeline)) {
    options.push({ value: filter.pipeline, label: filter.pipeline });
  }
  return options;
});

// ─── 明细 ────────────────────────────────────────────────

function statusLabel(row: CallLog): string {
  const code = row.content.error?.code;
  return row.status === 'failure' && code ? logErrorCodeText(code) : AiUsageStatusLabel[row.status];
}

function rowClass(): string {
  return 'call-row';
}

onMounted(search);
</script>

<template>
  <div class="page">
    <PageHeader
      title="调用日志"
      description="每次上游模型调用一行，不论是否向用户收费。折算按现行价目；挂了扣费回合的才向用户收费，其余由平台承担。"
    />

    <DateRangeBar
      v-model:date-range="filter.dateRange"
      :loading="loading"
      @refresh="search"
      @reset="onReset"
    >
      <el-form-item label="账号 UID">
        <el-input
          v-model="filter.accountUid"
          :prefix-icon="Search"
          placeholder="精确匹配"
          clearable
          class="mono-input"
          style="width: 160px"
          @keyup.enter="search"
          @clear="search"
        />
      </el-form-item>
      <el-form-item label="管线">
        <el-select
          v-model="filter.pipeline"
          placeholder="全部"
          clearable
          style="width: 150px"
          @change="search"
        >
          <el-option
            v-for="p in pipelineOptions"
            :key="p.value"
            :label="p.label"
            :value="p.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="模型">
        <el-input
          v-model="filter.model"
          :prefix-icon="Search"
          placeholder="如 opus 或 kiro/claude-opus-5.5"
          clearable
          style="width: 240px"
          @keyup.enter="search"
          @clear="search"
        />
      </el-form-item>
      <el-form-item label="状态">
        <el-select
          v-model="filter.status"
          placeholder="全部"
          clearable
          style="width: 110px"
          @change="search"
        >
          <el-option
            v-for="s in callStatusValues"
            :key="s"
            :label="AiUsageStatusLabel[s]"
            :value="s"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="收费">
        <el-select
          v-model="filter.billed"
          placeholder="全部"
          style="width: 130px"
          @change="search"
        >
          <el-option
            label="全部"
            value=""
          />
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
    </DateRangeBar>

    <section
      v-loading="summaryLoading && !summary"
      class="card summary"
    >
      <header class="summary__head">
        <div>
          <h2 class="card__title">
            管线汇总
          </h2>
          <p class="card__sub">
            按时间范围与账号汇总，不受管线 / 模型 / 状态 / 收费筛选影响
          </p>
        </div>
        <div
          v-if="summary"
          class="summary__totals"
        >
          <div class="summary__total">
            <span class="summary__total-label">调用</span>
            <span class="summary__total-value num">{{ summary.total.calls.toLocaleString() }}</span>
          </div>
          <div class="summary__total">
            <span class="summary__total-label">失败</span>
            <span
              class="summary__total-value num"
              :class="{ 'is-danger': summary.total.failures > 0 }"
            >{{ summary.total.failures.toLocaleString() }}</span>
          </div>
          <div class="summary__total">
            <span class="summary__total-label">按现行价目折算</span>
            <span class="summary__total-value num">{{ formatCny(summary.total.cost.total, 4) }}</span>
          </div>
          <div class="summary__total summary__total--platform">
            <span class="summary__total-label">其中平台承担</span>
            <span class="summary__total-value num">
              {{ formatCny(summary.total.cost.platformBorne, 4) }}
              <small>{{ formatPercent(summary.total.cost.platformBorne, summary.total.cost.total) }}</small>
            </span>
          </div>
        </div>
      </header>

      <el-table
        :data="summary?.pipelines ?? []"
        size="small"
        :row-class-name="summaryRowClass"
        :empty-text="searched ? '该时间范围内没有调用' : ' '"
      >
        <el-table-column
          label="管线"
          min-width="150"
        >
          <template #default="{ row }: { row: PipelineTally }">
            <el-button
              link
              type="primary"
              :title="`只看「${row.pipeline.label}」的明细`"
              @click="filterBy({ pipeline: row.pipeline.id })"
            >
              {{ row.pipeline.label }}
            </el-button>
            <span class="mono sub">{{ row.pipeline.id }}</span>
          </template>
        </el-table-column>
        <el-table-column
          label="调用"
          width="90"
          align="right"
        >
          <template #default="{ row }: { row: PipelineTally }">
            <span class="num">{{ row.tally.calls.toLocaleString() }}</span>
          </template>
        </el-table-column>
        <el-table-column
          label="失败"
          width="72"
          align="right"
        >
          <template #default="{ row }: { row: PipelineTally }">
            <span
              class="num"
              :class="row.tally.failures > 0 ? 'is-danger' : 'is-muted'"
            >{{ row.tally.failures.toLocaleString() }}</span>
          </template>
        </el-table-column>
        <el-table-column
          label="输入 / 输出"
          width="150"
          align="right"
        >
          <template #default="{ row }: { row: PipelineTally }">
            <span
              class="num"
              :title="`输入 ${row.tally.tokens.input.toLocaleString()} · 输出 ${row.tally.tokens.output.toLocaleString()}`"
            >{{ formatTokens(row.tally.tokens.input) }} / {{ formatTokens(row.tally.tokens.output) }}</span>
          </template>
        </el-table-column>
        <el-table-column
          label="按现行价目折算"
          width="140"
          align="right"
        >
          <template #default="{ row }: { row: PipelineTally }">
            <span class="num">{{ formatCny(row.tally.cost.total, 4) }}</span>
          </template>
        </el-table-column>
        <el-table-column
          label="向用户收费"
          width="120"
          align="right"
        >
          <template #default="{ row }: { row: PipelineTally }">
            <span
              class="num"
              :class="{ 'is-muted': row.tally.cost.billed === 0 }"
            >{{ formatCny(row.tally.cost.billed, 4) }}</span>
          </template>
        </el-table-column>
        <el-table-column
          label="其中平台承担"
          min-width="220"
        >
          <template #default="{ row }: { row: PipelineTally }">
            <div class="share">
              <span class="share__value num">{{ formatCny(row.tally.cost.platformBorne, 4) }}</span>
              <span class="share__bar">
                <span
                  class="share__fill"
                  :style="{ width: `${platformShare(row) * 100}%` }"
                />
              </span>
              <span class="share__pct num">{{ formatPercent(row.tally.cost.platformBorne, row.tally.cost.total) }}</span>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <section class="card list">
      <el-table
        v-loading="loading"
        :data="records"
        row-key="id"
        size="small"
        stripe
        :row-class-name="rowClass"
        :empty-text="' '"
        @row-click="openDetail"
      >
        <el-table-column
          label="时间"
          width="132"
        >
          <template #default="{ row }: { row: CallLog }">
            <span
              class="mono cell-time"
              :title="formatDateTime(row.createdAt, 'YYYY-MM-DD HH:mm:ss')"
            >{{ formatDateTime(row.createdAt, 'MM-DD HH:mm:ss') }}</span>
          </template>
        </el-table-column>

        <el-table-column
          label="账号"
          width="110"
        >
          <template #default="{ row }: { row: CallLog }">
            <el-button
              link
              type="primary"
              class="mono cell-link"
              :title="`按账号 ${row.accountUid} 过滤`"
              @click.stop="filterBy({ accountUid: String(row.accountUid) })"
            >
              {{ row.accountUid }}
            </el-button>
          </template>
        </el-table-column>

        <el-table-column
          label="管线"
          width="130"
        >
          <template #default="{ row }: { row: CallLog }">
            <span class="cell-pipeline">
              <span>{{ row.pipeline.label }}</span>
              <el-tag
                v-if="row.content.proactive"
                size="small"
                type="warning"
                effect="plain"
              >
                自主
              </el-tag>
            </span>
          </template>
        </el-table-column>

        <el-table-column
          label="模型"
          min-width="200"
        >
          <template #default="{ row }: { row: CallLog }">
            <button
              type="button"
              class="cell-model"
              :title="`按模型「${row.modelName}」过滤`"
              @click.stop="filterBy({ model: row.modelName })"
            >
              <span class="cell-model__vendor">{{ row.vendorKey }}</span>
              <span class="mono">{{ row.modelName }}</span>
            </button>
          </template>
        </el-table-column>

        <el-table-column
          label="用量"
          width="170"
        >
          <template #default="{ row }: { row: CallLog }">
            <div class="usage">
              <span
                class="usage__tag usage__tag--in"
                :title="`输入 ${row.usage.input.tokens.toLocaleString()}`"
              >▲ {{ formatTokens(row.usage.input.tokens) }}</span>
              <span
                v-if="row.usage.input.cachedReadTokens > 0"
                class="usage__tag usage__tag--cache"
                :title="`缓存命中 ${row.usage.input.cachedReadTokens.toLocaleString()}`"
              >⚡ {{ formatTokens(row.usage.input.cachedReadTokens) }}</span>
              <span
                class="usage__tag usage__tag--out"
                :title="`输出 ${row.usage.output.tokens.toLocaleString()}`"
              >▼ {{ formatTokens(row.usage.output.tokens) }}</span>
              <span
                v-if="row.usage.output.reasoningTokens > 0"
                class="usage__tag usage__tag--reason"
                :title="`推理 ${row.usage.output.reasoningTokens.toLocaleString()}`"
              >✦ {{ formatTokens(row.usage.output.reasoningTokens) }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column
          label="耗时"
          width="104"
          align="right"
        >
          <template #default="{ row }: { row: CallLog }">
            <div class="cell-stack">
              <span class="num">{{ formatDuration(row.content.durationMs) }}</span>
              <span
                v-if="row.content.latencyMs != null"
                class="sub num"
              >首字 {{ formatDuration(row.content.latencyMs) }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column
          label="工具"
          width="56"
          align="right"
        >
          <template #default="{ row }: { row: CallLog }">
            <span
              class="num"
              :class="{ 'is-muted': row.content.toolCalls === 0 }"
            >{{ row.content.toolCalls || '—' }}</span>
          </template>
        </el-table-column>

        <el-table-column
          label="状态"
          width="104"
          align="center"
        >
          <template #default="{ row }: { row: CallLog }">
            <div class="cell-stack cell-stack--center">
              <StatusTag
                :label="statusLabel(row)"
                :tone="CallStatusTone[row.status]"
              />
              <span
                v-if="logStopReasonTruncated(row.content.stopReason)"
                class="sub is-warning"
                title="输出到了长度上限，被截断"
              >截断</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column
          label="计费"
          width="140"
        >
          <template #default="{ row }: { row: CallLog }">
            <div
              v-if="row.bill"
              class="cell-billing"
            >
              <span
                class="num cell-billing__amount"
                :class="{ 'is-muted': row.bill.status !== 'charged' }"
                title="所属扣费回合的金额"
              >{{ formatCny(row.bill.amount) }}</span>
              <el-tag
                size="small"
                :type="TurnStatusTone[row.bill.status]"
                effect="light"
              >
                {{ TurnStatusLabel[row.bill.status] }}
              </el-tag>
            </div>
            <el-tag
              v-else
              size="small"
              type="info"
              effect="plain"
              class="tag-platform"
            >
              平台承担
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column
          label="折算"
          width="100"
          align="right"
        >
          <template #default="{ row }: { row: CallLog }">
            <span
              class="num"
              title="按现行价目折算"
            >{{ formatCny(row.cost.amount) }}</span>
          </template>
        </el-table-column>

        <template #empty>
          <EmptyState
            v-if="searched"
            title="没有符合条件的调用"
            description="尝试扩大时间范围或清除其它筛选条件。"
          />
        </template>
      </el-table>

      <footer class="list__foot">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          background
        />
      </footer>
    </section>

    <CallLogDrawer
      v-model:visible="detailOpen"
      :call="detailCall"
    />
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 0 4px 24px;
}

.page :deep(.filter-bar) {
  margin-bottom: 0;
}

.card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
}

.card__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.card__sub {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.summary {
  padding: 14px 16px 6px;
}

.summary__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px 24px;
  margin-bottom: 10px;
}

.summary__totals {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.summary__total {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 96px;
  padding: 6px 12px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
}

.summary__total--platform {
  background: color-mix(in srgb, var(--el-color-warning) 12%, transparent);
}

.summary__total-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.summary__total-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.summary__total-value small {
  margin-left: 4px;
  font-size: 12px;
  font-weight: 500;
  color: var(--el-color-warning-dark-2);
}

.summary :deep(.summary-row--unbilled) {
  --el-table-tr-bg-color: color-mix(in srgb, var(--el-color-warning) 7%, transparent);
}

.share {
  display: flex;
  align-items: center;
  gap: 8px;
}

.share__value {
  min-width: 76px;
  text-align: right;
}

.share__bar {
  flex: 1;
  min-width: 48px;
  max-width: 120px;
  height: 6px;
  border-radius: 3px;
  overflow: hidden;
  background: var(--el-fill-color);
}

.share__fill {
  display: block;
  height: 100%;
  border-radius: 3px;
  background: var(--el-color-warning);
}

.share__pct {
  min-width: 44px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.list {
  overflow: hidden;
}

.list :deep(.call-row) {
  cursor: pointer;
}

.list__foot {
  display: flex;
  justify-content: flex-end;
  padding: 10px 16px;
  border-top: 1px solid var(--el-border-color-lighter);
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

.sub {
  margin-left: 6px;
  font-size: 11.5px;
  color: var(--el-text-color-secondary);
}

.is-danger {
  color: var(--el-color-danger);
}

.is-warning {
  color: var(--el-color-warning-dark-2);
}

.is-muted {
  color: var(--el-text-color-placeholder);
}

.cell-time {
  font-size: 12px;
  white-space: nowrap;
}

.cell-link {
  padding: 0;
  height: auto;
  font-size: 12px;
}

.cell-pipeline {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.cell-model {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 0;
  border: 0;
  background: none;
  font-size: 12px;
  color: var(--el-text-color-primary);
  text-align: left;
  cursor: pointer;
}

.cell-model:hover .mono {
  color: var(--el-color-primary);
}

.cell-model__vendor {
  flex-shrink: 0;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 11px;
  line-height: 18px;
  color: var(--el-text-color-regular);
  background: var(--el-fill-color);
}

.usage {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.usage__tag {
  padding: 0 6px;
  border-radius: 999px;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  line-height: 18px;
  white-space: nowrap;
}

.usage__tag--in {
  color: var(--el-color-success);
  background: var(--el-color-success-light-9);
}

.usage__tag--cache {
  color: var(--el-color-warning);
  background: var(--el-color-warning-light-9);
}

.usage__tag--out {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.usage__tag--reason {
  color: var(--el-color-info);
  background: var(--el-color-info-light-9);
}

.cell-stack {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  line-height: 1.35;
}

.cell-stack--center {
  align-items: center;
}

.cell-stack .sub {
  margin-left: 0;
}

.cell-billing {
  display: flex;
  align-items: center;
  gap: 6px;
}

.cell-billing__amount {
  font-size: 12px;
}

.tag-platform {
  color: var(--el-text-color-secondary);
}
</style>
