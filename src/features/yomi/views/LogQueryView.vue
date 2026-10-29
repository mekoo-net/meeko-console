<script setup lang="ts">
/**
 * 调用日志查询页。
 *
 * 注意事项：
 *  - **必须传时间范围**：UI 默认填最近 24h；用户清空 dateRange 时按钮置灰
 *  - 邮箱 / 手机：服务端经 Keystone 解析 account_uid 后筛日志（全量分页，非当前页本地过滤）
 *  - 渠道筛选走 `modelName` 前缀，不在此页拉渠道组字典
 *  - 表格里可点的字段（渠道 / 模型 / 状态 / 账户 / 会话）写入筛选条件，不跳到别的页面
 *  - 日志编号、TraceId 只展示，不点进筛选；TraceId 灰色、与编号左对齐
 *  - 状态过滤：调用中 / 成功 / 失败
 *  - KPI 汇总卡片已迁移至「概览」页（OverviewView）
 */
import { onMounted, ref, watch } from 'vue';

import { Right, RefreshLeft, Search, View } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

import PageHeader from '@/shared/ui/PageHeader.vue';
import StatusTag from '@/shared/ui/StatusTag.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import FilterBar from '@/shared/ui/FilterBar.vue';
import FillListPageLayout from '@/shared/ui/FillListPageLayout.vue';
import { formatDateTime, toLocalDateTimeValue } from '@/shared/lib/date';
import { BILLING_FRACTION_DIGITS, formatMoney } from '@/shared/lib/money';

import {
  AiUsageStatusLabel,
  billingTypeText,
  BillReverseCodeLabel,
  logErrorCodeText,
  logHasErrorCode,
  logProtocolText,
  type AiUsageStatus,
} from '@yomi/common';
import { dateRangeToEpochMillis } from '@/shared/lib/epoch';
import type {
  ListLogsFilter,
  LogEntry,
  ReverseLogInput,
} from '@yomi/common';
import { getYomiLogsPort } from '../services';
import { creditDetailSummary, formatCredits } from '../model/creditUsage';
import LogDetailDrawer from '../components/LogDetailDrawer.vue';
import LogReverseDialog from '../components/LogReverseDialog.vue';

const logsPort = getYomiLogsPort();

const records = ref<LogEntry[]>([]);
const total = ref(0);
const loading = ref(false);

const page = ref(1);
const pageSize = ref(20);

interface PageFilter {
  accountUid: string;
  contactKeyword: string;
  dateRange: [string, string] | null;
  /** 模糊匹配 `LogEntry.modelName` */
  modelName: string;
  /** 渠道（供应商组 / queue_group）精确匹配；空字符串 = 全部。 */
  vendorKey: string;
  /** 会话 ID 精确匹配（点击 Conv 列钻取） */
  convId: string;
  /** TraceId 精确匹配 */
  traceId: string;
  /** 调用日志号精确匹配（点表格写入，筛选项以 tag 展示） */
  logId: string;
  /** 账单 UID 精确匹配（= `LogEntry.bill.id`） */
  billUid: string;
  /** 结算状态；空 = 全部。页面只开放调用中 / 成功 / 失败。 */
  status: '' | Extract<AiUsageStatus, 'pending' | 'success' | 'failure'>;
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
  modelName: '',
  vendorKey: '',
  convId: '',
  traceId: '',
  logId: '',
  billUid: '',
  status: '',
});

const filter = ref<PageFilter>(defaultFilter());

const detailOpen = ref(false);
const detailLog = ref<LogEntry | null>(null);

const reverseOpen = ref(false);
const reverseLog = ref<LogEntry | null>(null);
const reverseSubmitting = ref(false);

