<script setup lang="ts">
/**
 * 调用日志查询页。
 *
 * 注意事项：
 *  - **必须传时间范围**：UI 默认填最近 24h；用户清空 dateRange 时按钮置灰
 *  - 跨域 join：用 accountUid → 调 accountAdminPort 拉账户 directory，
 *    展示账户名 + LV（仅 view 层组合，不污染 demuxai/model）
 *  - 错误日志一键过滤 → 排障常用
 *  - KPI 汇总卡片已迁移至「概览」页（OverviewView）
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { RefreshLeft, Search, View, Warning } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

import PageHeader from '@/shared/ui/PageHeader.vue';
import StatusTag from '@/shared/ui/StatusTag.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import FilterBar from '@/shared/ui/FilterBar.vue';
import { formatDateTime } from '@/shared/lib/date';
import { formatMoney } from '@/shared/lib/money';
import { getAccountAdminPort } from '@/features/accounts/services';
import type { Account } from '@/features/accounts/model/account.types';

import {
  BillingTypeLabel,
  BillReverseCodeLabel,
  LogErrorCodeLabel,
} from '../model/enums';
import type {
  ListLogsFilter,
  LogEntry,
  ReverseLogInput,
} from '../model/log.types';
import type { ProviderGroup } from '../model/catalog.types';
import type { Model } from '../model/model.types';
import {
  getDemuxaiCatalogPort,
  getDemuxaiLogsPort,
  getDemuxaiModelPort,
} from '../services';
import LogDetailDrawer from '../components/LogDetailDrawer.vue';
import LogReverseDialog from '../components/LogReverseDialog.vue';

const router = useRouter();
const logsPort = getDemuxaiLogsPort();
const modelPort = getDemuxaiModelPort();
const catalogPort = getDemuxaiCatalogPort();
const accountPort = getAccountAdminPort();

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
  /** 供应商 QueueGroup；空字符串 = 全部。 */
  providerQueueGroup: string;
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
  providerQueueGroup: '',
  errorOnly: false,
});

const filter = ref<PageFilter>(defaultFilter());

const models = ref<Model[]>([]);
const providerGroups = ref<ProviderGroup[]>([]);
const accountMap = ref<Map<string, Account>>(new Map());

const modelMap = computed(() => {
  const m = new Map<string, Model>();
  for (const it of models.value) m.set(it.modelId, it);
  return m;
});
/** QueueGroup → 供应商组（/demuxai/providers 页入库的渠道）。 */
const providerGroupMap = computed(() => {
  const m = new Map<string, ProviderGroup>();
  for (const g of providerGroups.value) m.set(g.queueGroup, g);
  return m;
});

const detailOpen = ref(false);
const detailLog = ref<LogEntry | null>(null);

const reverseOpen = ref(false);
const reverseLog = ref<LogEntry | null>(null);
const reverseSubmitting = ref(false);

async function loadDeps(): Promise<void> {
  const [mr, gr, ar] = await Promise.all([
    modelPort.list({
      page: 1,
      pageSize: 500,
      filter: { keyword: '', family: 'all', capability: 'all' },
    }),
    catalogPort.listProviderGroups(),
    accountPort.listAccounts({
      page: 1,
      pageSize: 200,
      filter: { accountUid: '', contactKeyword: '', type: 'all', status: 'all' },
    }),
  ]);
  if (mr.success) models.value = mr.data.items;
  if (gr.success) providerGroups.value = gr.data;
  if (ar.success) {
    const m = new Map<string, Account>();
    ar.data.items.forEach((a) => m.set(a.uid, a));
    accountMap.value = m;
  }
}

function buildPortFilter(): ListLogsFilter {
  const f: ListLogsFilter = {
    errorOnly: filter.value.errorOnly,
  };
  if (filter.value.accountUid.trim()) f.accountUid = filter.value.accountUid.trim();
  if (filter.value.modelName.trim()) f.modelName = filter.value.modelName.trim();
  const qg = filter.value.providerQueueGroup.trim();
  if (qg) {
    const prefix = `${qg}/`;
    const kw = (f.modelName ?? '').trim();
    f.modelName = kw ? (kw.startsWith(prefix) ? kw : `${prefix}${kw}`) : prefix;
  }
  if (filter.value.dateRange && filter.value.dateRange[0]) f.fromUtc = filter.value.dateRange[0];
  if (filter.value.dateRange && filter.value.dateRange[1]) f.toUtc = filter.value.dateRange[1];
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
      filter.value.providerQueueGroup,
      filter.value.errorOnly,
    ] as const,
  () => {
    page.value = 1;
    void fetchData();
  },
  { deep: true },
);

