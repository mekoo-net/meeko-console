<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { CopyDocument, Delete, Plus, Refresh, View } from '@element-plus/icons-vue';

import EmptyState from '@/shared/ui/EmptyState.vue';
import FillListPageLayout from '@/shared/ui/FillListPageLayout.vue';
import PageHeader from '@/shared/ui/PageHeader.vue';
import StatusTag from '@/shared/ui/StatusTag.vue';
import { formatDateTime } from '@/shared/lib/date';
import { formatQuota } from '@/shared/lib/quota';
import type { AppError } from '@/shared/api/httpTypes';

import RedemptionFilterBar from '../components/RedemptionFilterBar.vue';
import RedemptionCreateDrawer from '../components/RedemptionCreateDrawer.vue';
import RedemptionCreateSuccessDialog from '../components/RedemptionCreateSuccessDialog.vue';
import RedemptionDetailDrawer from '../components/RedemptionDetailDrawer.vue';
import RedemptionStatsBar from '../components/RedemptionStatsBar.vue';
import {
  isSharedRedemptionCode,
  type RedemptionCode,
  type RedemptionCodeKind,
  type RedemptionStatus,
} from '../model/redemption.types';
import type { RedemptionListStats } from '../model/redemptionDisplay';
import {
  isRedemptionExhausted,
  maskRedemptionKey,
  redemptionDisplayStatus,
  redemptionProgressPercent,
  redemptionProgressText,
  snapshotRedemptionCode,
} from '../model/redemptionDisplay';
import { getDemuxaiRedemptionPort } from '../services';

const port = getDemuxaiRedemptionPort();

const items = ref<RedemptionCode[]>([]);
const total = ref(0);
const listStats = ref<RedemptionListStats>({
  total: 0,
  claimable: 0,
  inProgress: 0,
  exhausted: 0,
  expired: 0,
});
const loading = ref(false);
const statsLoading = ref(false);
const error = ref<AppError | undefined>();

const page = ref(1);
const pageSize = ref(20);
const keyword = ref('');
const statusFilter = ref<RedemptionStatus | 'all'>('all');
const kindFilter = ref<RedemptionCodeKind>('all');

const createDrawerVisible = ref(false);
const successDialogVisible = ref(false);
const successKeys = ref<string[]>([]);
const successBatchName = ref('');

const detailVisible = ref(false);
/** 打开详情时的快照，避免列表刷新导致 Drawer 内 vnode 错乱。 */
const detailSnapshot = ref<RedemptionCode | null>(null);
const refreshAfterDetailClose = ref(false);

const defaultFilter = () => ({
  keyword: '',
  status: 'all' as RedemptionStatus | 'all',
  kind: 'all' as RedemptionCodeKind,
});

function listFilter() {
  return {
    keyword: keyword.value.trim() || undefined,
    status: statusFilter.value,
    kind: kindFilter.value === 'all' ? undefined : kindFilter.value,
  };
}

async function fetchStats(): Promise<void> {
  statsLoading.value = true;
  try {
    const r = await port.stats();
    if (r.success) listStats.value = r.data;
  } finally {
    statsLoading.value = false;
  }
}

async function fetchData(): Promise<void> {
  loading.value = true;
  error.value = undefined;
  try {
    const r = await port.list({
      page: page.value,
      pageSize: pageSize.value,
      filter: listFilter(),
    });
    if (r.success) {
      items.value = r.data.items;
      total.value = r.data.total;
    } else {
      error.value = r.error;
      ElMessage.error(r.error.message);
    }
  } finally {
    loading.value = false;
  }
}

async function refreshAll(): Promise<void> {
  await Promise.all([fetchData(), fetchStats()]);
}

function resetFilter(): void {
  const d = defaultFilter();
  keyword.value = d.keyword;
  statusFilter.value = d.status;
  kindFilter.value = d.kind;
  page.value = 1;
  void refreshAll();
}

function openDetail(row: RedemptionCode): void {
  detailSnapshot.value = snapshotRedemptionCode(row);
  detailVisible.value = true;
}

function onDetailClosed(): void {
  detailVisible.value = false;
  detailSnapshot.value = null;
  if (refreshAfterDetailClose.value) {
    refreshAfterDetailClose.value = false;
    void refreshAll();
  }
}