function buildPortFilter(): ListLogsFilter {
  const f: ListLogsFilter = {};
  if (filter.value.status) f.status = filter.value.status;
  if (filter.value.accountUid.trim()) f.accountUid = filter.value.accountUid.trim();
  const contact = filter.value.contactKeyword.trim();
  if (contact) f.contactKeyword = contact;
  if (filter.value.modelName.trim()) f.modelName = filter.value.modelName.trim();
  const qg = filter.value.vendorKey.trim();
  if (qg) f.vendorKey = qg;
  const traceId = filter.value.traceId.trim();
  if (traceId) f.traceId = traceId;
  const logId = filter.value.logId.trim();
  if (logId) f.logId = logId;
  const billUid = filter.value.billUid.trim();
  if (billUid) f.billUid = billUid;
  const hasExactLookup = Boolean(traceId || logId || billUid);
  if (filter.value.dateRange?.[0] && filter.value.dateRange[1]) {
    Object.assign(f, dateRangeToEpochMillis(filter.value.dateRange));
  }
  const conv = filter.value.convId.trim();
  if (conv) f.convId = conv;
  // 精确 TraceId / billUid 检索时后端会忽略时间窗；此处仍允许不传时间范围。
  if (!hasExactLookup && (f.fromUtc == null || f.toUtc == null)) {
    throw new Error('missing_time_range');
  }
  return f;
}

