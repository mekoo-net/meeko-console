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
import type { Model } from '../model/model.types';
import type { Provider } from '../model/provider.types';
import {
  getDemuxaiLogsPort,
  getDemuxaiModelPort,
  getDemuxaiProviderPort,
} from '../services';
import LogDetailDrawer from '../components/LogDetailDrawer.vue';
import LogReverseDialog from '../components/LogReverseDialog.vue';

const router = useRouter();
const logsPort = getDemuxaiLogsPort();
const modelPort = getDemuxaiModelPort();
const providerPort = getDemuxaiProviderPort();
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
  /**
   * 命中渠道的 int 主键。空字符串 = 未选；UI 用 el-select 选 Provider 后转 number。
   * 用 number | '' 而非 number | null 是为了让 el-select 的 clearable 行为对齐 Element Plus。
   */
  providerId: number | '';
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
  providerId: '',
  errorOnly: false,
});

const filter = ref<PageFilter>(defaultFilter());

const models = ref<Model[]>([]);
const providers = ref<Provider[]>([]);
const accountMap = ref<Map<string, Account>>(new Map());

const modelMap = computed(() => {
  const m = new Map<string, Model>();
  for (const it of models.value) m.set(it.modelId, it);
  return m;
});
/** 渠道 int 主键 → Provider，供"渠道列"反查显示名。 */
const providerMap = computed(() => {
  const m = new Map<number, Provider>();
  for (const it of providers.value) m.set(it.id, it);
  return m;
});

const detailOpen = ref(false);
const detailLog = ref<LogEntry | null>(null);

const reverseOpen = ref(false);
const reverseLog = ref<LogEntry | null>(null);
const reverseSubmitting = ref(false);

