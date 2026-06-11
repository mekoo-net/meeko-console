<script setup lang="ts">
/**
 * 调用日志查询页。
 *
 * 注意事项：
 *  - **必须传时间范围**：UI 默认填最近 24h；用户清空 dateRange 时按钮置灰
 *  - 账户列展示日志 API enrich 的邮箱 / 手机；昵称在详情抽屉
 *  - 渠道筛选走 `modelName` 前缀，不在此页拉渠道组字典
 *  - 错误日志一键过滤 → 排障常用
 *  - KPI 汇总卡片已迁移至「概览」页（OverviewView）
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { Right, RefreshLeft, Search, View, Warning } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

import PageHeader from '@/shared/ui/PageHeader.vue';
import StatusTag from '@/shared/ui/StatusTag.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import FilterBar from '@/shared/ui/FilterBar.vue';
import FillListPageLayout from '@/shared/ui/FillListPageLayout.vue';
import { formatDateTime } from '@/shared/lib/date';
import { BILLING_FRACTION_DIGITS, formatMoney } from '@/shared/lib/money';

import {
  BillingTypeLabel,
  BillReverseCodeLabel,
  LogErrorCodeLabel,
} from '@demux/common';
import { dateRangeToEpochMillis } from '@/shared/lib/epoch';
import type {
  ListLogsFilter,
  LogEntry,
  ReverseLogInput,
} from '@demux/common';
import { getDemuxaiLogsPort } from '../services';
import LogDetailDrawer from '../components/LogDetailDrawer.vue';
import LogReverseDialog from '../components/LogReverseDialog.vue';

const router = useRouter();
const logsPort = getDemuxaiLogsPort();

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
  /** 仅看失败调用（success === false） */
  errorOnly: boolean;
}

const last24h = (): [string, string] => {
  const now = new Date();
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return [from.toISOString(), now.toISOString()];
};

const defaultFilter = (): PageFilter => ({
  accountUid: '',
  contactKeyword: '',
  dateRange: last24h(),
  modelName: '',
  vendorKey: '',
  convId: '',
  errorOnly: false,
});

const filter = ref<PageFilter>(defaultFilter());

const detailOpen = ref(false);
const detailLog = ref<LogEntry | null>(null);

const reverseOpen = ref(false);
const reverseLog = ref<LogEntry | null>(null);
const reverseSubmitting = ref(false);

function buildPortFilter(): ListLogsFilter {
  const f: ListLogsFilter = {
    errorOnly: filter.value.errorOnly,
  };
  if (filter.value.accountUid.trim()) f.accountUid = filter.value.accountUid.trim();
  if (filter.value.modelName.trim()) f.modelName = filter.value.modelName.trim();
  const qg = filter.value.vendorKey.trim();
  if (qg) f.vendorKey = qg;
  if (filter.value.dateRange?.[0] && filter.value.dateRange[1]) {
    Object.assign(f, dateRangeToEpochMillis(filter.value.dateRange));
  }
  const conv = filter.value.convId.trim();
  if (conv) f.convId = conv;
  return f;
}

async function fetchData(): Promise<void> {
  if (!filter.value.dateRange || !filter.value.dateRange[0]) {
    ElMessage.warning('请先选择时间范围（最长 7 天）');
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
      filter.value.dateRange,
      filter.value.modelName,
      filter.value.vendorKey,
      filter.value.convId,
      filter.value.errorOnly,
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

/** 邮箱 / 手机关键字：在当前页结果上过滤（数据来自日志 API 的 account enrich）。 */
const displayRecords = computed(() => {
  const kw = filter.value.contactKeyword.trim().toLowerCase();
  if (!kw) return records.value;
  return records.value.filter((r) => {
    const email = (r.account.email ?? '').toLowerCase();
    const phone = r.account.phone ?? '';
    const name = (r.account.displayName ?? '').toLowerCase();
    return email.includes(kw) || phone.includes(kw) || name.includes(kw);
  });
});

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
  if (row.billingType !== 'per_token' && row.billingType !== 'per_call') return [];
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

/** 渠道展示：优先用定价快照钉死的 `vendorKey`，否则退化为 modelName 前缀。 */
function vendorText(row: LogEntry): string {
  return row.vendorKey?.trim() || vendorFromModelName(row.modelName);
}

function setVendorFilter(vendor: string): void {
  filter.value.vendorKey = vendor;
  page.value = 1;
}

function setModelFilter(model: string): void {
  filter.value.modelName = model;
  page.value = 1;
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

/** 错误码 → 国际化文案；未识别码原样返回 */
function errorCodeText(code: string): string {
  return (LogErrorCodeLabel as Record<string, string>)[code] ?? code;
}

function sourceLabel(row: LogEntry): string {
  return row.token?.name?.trim() || 'PG';
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
        <el-form-item>
          <el-checkbox v-model="filter.errorOnly">
            <span class="error-only">
              <el-icon><Warning /></el-icon>
              仅看异常
            </span>
          </el-checkbox>
        </el-form-item>
        <el-form-item v-if="filter.convId" label="会话">
          <el-tag closable type="info" @close="clearConvFilter">
            {{ filter.convId }}
          </el-tag>
        </el-form-item>
      </FilterBar>
    </template>

    <el-table
      v-loading="loading"
      :data="displayRecords"
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

      <el-table-column label="Conv" min-width="148">
        <template #default="{ row }: { row: LogEntry }">
          <el-tooltip v-if="row.convId" :content="row.convId" placement="top" :show-after="200">
            <el-button link type="primary" class="cell-conv mono" @click="drillByConvId(row.convId!)">
              {{ row.convId }}
            </el-button>
          </el-tooltip>
          <span v-else class="cell-muted">—</span>
        </template>
      </el-table-column>

      <el-table-column label="来源" width="120">
        <template #default="{ row }: { row: LogEntry }">
          <el-tag v-if="row.token?.name" size="small" effect="plain" type="info">
            {{ sourceLabel(row) }}
          </el-tag>
          <span v-else class="cell-source-pg">PG</span>
        </template>
      </el-table-column>

      <el-table-column label="状态" width="88" align="center">
        <template #default="{ row }: { row: LogEntry }">
          <StatusTag v-if="row.status === 'pending'" label="调用中" tone="warning" />
          <StatusTag v-else-if="row.success" label="成功" tone="success" />
          <StatusTag
            v-else
            :label="row.error ? errorCodeText(row.error.code) : '失败'"
            tone="danger"
          />
        </template>
      </el-table-column>

      <el-table-column label="渠道" width="120">
        <template #default="{ row }: { row: LogEntry }">
          <el-button
            v-if="row.vendorKey"
            link
            type="primary"
            class="cell-vendor cell-vendor--link"
            title="按此渠道过滤"
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
          <el-tag size="small" type="info" effect="plain" round>
            {{ BillingTypeLabel[row.billingType] }}
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
          <span v-if="row.tokenLatency != null" class="cell-latency num">
            {{ row.tokenLatency.toLocaleString() }} ms
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
            @click="router.push(`/accounts/${row.account.uid}`)"
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
.error-only {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--el-color-warning);
}

.log-table {
  margin-top: 0;
}

.mono {
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
.cell-conv {
  font-size: 12px;
  color: var(--el-text-color-primary);
  word-break: break-all;
  line-height: 1.35;
  padding: 0;
  height: auto;
  white-space: normal;
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