async function fetchData(): Promise<void> {
  try {
    buildPortFilter();
  } catch {
    ElMessage.warning('请先选择时间范围（最长 7 天），或输入 TraceId / 账单 UID');
    return;
  }
  loading.value = true;
  try {
    const r = await logsPort.list({
      page: page.value,
      pageSize: pageSize.value,
      filter: buildPortFilter(),
    });
    if (r.success) {
      records.value = r.data.items;
      total.value = r.data.total;
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    loading.value = false;
  }
}

watch(
  () => [page.value, pageSize.value] as const,
  () => void fetchData(),
);

watch(
  () =>
    [
      filter.value.accountUid,
      filter.value.contactKeyword,
      filter.value.dateRange,
      filter.value.modelName,
      filter.value.vendorKey,
      filter.value.convId,
      filter.value.traceId,
      filter.value.logId,
      filter.value.billUid,
      filter.value.status,
    ] as const,
  () => {
    // 回到第一页：已在第 1 页则直接拉，否则只改 page，
    // 由 [page, pageSize] watcher 单次触发，避免重复请求。
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

function openDetail(row: LogEntry): void {
  detailLog.value = row;
  detailOpen.value = true;
}

function openReverse(row: LogEntry): void {
  // 没有关联账单（历史数据 / BFF 未 join）→ 早断早提示，比让用户进对话框再失败友好
  if (!row.bill) {
    ElMessage.warning('该日志未关联账单，无法驳回');
    return;
  }
  if (row.bill.status === 'reversed') {
    ElMessage.info('该账单已被驳回，请勿重复操作');
    return;
  }
  reverseLog.value = row;
  reverseOpen.value = true;
}

/** 抽屉里点驳回 → 先关抽屉再开对话框，避免两层浮层叠加把焦点抢乱 */
function onDrawerReverse(row: LogEntry): void {
  detailOpen.value = false;
  // 等 drawer 收起的过渡帧后再开 dialog，UX 上更平滑
  setTimeout(() => openReverse(row), 200);
}

async function submitReverse(payload: ReverseLogInput): Promise<void> {
  if (reverseSubmitting.value) return;
  reverseSubmitting.value = true;
  try {
    const r = await logsPort.reverse(payload);
    if (!r.success) {
      ElMessage.error(r.error.message);
      return;
    }
    // 就地刷新被驳回行的 bill 状态，避免整页 reload 丢失滚动 / 过滤上下文
    const idx = records.value.findIndex((it) => it.id === payload.logId);
    if (idx !== -1) {
      const target = records.value[idx]!;
      records.value[idx] = {
        ...target,
        bill: {
          id: r.data.billId,
          status: 'reversed',
          reversal: {
            atUtc: r.data.reversedAtUtc,
            by: r.data.reversedBy,
            code: r.data.reversedCode,
            remark: payload.remark?.trim() || null,
          },
        },
      } as LogEntry;
    }
    // 若详情抽屉里展示的正是这条日志，同步更新它的 bill 字段
    if (detailLog.value && detailLog.value.id === payload.logId) {
      detailLog.value = records.value[idx] ?? detailLog.value;
    }
    ElMessage.success(`已驳回，扣费金额已归零（${BillReverseCodeLabel[payload.reasonCode]}）`);
    reverseOpen.value = false;
  } finally {
    reverseSubmitting.value = false;
  }
}

/**
 * 列表里"用量"列的紧凑展示。
 *
 * 不同 `billingType` 用量单位完全不同 —— 这里只给一行紧凑摘要，详细展开在抽屉里。
 */
function usageSummary(row: LogEntry): { main: string; sub: string } {
  switch (row.billingType) {
    // `unknown`（定价快照缺失）与 per_token 同形，见 logEntrySchema 的兜底分支。
    case 'unknown':
    case 'per_token':
      return {
        main: `${row.usage.totalTokens.toLocaleString()} tokens`,
        sub: `入 ${row.usage.input.tokens.toLocaleString()} · 出 ${row.usage.output.tokens.toLocaleString()}`,
      };
    case 'per_call': {
      const total = row.usage.input.tokens + row.usage.output.tokens;
      return {
        main: `${total.toLocaleString()} tokens`,
        sub: `入 ${row.usage.input.tokens.toLocaleString()} · 出 ${row.usage.output.tokens.toLocaleString()}`,
      };
    }
    case 'per_image':
      return {
        main: `${row.usage.count} 张`,
        sub: `${row.usage.tier.size} · ${row.usage.tier.quality}`,
      };
    case 'per_video':
      return {
        main: `${row.usage.seconds}s`,
        sub: row.usage.tier.resolution,
      };
    case 'per_audio_minute':
      return { main: `${row.usage.minutes} min`, sub: '' };
    case 'per_character':
      return { main: `${row.usage.characters.toLocaleString()} 字符`, sub: '' };
    case 'per_credit':
      return { main: `${formatCredits(row.usage.credits)} 积分`, sub: creditDetailSummary(row.usage) };
  }
}

interface UsageTag {
  key: string;
  arrow: string;
  value: string;
  kind: 'in' | 'out' | 'cache' | 'reason';
  title: string;
}

/** 紧凑 token 单位：1K / 20K / 200.1K / 1.2M（保留一位小数，去掉无意义的 .0）。 */
function formatTokenShort(n: number): string {
  if (n < 1000) return String(n);
  const unit = n < 1_000_000 ? 'K' : 'M';
  const scaled = n < 1_000_000 ? n / 1000 : n / 1_000_000;
  const rounded = Math.round(scaled * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text}${unit}`;
}

/**
 * 两行用量标签（符号 + 紧凑单位 + Token 后缀）：
 *   第一行 = 输入 ↑ + 缓存读 ⚡
 *   第二行 = 输出 ↓ + 缓存写 ✎（+ 推理 ✦）
 * 仅 token 计费（per_token / per_call）适用；其它计费类型返回空数组，回退到 usageSummary 文本。
 */
function usageTagRows(row: LogEntry): UsageTag[][] {
  if (
    row.billingType !== 'per_token'
    && row.billingType !== 'per_call'
    && row.billingType !== 'unknown'
  ) return [];
  const { input, output } = row.usage;

  const inputRow: UsageTag[] = [
    {
      key: 'in',
      arrow: '▲',
      value: formatTokenShort(input.tokens),
      kind: 'in',
      title: `输入 ${input.tokens.toLocaleString()} tokens`,
    },
  ];
  if (input.cachedReadTokens > 0) {
    inputRow.push({
      key: 'cache',
      arrow: '⚡',
      value: formatTokenShort(input.cachedReadTokens),
      kind: 'cache',
      title: `缓存命中（cache read）${input.cachedReadTokens.toLocaleString()} tokens`,
    });
  }

  const outputRow: UsageTag[] = [
    {
      key: 'out',
      arrow: '▼',
      value: formatTokenShort(output.tokens),
      kind: 'out',
      title: `输出 ${output.tokens.toLocaleString()} tokens`,
    },
  ];
  if (input.cachedWriteTokens > 0) {
    outputRow.push({
      key: 'cachew',
      arrow: '✎',
      value: formatTokenShort(input.cachedWriteTokens),
      kind: 'cache',
      title: `缓存写入（cache write）${input.cachedWriteTokens.toLocaleString()} tokens`,
    });
  }
  if (output.reasoningTokens > 0) {
    outputRow.push({
      key: 'reason',
      arrow: '✦',
      value: formatTokenShort(output.reasoningTokens),
      kind: 'reason',
      title: `推理（reasoning）${output.reasoningTokens.toLocaleString()} tokens`,
    });
  }

  return [inputRow, outputRow];
}

/** `vendor/model` 形态时取 vendor 作为渠道（如 gemini/gemini-3.1-pro-preview → gemini）。 */
function vendorFromModelName(modelName: string): string {
  const i = modelName.indexOf('/');
  return i > 0 ? modelName.slice(0, i) : '—';
}

/**
 * 渠道展示：对外 slug（`vendorPlug`）优先，其次内部渠道键，最后退化为 modelName 前缀。
 * 过滤仍按 `vendorKey` 走——那是后端认的查询维度。
 */
function vendorText(row: LogEntry): string {
  return row.vendorPlug?.trim() || row.vendorKey?.trim() || vendorFromModelName(row.modelName);
}

function setVendorFilter(vendor: string): void {
  filter.value.vendorKey = vendor;
  page.value = 1;
}

function setModelFilter(model: string): void {
  filter.value.modelName = model;
  page.value = 1;
}

function setAccountFilter(uid: string): void {
  filter.value.accountUid = uid;
  page.value = 1;
}

function setStatusFilter(status: AiUsageStatus): void {
  filter.value.status =
    status === 'pending' || status === 'success' || status === 'failure' ? status : 'failure';
  page.value = 1;
}

/** 会话 ID 列表只露到 `xxxxxxxx-xxxx-xxxx-xxxx`，完整值放 tooltip。 */
function shortConvId(id: string): string {
  const head = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4})/i.exec(id)?.[1];
  if (head && id.length > head.length) return `${head}…`;
  if (id.length > 23) return `${id.slice(0, 23)}…`;
  return id;
}

function failureStatusLabel(row: LogEntry): string {
  return logHasErrorCode(row.content.error)
    ? logErrorCodeText(row.content.error?.code)
    : AiUsageStatusLabel[row.status];
}

/**
 * 模型彩色标签（newapi / sub2api 风格）：按模型名哈希到固定调色板，同名同色，便于扫读。
 * 浅底 + 同色系文字，颜色取自一组温和的 tailwind 色阶。
 */
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

/** sk- 调用但令牌名没补全（令牌已删）时退化显示 `#id`，不能跟 PG 直发混为一谈。 */
function sourceLabel(row: LogEntry): string {
  const token = row.token;
  if (!token) return 'PG';
  return token.name?.trim() || `#${token.id}`;
}

function drillByConvId(convId: string): void {
  filter.value.convId = convId;
  page.value = 1;
}

function clearConvFilter(): void {
  filter.value.convId = '';
  page.value = 1;
}

onMounted(() => {
  void fetchData();
});
</script>

<template>
  <FillListPageLayout>
    <template #header>
      <PageHeader title="调用日志" />
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
            style="width: 220px"
          />
        </el-form-item>
        <el-form-item label="账单 UID">
          <el-input
            v-model="filter.billUid"
            :prefix-icon="Search"
            placeholder="精确匹配"
            clearable
            class="mono-input"
            style="width: 220px"
          />
        </el-form-item>
        <el-form-item v-if="filter.convId" label="会话">
          <el-tag closable type="info" @close="clearConvFilter">
            {{ filter.convId }}
          </el-tag>
        </el-form-item>
        <template #extra-row>
          <el-form-item label="渠道">
            <el-input
              v-model="filter.vendorKey"
              :prefix-icon="Search"
              placeholder="供应商组，如 gemini"
              clearable
              style="width: 220px"
            />
          </el-form-item>
          <el-form-item label="模型名">
            <el-input
              v-model="filter.modelName"
              :prefix-icon="Search"
              placeholder="模糊匹配 modelName"
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
              <el-option label="调用中" value="pending" />
              <el-option label="成功" value="success" />
              <el-option label="失败" value="failure" />
            </el-select>
          </el-form-item>
        </template>
      </FilterBar>
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
      <el-table-column label="详情" width="56" align="center" fixed>
        <template #default="{ row }: { row: LogEntry }">
          <el-button
            :icon="View"
            link
            type="primary"
            title="查看详情"
            @click="openDetail(row)"
          />
        </template>
      </el-table-column>

      <el-table-column label="时间" width="172" fixed>
        <template #default="{ row }: { row: LogEntry }">
          <span class="cell-time mono">{{ formatDateTime(row.createAt, 'YYYY-MM-DD HH:mm:ss') }}</span>
        </template>
      </el-table-column>

      <el-table-column label="日志编号" min-width="190">
        <template #default="{ row }: { row: LogEntry }">
          <div class="cell-ids">
            <span class="cell-logid mono">{{ row.id }}</span>
            <span v-if="row.traceId" class="cell-trace mono">{{ row.traceId }}</span>
            <span v-else class="cell-trace cell-muted">—</span>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="调用" min-width="160">
        <template #default="{ row }: { row: LogEntry }">
          <div class="cell-call">
            <el-tooltip v-if="row.content.convId" :content="row.content.convId" placement="top" :show-after="200">
              <el-button link type="primary" class="cell-conv mono" @click="drillByConvId(row.content.convId!)">
                {{ shortConvId(row.content.convId) }}
              </el-button>
            </el-tooltip>
            <span v-else class="cell-muted">—</span>
            <div class="cell-call__meta">
              <el-tag v-if="row.token" size="small" effect="plain" type="info" class="cell-call__source">
                {{ sourceLabel(row) }}
              </el-tag>
              <span v-else class="cell-call__source cell-source-pg">PG</span>
              <span
                v-if="row.content.protocol"
                class="cell-call__protocol"
                :title="`协议：${logProtocolText(row.content.protocol)}`"
              >{{ logProtocolText(row.content.protocol) }}</span>
            </div>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="状态" width="88" align="center">
        <template #default="{ row }: { row: LogEntry }">
          <button
            type="button"
            class="cell-status"
            :title="`按状态「${AiUsageStatusLabel[row.status]}」过滤`"
            @click="setStatusFilter(row.status)"
          >
            <StatusTag v-if="row.status === 'pending'" label="调用中" tone="warning" />
            <StatusTag v-else-if="row.status === 'success'" label="成功" tone="success" />
            <StatusTag
              v-else
              :label="failureStatusLabel(row)"
              tone="danger"
            />
          </button>
        </template>
      </el-table-column>

      <el-table-column label="渠道" width="120">
        <template #default="{ row }: { row: LogEntry }">
          <el-button
            v-if="row.vendorKey"
            link
            type="primary"
            class="cell-vendor cell-vendor--link"
            :title="`按渠道「${row.vendorKey}」过滤`"
            @click="setVendorFilter(row.vendorKey!)"
          >{{ vendorText(row) }}</el-button>
          <span v-else class="cell-vendor">{{ vendorText(row) }}</span>
        </template>
      </el-table-column>

      <el-table-column label="模型" min-width="220">
        <template #default="{ row }: { row: LogEntry }">
          <div class="cell-model">
            <span
              class="model-pill mono"
              :style="modelTagStyle(row.modelName)"
              :title="`按模型「${row.modelName}」过滤`"
              @click="setModelFilter(row.modelName)"
            >{{ row.modelName }}</span>
            <span
              v-if="row.vendorModel && row.vendorModel !== row.modelName"
              class="cell-model__sub mono"
              :title="`上游真实模型：${row.vendorModel}`"
            ><el-icon class="cell-model__branch"><Right /></el-icon>{{ row.vendorModel }}</span>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="计费" width="96" align="center">
        <template #default="{ row }: { row: LogEntry }">
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

      <el-table-column label="用量" min-width="208">
        <template #default="{ row }: { row: LogEntry }">
          <div v-if="usageTagRows(row).length" class="usage-tags">
            <div v-for="(line, i) in usageTagRows(row)" :key="i" class="usage-tags__line">
              <span
                v-for="t in line"
                :key="t.key"
                class="usage-tag"
                :class="`usage-tag--${t.kind}`"
                :title="t.title"
              >
                <span class="usage-tag__arrow">{{ t.arrow }}</span
                ><span class="usage-tag__value">{{ t.value }}</span
                ><span class="usage-tag__unit">Token</span>
              </span>
            </div>
          </div>
          <div v-else-if="usageSummary(row).main" class="cell-usage">
            <span class="cell-usage__main num">{{ usageSummary(row).main }}</span>
            <span v-if="usageSummary(row).sub" class="cell-usage__sub num">{{ usageSummary(row).sub }}</span>
          </div>
          <span v-else class="cell-muted">—</span>
        </template>
      </el-table-column>

      <el-table-column label="扣费" width="112" align="right">
        <template #default="{ row }: { row: LogEntry }">
          <div class="cell-cost">
            <span
              class="cell-cost__amount"
              :class="{ 'cell-cost__amount--reversed': row.bill?.status === 'reversed' }"
            >
              {{ formatMoney(row.cost.total, { fractionDigits: BILLING_FRACTION_DIGITS }) }}
            </span>
            <el-tag v-if="row.bill?.status === 'reversed'" size="small" type="info" effect="plain" class="cell-cost__tag">
              已驳回
            </el-tag>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="耗时" width="100" align="right">
        <template #default="{ row }: { row: LogEntry }">
          <span v-if="row.content.latencyMs != null" class="cell-latency num">
            {{ row.content.latencyMs.toLocaleString() }} ms
          </span>
          <span v-else class="cell-muted">—</span>
        </template>
      </el-table-column>

      <el-table-column label="账户" min-width="168">
        <template #default="{ row }: { row: LogEntry }">
          <el-button
            link
            type="primary"
            class="cell-account-link"
            :title="`按账户 UID「${row.account.uid}」过滤`"
            @click="setAccountFilter(row.account.uid)"
          >
            <span class="cell-account">
              <span class="cell-account__line">{{ row.account.email || '—' }}</span>
              <span class="cell-account__line cell-account__line--sub">{{ row.account.phone || '—' }}</span>
            </span>
          </el-button>
        </template>
      </el-table-column>

      <el-table-column label="操作" width="72" align="center" fixed="right">
        <template #default="{ row }: { row: LogEntry }">
          <el-button
            v-if="row.bill && row.bill.status !== 'reversed'"
            :icon="RefreshLeft"
            link
            type="danger"
            @click.stop="openReverse(row)"
          >驳回</el-button>
          <span v-else class="cell-muted">—</span>
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

  <LogDetailDrawer
    v-model="detailOpen"
    :log="detailLog"
    @reverse="onDrawerReverse"
  />

  <LogReverseDialog
    v-model="reverseOpen"
    :log="reverseLog"
    :submitting="reverseSubmitting"
    @submit="submitReverse"
  />
</template>

<style scoped>
.log-table {
  margin-top: 0;
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
  margin: 0;
  padding: 0;
  font-size: 12px;
  line-height: 1.35;
  word-break: break-all;
  white-space: normal;
  text-align: left;
}
.cell-logid {
  color: var(--el-text-color-primary);
}
.cell-trace {
  color: var(--el-text-color-secondary);
}
.cell-status {
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  line-height: 0;
}
.cell-call {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  line-height: 1.35;
}
.cell-call__source {
  align-self: flex-start;
}
.cell-call__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.cell-call__protocol {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}
.cell-conv {
  font-size: 12px;
  color: var(--el-text-color-primary);
  line-height: 1.35;
  padding: 0;
  height: auto;
  white-space: nowrap;
  text-align: left;
}
.cell-source-pg {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.cell-muted {
  color: var(--el-text-color-placeholder);
}

.cell-model {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  line-height: 1.35;
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
.cell-model__sub {
  display: inline-flex;
  align-items: center;
  font-size: 11.5px;
  color: var(--el-text-color-secondary);
  padding-left: 2px;
}
.cell-model__branch {
  margin-right: 3px;
  font-size: 12px;
  color: var(--el-color-primary);
  opacity: 0.6;
}

.cell-vendor {
  font-size: 12.5px;
  color: var(--el-text-color-regular);
}
.cell-vendor--link {
  padding: 0;
  height: auto;
  font-size: 12.5px;
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

/* 两行 token 用量药丸标签：第一行 输入/缓存读，第二行 输出/缓存写 */
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
.cell-cost__amount--reversed {
  color: var(--el-text-color-secondary);
  text-decoration: line-through;
  font-weight: 400;
}
.cell-cost__tag {
  font-size: 11px;
  height: 18px;
  padding: 0 6px;
}
.cell-latency {
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

.pagination-bar {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
