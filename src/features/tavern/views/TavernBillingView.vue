<script setup lang="ts">
/**
 * Tavern 计费明细：每行一个向用户扣费的回合（platform.usage_logs）。
 *
 *  - 详情抽屉跟着 `?id=` 走：调用日志里点「查看计费回合」直接带 id 跳进来，行点击也写进地址，链接可分享
 *  - 金额是扣费当时的价目算的；抽屉里另给服务端按现行价目重算的数，价目改过会标出来
 */
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Search } from '@element-plus/icons-vue';

import PageHeader from '@/shared/ui/PageHeader.vue';
import StatusTag from '@/shared/ui/StatusTag.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import { formatDateTime } from '@/shared/lib/date';
import DateRangeBar from '@/features/yomi/components/overview/DateRangeBar.vue';

import BillingTurnDrawer from '../components/metering/BillingTurnDrawer.vue';
import CopyableId from '../components/metering/CopyableId.vue';
import {
  TurnStatusLabel,
  TurnStatusTone,
  turnStatusValues,
  type AccountSpend,
  type TurnStatus,
  type UsageLog,
  type UsageLogQuery,
  type UsageSummary,
} from '../model/metering.types';
import {
  checkRange,
  digestUsages,
  formatCny,
  formatTokens,
  last24h,
  parseAccountUid,
  shortId,
  type TurnUsageDigest,
} from '../model/meteringFormat';
import { getTavernBillingPort } from '../services';

const port = getTavernBillingPort();
const route = useRoute();
const router = useRouter();

interface PageFilter {
  dateRange: [string, string] | null;
  accountUid: string;
  status: '' | TurnStatus;
}

const defaultFilter = (): PageFilter => ({
  dateRange: last24h(),
  accountUid: '',
  status: '',
});

const filter = reactive<PageFilter>(defaultFilter());