function resetFilter(): void {
  filter.value = defaultFilter();
  page.value = 1;
}

const displayRecords = computed(() => {
  const kw = filter.value.contactKeyword.trim().toLowerCase();
  if (!kw) return records.value;
  return records.value.filter((r) => {
    const a = accountMap.value.get(r.account.uid);
    if (!a) return false;
    const email = (a.ownerEmail ?? '').toLowerCase();
    const phone = a.ownerPhone ?? '';
    return email.includes(kw) || phone.includes(kw);
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
          reversedAtUtc: r.data.reversedAtUtc,
          reversedBy: r.data.reversedBy,
          reversedCode: r.data.reversedCode,
          reversedRemark: payload.remark?.trim() || null,
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
        main: row.usage.totalTokens.toLocaleString(),
        sub: `${row.usage.input.tokens} / ${row.usage.output.tokens}`,
      };
    case 'per_call':
      return { main: '', sub: '' };
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

/** `group/model` 形态时取 group 作为 queueGroup（如 gemini/gemini-3.1-pro-preview → gemini）。 */
function queueGroupFromModelName(modelName: string): string | null {
  const i = modelName.indexOf('/');
  return i > 0 ? modelName.slice(0, i) : null;
}

/** 供应商渠道：对齐 /demuxai/providers 入库的 ProviderGroup。 */
function channelLabel(row: LogEntry): string {
  const key = queueGroupFromModelName(row.modelName);
  if (!key) return '—';
  return providerGroupMap.value.get(key)?.displayName ?? key;
}

/** 模型列：displayName 与 modelName 相同时只显示一行。 */
function modelCell(row: LogEntry): { title: string; subtitle: string | null; deleted: boolean } {
  const display = modelDisplayName(row.modelName);
  if (display && display !== row.modelName) {
    return { title: display, subtitle: row.modelName, deleted: false };
  }
  return { title: row.modelName, subtitle: null, deleted: display == null };
}

/** 错误码 → 国际化文案；未识别码原样返回 */
function errorCodeText(code: string): string {
  return (LogErrorCodeLabel as Record<string, string>)[code] ?? code;
}

/** 查不到 = 模型已自动删除（无任何 mapping 引用） */
function modelDisplayName(modelName: string): string | null {
  return modelMap.value.get(modelName)?.displayName ?? null;
}

const detailChannelLabel = computed(() =>
  detailLog.value ? channelLabel(detailLog.value) : '',
);
const detailModelDisplay = computed(() =>
  detailLog.value ? modelDisplayName(detailLog.value.modelName) : null,
);

onMounted(() => {
  void loadDeps();
  void fetchData();
});
</script>

<template>
  <div class="page">
    <PageHeader title="调用日志" />

    <FilterBar
      v-model:account-uid="filter.accountUid"
      v-model:contact-keyword="filter.contactKeyword"
      v-model:date-range="filter.dateRange"
      :loading="loading"
      @refresh="fetchData"
      @reset="resetFilter"
    >
      <el-form-item label="模型名">
        <el-input
          v-model="filter.modelName"
          :prefix-icon="Search"
          placeholder="模糊匹配 modelName"
          clearable
          style="width: 220px"
        />
      </el-form-item>
      <el-form-item label="供应商">
        <el-select v-model="filter.providerQueueGroup" clearable placeholder="全部" style="width: 220px">
          <el-option
            v-for="g in providerGroups"
            :key="g.queueGroup"
            :label="g.displayName"
            :value="g.queueGroup"
          />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-checkbox v-model="filter.errorOnly">
          <span class="error-only">
            <el-icon><Warning /></el-icon>
            仅看异常
          </span>
        </el-checkbox>
      </el-form-item>
    </FilterBar>

    <el-table
      v-loading="loading"
      :data="displayRecords"
      row-key="id"
      size="small"
      stripe
      class="log-table"
      :empty-text="' '"
    >
      <el-table-column label="时间" width="172" fixed>
        <template #default="{ row }: { row: LogEntry }">
          <span class="cell-time mono">{{ formatDateTime(row.createAt, 'YYYY-MM-DD HH:mm:ss') }}</span>
        </template>
      </el-table-column>

      <el-table-column label="Conv" min-width="148">
        <template #default="{ row }: { row: LogEntry }">
          <el-tooltip v-if="row.convId" :content="row.convId" placement="top" :show-after="200">
            <span class="cell-conv mono">{{ row.convId }}</span>
          </el-tooltip>
          <span v-else class="cell-muted">—</span>
        </template>
      </el-table-column>

      <el-table-column label="状态" width="88" align="center">
        <template #default="{ row }: { row: LogEntry }">
          <StatusTag v-if="row.success" label="成功" tone="success" />
          <StatusTag
            v-else
            :label="row.error ? errorCodeText(row.error.code) : '失败'"
            tone="danger"
          />
        </template>
      </el-table-column>

      <el-table-column label="模型" min-width="200">
        <template #default="{ row }: { row: LogEntry }">
          <div class="cell-model">
            <span
              class="cell-model__primary"
              :class="{ 'cell-model__primary--gone': modelCell(row).deleted }"
            >
              {{ modelCell(row).title }}
            </span>
            <span v-if="modelCell(row).subtitle" class="cell-model__sub mono">{{ modelCell(row).subtitle }}</span>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="供应商" width="100">
        <template #default="{ row }: { row: LogEntry }">
          <span class="cell-channel">{{ channelLabel(row) }}</span>
        </template>
      </el-table-column>

      <el-table-column label="计费" width="120" align="center">
        <template #default="{ row }: { row: LogEntry }">
          <div class="cell-billing">
            <el-tag size="small" type="info" effect="plain" round>
              {{ BillingTypeLabel[row.billingType] }}
            </el-tag>
            <span v-if="usageSummary(row).main" class="cell-billing__usage num">{{ usageSummary(row).main }}</span>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="扣费" width="112" align="right">
        <template #default="{ row }: { row: LogEntry }">
          <div class="cell-cost">
            <span
              class="cell-cost__amount"
              :class="{ 'cell-cost__amount--reversed': row.bill?.status === 'reversed' }"
            >
              {{ formatMoney(row.cost.total, { fractionDigits: 4 }) }}
            </span>
            <el-tag v-if="row.bill?.status === 'reversed'" size="small" type="info" effect="plain" class="cell-cost__tag">
              已驳回
            </el-tag>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="耗时" width="100" align="right">
        <template #default="{ row }: { row: LogEntry }">
          <span
            v-if="row.tokenLatency != null"
            class="cell-latency num"
            :class="{ 'num-slow': row.streamed && row.tokenLatency > 1500 }"
          >
            {{ row.tokenLatency.toLocaleString() }} ms
          </span>
          <span v-else class="cell-muted">—</span>
        </template>
      </el-table-column>

      <el-table-column label="账户" min-width="120">
        <template #default="{ row }: { row: LogEntry }">
          <el-button
            link
            type="primary"
            class="cell-account-link"
            @click="router.push(`/accounts/${row.account.uid}`)"
          >
            {{ accountMap.get(row.account.uid)?.name ?? row.account.uid }}
          </el-button>
        </template>
      </el-table-column>

      <el-table-column label="" width="88" align="center" fixed="right">
        <template #default="{ row }: { row: LogEntry }">
          <el-button :icon="View" link type="primary" @click="openDetail(row)">详情</el-button>
          <el-button
            v-if="row.bill && row.bill.status !== 'reversed'"
            :icon="RefreshLeft"
            link
            type="danger"
            @click="openReverse(row)"
          >驳回</el-button>
        </template>
      </el-table-column>

      <template #empty>
        <EmptyState
          title="该时间范围内无调用日志"
          description="尝试扩大时间窗口或清除其它过滤条件。"
        />
      </template>
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

    <LogDetailDrawer
      v-model="detailOpen"
      :log="detailLog"
      :channel-label="detailChannelLabel"
      :model-display="detailModelDisplay"
      @reverse="onDrawerReverse"
    />

    <LogReverseDialog
      v-model="reverseOpen"
      :log="reverseLog"
      :submitting="reverseSubmitting"
      @submit="submitReverse"
    />
  </div>
</template>

<style scoped>
.error-only {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--el-color-warning);
}

.log-table {
  margin-top: 4px;
}

.mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}
.num {
  font-variant-numeric: tabular-nums;
}
.num-slow {
  color: var(--el-color-warning);
  font-weight: 500;
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
}
.cell-muted {
  color: var(--el-text-color-placeholder);
}

.cell-model {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.35;
}
.cell-model__primary {
  font-size: 12.5px;
  color: var(--el-text-color-primary);
}
.cell-model__primary--gone {
  color: var(--el-text-color-secondary);
  text-decoration: line-through;
}
.cell-model__sub {
  font-size: 11.5px;
  color: var(--el-text-color-secondary);
}

.cell-channel {
  font-size: 12.5px;
  color: var(--el-text-color-regular);
}
.cell-billing {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.cell-billing__usage {
  font-size: 11.5px;
  color: var(--el-text-color-secondary);
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

.pagination-bar {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
