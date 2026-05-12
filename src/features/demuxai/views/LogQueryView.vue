<script setup lang="ts">
/**
 * 调用日志查询页。
 *
 * 注意事项：
 *  - **必须传时间范围**：UI 默认填最近 24h；用户清空 dateRange 时按钮置灰
 *  - 跨域 join：用 accountUid → 调 accountAdminPort 拉账户 directory，
 *    展示账户名 + LV（仅 view 层组合，不污染 demuxai/model）
 *  - 上方 4 个 KPI 卡片随同一份 filter 走 stats 端点
 *  - 错误日志一键过滤 → 排障常用
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { Search, View, Warning } from '@element-plus/icons-vue';
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
  LogStatusLabel,
  LogStatusTone,
  logStatusValues,
  type LogStatus,
} from '../model/enums';
import type { ListLogsFilter, LogEntry, LogStats } from '../model/log.types';
import type { Model } from '../model/model.types';
import type { Provider } from '../model/provider.types';
import {
  getDemuxaiLogsPort,
  getDemuxaiModelPort,
  getDemuxaiProviderPort,
} from '../services';
import LogDetailDrawer from '../components/LogDetailDrawer.vue';

const router = useRouter();
const logsPort = getDemuxaiLogsPort();
const modelPort = getDemuxaiModelPort();
const providerPort = getDemuxaiProviderPort();
const accountPort = getAccountAdminPort();

const records = ref<LogEntry[]>([]);
const total = ref(0);
const loading = ref(false);

const page = ref(1);
const pageSize = ref(50);

const stats = ref<LogStats | null>(null);

interface PageFilter {
  accountUid: string;
  contactKeyword: string;
  dateRange: [string, string] | null;
  modelId: string;
  providerUid: string;
  status: LogStatus | 'all';
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
  modelId: '',
  providerUid: '',
  status: 'all',
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
const providerMap = computed(() => {
  const m = new Map<string, Provider>();
  for (const it of providers.value) m.set(it.uid, it);
  return m;
});

const detailOpen = ref(false);
const detailLog = ref<LogEntry | null>(null);

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
    status: filter.value.status,
    errorOnly: filter.value.errorOnly,
  };
  if (filter.value.accountUid.trim()) f.accountUid = filter.value.accountUid.trim();
  if (filter.value.modelId.trim()) f.modelId = filter.value.modelId.trim();
  if (filter.value.providerUid) f.providerUid = filter.value.providerUid;
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
    const f = buildPortFilter();
    const [listR, statsR] = await Promise.all([
      logsPort.list({
        page: page.value,
        pageSize: pageSize.value,
        filter: f,
      }),
      logsPort.stats(f),
    ]);
    if (listR.success) {
      records.value = listR.data.items;
      total.value = listR.data.total;
    } else {
      ElMessage.error(listR.error.message);
    }
    if (statsR.success) stats.value = statsR.data;
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
      filter.value.modelId,
      filter.value.providerUid,
      filter.value.status,
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
    const a = accountMap.value.get(r.accountUid);
    if (!a) return false;
    const email = (a.ownerEmail ?? '').toLowerCase();
    const phone = a.ownerPhone ?? '';
    return email.includes(kw) || phone.includes(kw);
  });
});

const successRate = computed(() => {
  if (!stats.value || stats.value.totalCalls === 0) return 0;
  return (stats.value.successCalls / stats.value.totalCalls) * 100;
});

function openDetail(row: LogEntry): void {
  detailLog.value = row;
  detailOpen.value = true;
}

function providerName(uid: string): string {
  return providerMap.value.get(uid)?.name ?? uid;
}

/** 查不到 = 模型已自动删除（无任何 mapping 引用） */
function modelDisplayName(modelId: string): string | null {
  return modelMap.value.get(modelId)?.displayName ?? null;
}

const detailProviderName = computed(() =>
  detailLog.value ? providerName(detailLog.value.providerUid) : '',
);
const detailModelDisplay = computed(() =>
  detailLog.value ? modelDisplayName(detailLog.value.modelId) : null,
);

onMounted(() => {
  void loadDeps();
  void fetchData();
});
</script>