const records = ref<UsageLog[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const summary = ref<UsageSummary | null>(null);
const loading = ref(false);
const summaryLoading = ref(false);
const searched = ref(false);

type TurnFilters = Omit<UsageLogQuery, 'page' | 'pageSize'>;

let activeFilters: TurnFilters | null = null;
let listSeq = 0;
let summarySeq = 0;

function buildFilters(): TurnFilters | null {
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
    status: filter.status || undefined,
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

async function loadSummary({ fromUtc, toUtc, accountUid }: TurnFilters): Promise<void> {
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

function filterByAccount(uid: number): void {
  filter.accountUid = String(uid);
  search();
}

// ─── 详情（跟着 ?id= 走） ─────────────────────────────────

const detailId = computed<number | null>(() => {
  const raw = route.query.id;
  const text = Array.isArray(raw) ? raw[0] : raw;
  return text && /^\d+$/.test(text) ? Number(text) : null;
});

const detailOpen = computed({
  get: () => detailId.value != null,
  set: (open: boolean) => {
    if (!open) closeDetail();
  },
});

function openDetail(row: TurnRow): void {
  void router.replace({ query: { ...route.query, id: String(row.id) } });
}

function closeDetail(): void {
  const query = { ...route.query };
  delete query.id;
  void router.replace({ query });
}

/** 列表行的展示派生：每页算一次，模板里直接读。 */
interface TurnRow extends UsageLog {
  models: string[];
  digest: TurnUsageDigest;
}

const rows = computed<TurnRow[]>(() =>
  records.value.map((log) => ({
    ...log,
    models: [...new Set(log.usages.map((u) => (u.vendorKey ? `${u.vendorKey}/${u.modelName}` : u.modelName)))],
    digest: digestUsages(log.usages),
  })),
);

function rowClass(): string {
  return 'turn-row';
}

onMounted(search);
</script>

<template>
  <div class="page">
    <PageHeader
      title="计费明细"
      description="每行一个向用户扣费的回合，金额按扣费当时的价目。作废 / 扣费失败的回合金额为 0。"
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
      <el-form-item label="状态">
        <el-select
          v-model="filter.status"
          placeholder="全部"
          clearable
          style="width: 130px"
          @change="search"
        >
          <el-option
            v-for="s in turnStatusValues"
            :key="s"
            :label="TurnStatusLabel[s]"
            :value="s"
          />
        </el-select>
      </el-form-item>
    </DateRangeBar>

    <div
      v-loading="summaryLoading && !summary"
      class="overview"
    >
      <div class="kpi">
        <div class="kpi__item">
          <span class="kpi__label">回合数</span>
          <span class="kpi__value num">{{ summary?.turns.total.toLocaleString() ?? '—' }}</span>
          <span
            v-if="summary"
            class="kpi__sub"
          >已扣费 {{ summary.turns.charged.toLocaleString() }}</span>
        </div>
        <div class="kpi__item">
          <span class="kpi__label">实扣金额</span>
          <span class="kpi__value num">{{ summary ? formatCny(summary.chargedAmount, 4) : '—' }}</span>
        </div>
        <div class="kpi__item">
          <span class="kpi__label">作废 / 失败</span>
          <span class="kpi__value num">
            <template v-if="summary">
              {{ summary.turns.voided.toLocaleString() }}<span class="kpi__slash">/</span><span
                :class="{ 'is-warning': summary.turns.failed > 0 }"
              >{{ summary.turns.failed.toLocaleString() }}</span>
            </template>
            <template v-else>—</template>
          </span>
          <span class="kpi__sub">均未收费</span>
        </div>
        <div class="kpi__item">
          <span class="kpi__label">付费账号数</span>
          <span class="kpi__value num">{{ summary?.payingAccounts.toLocaleString() ?? '—' }}</span>
        </div>
        <div class="kpi__item">
          <span class="kpi__label">Tokens</span>
          <span class="kpi__value num">
            {{ summary ? `${formatTokens(summary.tokens.input)} / ${formatTokens(summary.tokens.output)}` : '—' }}
          </span>
          <span class="kpi__sub">输入 / 输出</span>
        </div>
      </div>

      <section class="card top">
        <h2 class="card__title">
          消费最多的账号
        </h2>
        <el-table
          :data="summary?.topAccounts ?? []"
          size="small"
          max-height="240"
          :empty-text="searched ? '暂无' : ' '"
        >
          <el-table-column label="账号">
            <template #default="{ row }: { row: AccountSpend }">
              <el-button
                link
                type="primary"
                class="mono cell-link"
                :title="`只看账号 ${row.accountUid}`"
                @click="filterByAccount(row.accountUid)"
              >
                {{ row.accountUid }}
              </el-button>
            </template>
          </el-table-column>
          <el-table-column
            label="回合"
            width="70"
            align="right"
          >
            <template #default="{ row }: { row: AccountSpend }">
              <span class="num">{{ row.turns.toLocaleString() }}</span>
            </template>
          </el-table-column>
          <el-table-column
            label="金额"
            width="110"
            align="right"
          >
            <template #default="{ row }: { row: AccountSpend }">
              <span class="num">{{ formatCny(row.amount, 4) }}</span>
            </template>
          </el-table-column>
        </el-table>
      </section>
    </div>

    <section class="card list">
      <el-table
        v-loading="loading"
        :data="rows"
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
          <template #default="{ row }: { row: TurnRow }">
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
          <template #default="{ row }: { row: TurnRow }">
            <el-button
              link
              type="primary"
              class="mono cell-link"
              :title="`按账号 ${row.accountUid} 过滤`"
              @click.stop="filterByAccount(row.accountUid)"
            >
              {{ row.accountUid }}
            </el-button>
          </template>
        </el-table-column>

        <el-table-column
          label="会话"
          width="150"
        >
          <template #default="{ row }: { row: TurnRow }">
            <CopyableId
              :value="row.sessionId"
              :display="shortId(row.sessionId)"
              label="会话 ID"
            />
          </template>
        </el-table-column>

        <el-table-column
          label="状态"
          width="96"
          align="center"
        >
          <template #default="{ row }: { row: TurnRow }">
            <StatusTag
              :label="TurnStatusLabel[row.status]"
              :tone="TurnStatusTone[row.status]"
            />
          </template>
        </el-table-column>

        <el-table-column
          label="模型"
          min-width="200"
        >
          <template #default="{ row }: { row: TurnRow }">
            <div class="cell-models">
              <span
                v-for="m in row.models"
                :key="m"
                class="mono cell-models__item"
              >{{ m }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column
          label="用量"
          width="160"
        >
          <template #default="{ row }: { row: TurnRow }">
            <div class="cell-usage">
              <span
                class="mono"
                :title="`输入 ${row.digest.input.toLocaleString()} · 输出 ${row.digest.output.toLocaleString()}`"
              >▲ {{ formatTokens(row.digest.input) }}  ▼ {{ formatTokens(row.digest.output) }}</span>
              <span
                v-for="text in row.digest.counted"
                :key="text"
                class="sub"
              >{{ text }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column
          label="金额"
          width="110"
          align="right"
        >
          <template #default="{ row }: { row: TurnRow }">
            <span
              class="num cell-amount"
              :class="{ 'is-muted': row.status !== 'charged' }"
            >{{ formatCny(row.amount) }}</span>
          </template>
        </el-table-column>

        <el-table-column
          label="账单号"
          min-width="180"
        >
          <template #default="{ row }: { row: TurnRow }">
            <CopyableId
              :value="row.billSerialNo"
              label="账单号"
            />
          </template>
        </el-table-column>

        <el-table-column
          label="自主"
          width="64"
          align="center"
        >
          <template #default="{ row }: { row: TurnRow }">
            <el-tag
              v-if="row.proactive"
              size="small"
              type="warning"
              effect="plain"
            >
              自主
            </el-tag>
          </template>
        </el-table-column>

        <template #empty>
          <EmptyState
            v-if="searched"
            title="没有符合条件的计费回合"
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

    <BillingTurnDrawer
      v-model:visible="detailOpen"
      :usage-log-id="detailId"
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

.overview {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr);
  gap: 14px;
  align-items: start;
}

.kpi {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
}

.kpi__item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 14px;
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

.kpi__slash {
  margin: 0 4px;
  font-weight: 400;
  color: var(--el-text-color-placeholder);
}

.kpi__sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
}

.card__title {
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.top {
  padding: 12px 14px 6px;
}

.list {
  overflow: hidden;
}

.list :deep(.turn-row) {
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
  font-size: 12px;
}

.mono-input :deep(.el-input__inner) {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}

.num {
  font-variant-numeric: tabular-nums;
}

.sub {
  font-size: 11.5px;
  color: var(--el-text-color-secondary);
}

.is-warning {
  color: var(--el-color-warning-dark-2);
}

.is-muted {
  color: var(--el-text-color-placeholder);
}

.cell-time {
  white-space: nowrap;
}

.cell-link {
  padding: 0;
  height: auto;
}

.cell-models {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.35;
}

.cell-models__item {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cell-usage {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.35;
  white-space: pre;
}

.cell-amount {
  font-size: 12.5px;
  font-weight: 500;
}

@media (max-width: 1100px) {
  .overview {
    grid-template-columns: 1fr;
  }
}
</style>