async function removeRow(row: RedemptionCode): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确认删除「${row.name}」？此操作不可恢复。`,
      '删除激活码',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  const r = await port.remove(row.id);
  if (r.success) {
    ElMessage.success('已删除');
    if (detailVisible.value && detailSnapshot.value?.id === row.id) {
      detailVisible.value = false;
      refreshAfterDetailClose.value = true;
    } else {
      await refreshAll();
    }
  } else {
    ElMessage.error(r.error.message);
  }
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success('已复制');
  } catch {
    ElMessage.error('复制失败');
  }
}

function formatTs(ms: number | null): string {
  if (!ms) return '—';
  return formatDateTime(ms);
}

function onCreated(payload: { keys: string[]; batchName: string }): void {
  detailVisible.value = false;
  successKeys.value = payload.keys;
  successBatchName.value = payload.batchName;
  successDialogVisible.value = true;
  page.value = 1;
}

function onSuccessDialogClosed(): void {
  successKeys.value = [];
  void refreshAll();
}

onMounted(() => void refreshAll());
</script>

<template>
  <FillListPageLayout>
    <template #header>
      <PageHeader
        title="激活码"
        description="管理充值兑换码与活动码；列表展示批次与进度，详情中查看完整 Key 与领取记录。"
      >
        <template #actions>
          <el-button :icon="Refresh" :loading="loading" @click="refreshAll()">刷新</el-button>
          <el-button type="primary" :icon="Plus" @click="createDrawerVisible = true">
            发布激活码
          </el-button>
        </template>
      </PageHeader>
    </template>

    <template #filters>
      <RedemptionStatsBar :stats="listStats" :loading="statsLoading" />

      <RedemptionFilterBar
        v-model:keyword="keyword"
        v-model:status="statusFilter"
        v-model:kind="kindFilter"
        :loading="loading"
        @refresh="page = 1; refreshAll()"
        @reset="resetFilter()"
      />

      <el-alert
        v-if="error"
        :title="`加载失败：${error.code}`"
        :description="error.message"
        type="error"
        show-icon
        :closable="false"
      />

      <span class="table-toolbar__meta">
        当前筛选 <strong>{{ total }}</strong> 条
      </span>
    </template>

    <el-table
      v-loading="loading"
      :data="items"
      row-key="id"
      size="small"
      class="compact-table redemption-table"
      height="100%"
      :empty-text="' '"
    >
        <el-table-column label="批次 / 活动" min-width="220" fixed="left">
          <template #default="{ row }">
            <div class="cell-batch">
              <button type="button" class="cell-batch__name" @click.stop="openDetail(row)">
                {{ row.name }}
              </button>
              <span class="cell-batch__meta">
                #{{ row.id }}
                <el-tag
                  v-if="isSharedRedemptionCode(row)"
                  size="small"
                  type="warning"
                  effect="plain"
                  round
                >
                  活动码
                </el-tag>
                <code class="cell-batch__key">{{ maskRedemptionKey(row.key) }}</code>
              </span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="面额" width="100" align="right">
          <template #default="{ row }">
            <span class="cell-quota">{{ formatQuota(row.quota) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="领取进度" min-width="160">
          <template #default="{ row }">
            <template v-if="isSharedRedemptionCode(row)">
              <div class="cell-progress">
                <div class="cell-progress__nums">{{ redemptionProgressText(row) }}</div>
                <el-progress
                  :percentage="redemptionProgressPercent(row)"
                  :stroke-width="6"
                  :show-text="false"
                  :status="isRedemptionExhausted(row) ? 'success' : undefined"
                />
              </div>
            </template>
            <span
              v-else
              class="cell-progress-simple"
              :class="{ 'cell-progress-simple--done': row.redeemedCount > 0 }"
            >
              {{ redemptionProgressText(row) }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="96" align="center">
          <template #default="{ row }">
            <StatusTag
              :label="redemptionDisplayStatus(row).label"
              :tone="redemptionDisplayStatus(row).tone"
            />
          </template>
        </el-table-column>

        <el-table-column label="截止" width="108">
          <template #default="{ row }">
            <span class="cell-muted">
              {{ row.expiredTime ? formatTs(row.expiredTime).slice(0, 10) : '长期' }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="创建" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="cell-muted">
              {{ row.createdBy.displayName }} · {{ formatTs(row.createdTime).slice(0, 10) }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="120" fixed="right" align="center">
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              :icon="View"
              title="详情"
              @click.stop="openDetail(row)"
            />
            <el-button
              link
              type="primary"
              :icon="CopyDocument"
              title="复制激活码"
              @click.stop="copyText(row.key)"
            />
            <el-tooltip content="已有领取记录不可删除" :disabled="row.redeemedCount === 0">
              <el-button
                link
                type="danger"
                :icon="Delete"
                :disabled="row.redeemedCount > 0"
                @click.stop="removeRow(row)"
              />
            </el-tooltip>
          </template>
        </el-table-column>
      <template #empty>
        <EmptyState
          title="暂无激活码"
          description="点击「发布激活码」创建；活动码可多人领取，一次性码可批量生成。"
        />
      </template>
    </el-table>

    <template #footer>
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        background
        @current-change="fetchData()"
        @size-change="page = 1; fetchData()"
      />
    </template>
  </FillListPageLayout>

  <RedemptionCreateDrawer v-model:visible="createDrawerVisible" @created="onCreated" />

  <RedemptionCreateSuccessDialog
    v-if="successDialogVisible"
    v-model:visible="successDialogVisible"
    :keys="successKeys"
    :batch-name="successBatchName"
    @closed="onSuccessDialogClosed"
  />

  <RedemptionDetailDrawer
    v-if="detailSnapshot"
    :key="detailSnapshot.id"
    v-model:visible="detailVisible"
    :row="detailSnapshot"
    @closed="onDetailClosed"
    @remove="removeRow"
  />
</template>

<style scoped>
.table-toolbar__meta {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.table-toolbar__meta strong {
  color: var(--el-text-color-primary);
  font-weight: 600;
}

.cell-batch {
  display: flex;
  flex-direction: column;
  line-height: 1.35;
  gap: 4px;
}
.cell-batch__name {
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  font-weight: 600;
  color: var(--el-color-primary);
  text-align: left;
  cursor: pointer;
}
.cell-batch__name:hover {
  text-decoration: underline;
}
.cell-batch__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
.cell-batch__key {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  background: #f1f5f9;
  padding: 1px 6px;
  border-radius: 4px;
}

.cell-quota {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--el-color-success);
}

.cell-progress__nums {
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-regular);
  margin-bottom: 4px;
}
.cell-progress-simple {
  font-size: 13px;
  color: var(--el-text-color-placeholder);
}
.cell-progress-simple--done {
  color: var(--el-color-success);
  font-weight: 600;
}

.cell-muted {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.redemption-table :deep(.el-table__fixed-right-patch) {
  background: #f8fafc;
}
</style>