<template>
  <div class="page">
    <PageHeader
      title="调用日志"
      description="DemuxAI 微服务调用流水。**必须**指定时间范围（最长 7 天）。账户名 / LV 来自账户域 join，单条详情查看 Token / 扣费 / 链路 / 错误信息。"
    />

    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-card__label">总调用</div>
        <div class="kpi-card__value">{{ (stats?.totalCalls ?? 0).toLocaleString() }}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card__label">成功率</div>
        <div
          class="kpi-card__value"
          :class="{ 'kpi-card__value--warning': successRate < 95, 'kpi-card__value--danger': successRate < 90 }"
        >
          {{ successRate.toFixed(2) }}%
        </div>
        <div class="kpi-card__sub">
          失败 <span class="num">{{ (stats?.errorCalls ?? 0).toLocaleString() }}</span>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card__label">P95 延迟</div>
        <div class="kpi-card__value">
          {{ (stats?.p95LatencyMs ?? 0).toLocaleString() }} <span class="unit">ms</span>
        </div>
        <div class="kpi-card__sub">
          均值 <span class="num">{{ (stats?.avgLatencyMs ?? 0).toLocaleString() }}</span> ms
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card__label">总扣费</div>
        <div class="kpi-card__value">{{ formatMoney(stats?.totalCost ?? 0) }}</div>
        <div class="kpi-card__sub">
          {{ ((stats?.totalTokens ?? 0) / 1000).toFixed(1) }}K tokens
        </div>
      </div>
    </div>

    <FilterBar
      v-model:account-uid="filter.accountUid"
      v-model:contact-keyword="filter.contactKeyword"
      v-model:date-range="filter.dateRange"
      :loading="loading"
      @refresh="fetchData"
      @reset="resetFilter"
    >
      <el-form-item label="modelId">
        <el-input
          v-model="filter.modelId"
          :prefix-icon="Search"
          placeholder="模糊匹配"
          clearable
          style="width: 220px"
        />
      </el-form-item>
      <el-form-item label="供应商">
        <el-select v-model="filter.providerUid" clearable placeholder="全部" style="width: 220px">
          <el-option
            v-for="p in providers"
            :key="p.uid"
            :label="p.name"
            :value="p.uid"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="filter.status" style="width: 160px">
          <el-option label="全部" value="all" />
          <el-option
            v-for="s in logStatusValues"
            :key="s"
            :label="LogStatusLabel[s]"
            :value="s"
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
      row-key="uid"
      size="small"
      class="compact-table"
      :empty-text="' '"
    >
      <el-table-column label="时间" width="160">
        <template #default="{ row }: { row: LogEntry }">
          <span class="cell-date">{{ formatDateTime(row.occurredAtUtc, 'MM-DD HH:mm:ss') }}</span>
        </template>
      </el-table-column>

      <el-table-column label="账户" min-width="200">
        <template #default="{ row }: { row: LogEntry }">
          <div class="cell-account">
            <el-button
              link
              class="cell-account__uid"
              @click="router.push(`/accounts/${row.accountUid}`)"
            >
              {{ accountMap.get(row.accountUid)?.name ?? row.accountUid }}
            </el-button>
            <div class="cell-account__sub">
              Lv{{ row.tierSnapshot }} · IAM <span class="mono">{{ row.iamUserUid }}</span>
            </div>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="模型" min-width="220">
        <template #default="{ row }: { row: LogEntry }">
          <div class="cell-model">
            <template v-if="modelDisplayName(row.modelId)">
              <span class="cell-model__name">{{ modelDisplayName(row.modelId) }}</span>
              <span class="cell-model__id mono">{{ row.modelId }}</span>
            </template>
            <template v-else>
              <span class="cell-model__deleted">
                <el-tag size="small" type="info" effect="plain">已删除</el-tag>
                <span class="cell-model__id mono">{{ row.modelId }}</span>
              </span>
            </template>
            <div class="cell-model__sub">
              → <span class="mono">{{ row.providerModelId }}</span>
            </div>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="供应商" min-width="160">
        <template #default="{ row }: { row: LogEntry }">
          <span class="cell-channel">{{ providerName(row.providerUid) }}</span>
        </template>
      </el-table-column>

      <el-table-column label="Tokens" width="120" align="right">
        <template #default="{ row }: { row: LogEntry }">
          <div class="cell-tokens">
            <span class="num">{{ row.totalTokens.toLocaleString() }}</span>
            <div class="cell-tokens__sub">
              <span class="num">{{ row.promptTokens }}</span> /
              <span class="num">{{ row.completionTokens }}</span>
            </div>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="扣费" width="100" align="right">
        <template #default="{ row }: { row: LogEntry }">
          <span class="cell-cost">{{ formatMoney(row.totalCost, { fractionDigits: 4 }) }}</span>
        </template>
      </el-table-column>

      <el-table-column label="延迟" width="100" align="right">
        <template #default="{ row }: { row: LogEntry }">
          <span class="num" :class="{ 'num-slow': row.latencyMs > 3000 }">
            {{ row.latencyMs.toLocaleString() }} ms
          </span>
        </template>
      </el-table-column>

      <el-table-column label="状态" width="100">
        <template #default="{ row }: { row: LogEntry }">
          <StatusTag :label="LogStatusLabel[row.status]" :tone="LogStatusTone[row.status]" />
        </template>
      </el-table-column>

      <el-table-column label="" width="60" align="center">
        <template #default="{ row }: { row: LogEntry }">
          <el-button :icon="View" link type="primary" @click="openDetail(row)" />
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
        :page-sizes="[50, 100]"
        layout="total, sizes, prev, pager, next"
        background
      />
    </div>

    <LogDetailDrawer
      v-model="detailOpen"
      :log="detailLog"
      :provider-name="detailProviderName"
      :model-display="detailModelDisplay"
    />
  </div>
</template>

<style scoped>
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(180px, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}
.kpi-card {
  background: #fff;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 14px 16px;
}
.kpi-card__label {
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
}
.kpi-card__value {
  margin-top: 4px;
  font-size: 22px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  font-variant-numeric: tabular-nums;
}
.kpi-card__value--warning {
  color: var(--el-color-warning);
}
.kpi-card__value--danger {
  color: var(--el-color-danger);
}
.kpi-card__sub {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.unit {
  font-size: 14px;
  color: var(--el-text-color-secondary);
  font-weight: 500;
  margin-left: 2px;
}

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

.cell-tokens {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  line-height: 1.3;
}
.cell-tokens__sub {
  font-size: 11.5px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
.cell-cost {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
  color: var(--el-color-warning);
  font-weight: 500;
}

.pagination-bar {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