async function loadDeps(): Promise<void> {
  const [mr, pr, ar] = await Promise.all([
    modelPort.list({
      page: 1,
      pageSize: 500,
      filter: { keyword: '', family: 'all', capability: 'all' },
    }),
    providerPort.list({
      page: 1,
      pageSize: 200,
      filter: { keyword: '', apiType: 'all', status: 'all' },
    }),
    accountPort.listAccounts({
      page: 1,
      pageSize: 200,
      filter: { accountUid: '', contactKeyword: '', type: 'all', status: 'all' },
    }),
  ]);
  if (mr.success) models.value = mr.data.items;
  if (pr.success) providers.value = pr.data.items;
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
  if (filter.value.providerId !== '') f.providerId = filter.value.providerId;
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
      filter.value.providerId,
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
      return { main: `${row.usage.calls} 次`, sub: '' };
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

function providerName(id: number): string {
  return providerMap.value.get(id)?.name ?? `#${id}`;
}

/** 错误码 → 国际化文案；未识别码原样返回 */
function errorCodeText(code: string): string {
  return (LogErrorCodeLabel as Record<string, string>)[code] ?? code;
}

/** 查不到 = 模型已自动删除（无任何 mapping 引用） */
function modelDisplayName(modelName: string): string | null {
  return modelMap.value.get(modelName)?.displayName ?? null;
}

const detailProviderName = computed(() =>
  detailLog.value ? providerName(detailLog.value.providerId) : '',
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
      <el-form-item label="模型渠道">
        <el-select v-model="filter.providerId" clearable placeholder="全部" style="width: 220px">
          <el-option
            v-for="p in providers"
            :key="p.id"
            :label="p.name"
            :value="p.id"
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
      class="compact-table"
      :empty-text="' '"
    >
      <el-table-column label="时间" width="160">
        <template #default="{ row }: { row: LogEntry }">
          <span class="cell-date">{{ formatDateTime(row.createAt, 'MM-DD HH:mm:ss') }}</span>
        </template>
      </el-table-column>

      <el-table-column label="账户" min-width="200">
        <template #default="{ row }: { row: LogEntry }">
          <div class="cell-account">
            <el-button
              link
              class="cell-account__uid"
              @click="router.push(`/accounts/${row.account.uid}`)"
            >
              {{ accountMap.get(row.account.uid)?.name ?? row.account.uid }}
            </el-button>
            <div class="cell-account__sub">
              Lv{{ row.cost.tierSnapshot }} · IAM <span class="mono">{{ row.account.iamId }}</span>
            </div>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="模型" min-width="220">
        <template #default="{ row }: { row: LogEntry }">
          <div class="cell-model">
            <template v-if="modelDisplayName(row.modelName)">
              <span class="cell-model__name">{{ modelDisplayName(row.modelName) }}</span>
              <span class="cell-model__id mono">{{ row.modelName }}</span>
            </template>
            <template v-else>
              <span class="cell-model__deleted">
                <el-tag size="small" type="info" effect="plain">已删除</el-tag>
                <span class="cell-model__id mono">{{ row.modelName }}</span>
              </span>
            </template>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="模型渠道" min-width="160">
        <template #default="{ row }: { row: LogEntry }">
          <span class="cell-channel">{{ providerName(row.providerId) }}</span>
        </template>
      </el-table-column>

      <el-table-column label="会话" width="140">
        <template #default="{ row }: { row: LogEntry }">
          <span class="cell-conv mono">{{ row.convId }}</span>
        </template>
      </el-table-column>

      <el-table-column label="用量" width="140" align="right">
        <template #default="{ row }: { row: LogEntry }">
          <div class="cell-tokens">
            <span class="num">{{ usageSummary(row).main }}</span>
            <div class="cell-tokens__sub">
              <el-tag size="small" type="info" effect="plain" round class="cell-tokens__type">
                {{ BillingTypeLabel[row.billingType] }}
              </el-tag>
              <span v-if="usageSummary(row).sub" class="num cell-tokens__detail">
                {{ usageSummary(row).sub }}
              </span>
            </div>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="扣费" width="150" align="right">
        <template #default="{ row }: { row: LogEntry }">
          <div class="cell-cost">
            <div class="cell-cost__line">
              <span
                class="cell-cost__amount"
                :class="{ 'cell-cost__amount--reversed': row.bill?.status === 'reversed' }"
              >
                {{ formatMoney(row.cost.total, { fractionDigits: 4 }) }}
              </span>
              <el-tooltip content="查看扣费明细" placement="top" :show-after="200">
                <el-button
                  :icon="View"
                  link
                  type="primary"
                  class="cell-cost__view"
                  @click="openDetail(row)"
                />
              </el-tooltip>
            </div>
            <el-tooltip
              v-if="row.bill?.status === 'reversed'"
              :content="`${BillReverseCodeLabel[row.bill.reversedCode!]} · ${formatDateTime(row.bill.reversedAtUtc!, 'MM-DD HH:mm')}`"
              placement="top"
            >
              <el-tag size="small" type="info" effect="plain" class="cell-cost__reversed-tag">
                已驳回
              </el-tag>
            </el-tooltip>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="延迟" width="130" align="right">
        <template #default="{ row }: { row: LogEntry }">
          <div v-if="row.tokenLatency != null" class="cell-latency">
            <span
              class="num"
              :class="{ 'num-slow': row.streamed ? row.tokenLatency > 1500 : row.tokenLatency > 5000 }"
            >
              {{ row.tokenLatency.toLocaleString() }} ms
            </span>
            <span class="cell-latency__sub">
              {{ row.streamed ? '首字延迟' : '总耗时' }}
            </span>
          </div>
          <span v-else class="cell-muted">—</span>
        </template>
      </el-table-column>

      <el-table-column label="状态" width="140">
        <template #default="{ row }: { row: LogEntry }">
          <StatusTag
            v-if="row.success"
            label="成功"
            tone="success"
          />
          <StatusTag
            v-else
            :label="row.error ? errorCodeText(row.error.code) : '失败'"
            tone="danger"
          />
        </template>
      </el-table-column>

      <el-table-column label="操作" width="100" align="center">
        <template #default="{ row }: { row: LogEntry }">
          <el-button
            v-if="row.bill && row.bill.status !== 'reversed'"
            :icon="RefreshLeft"
            link
            type="danger"
            @click="openReverse(row)"
          >
            驳回
          </el-button>
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
      :provider-name="detailProviderName"
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

.cell-account {
  display: flex;
  flex-direction: column;
  line-height: 1.35;
}
.cell-account__uid {
  padding: 0;
  height: auto;
  line-height: 1.4;
  justify-content: flex-start;
  font-size: 12.5px;
  color: var(--el-color-primary);
}
.cell-account__sub {
  font-size: 11.5px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}

.cell-model__name {
  font-size: 12.5px;
  color: var(--el-text-color-primary);
  margin-right: 6px;
}
.cell-model__id {
  font-size: 11.5px;
  color: var(--el-text-color-secondary);
}
.cell-model__sub {
  font-size: 11.5px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
.cell-model__deleted {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.cell-model__deleted .cell-model__id {
  text-decoration: line-through;
}

.cell-channel {
  font-size: 12.5px;
  color: var(--el-text-color-regular);
}
.cell-conv {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  word-break: break-all;
}

.cell-tokens {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  line-height: 1.3;
}
.cell-tokens__sub {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11.5px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
.cell-tokens__type {
  font-size: 11px;
  height: 18px;
  padding: 0 6px;
}
.cell-tokens__detail {
  font-size: 11.5px;
}
.cell-latency {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  line-height: 1.3;
}
.cell-latency__sub {
  font-size: 11.5px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
.cell-muted {
  color: var(--el-text-color-secondary);
}
.cell-cost {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  line-height: 1.3;
  gap: 2px;
}
.cell-cost__line {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.cell-cost__amount {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
  color: var(--el-color-warning);
  font-weight: 500;
}
/* 驳回行：金额加删除线 + 灰化，强调"实际扣费 = 0" */
.cell-cost__amount--reversed {
  color: var(--el-text-color-secondary);
  text-decoration: line-through;
  font-weight: 400;
}
.cell-cost__view {
  padding: 0;
  height: auto;
  min-height: 0;
}
.cell-cost__view :deep(.el-icon) {
  font-size: 15px;
}
.cell-cost__reversed-tag {
  font-size: 11px;
  height: 18px;
  padding: 0 6px;
}

.pagination-bar {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
