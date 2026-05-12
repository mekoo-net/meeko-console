<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';

import { CircleCheck, Connection, Delete, Edit, Plus, RefreshLeft, Search } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

import PageHeader from '@/shared/ui/PageHeader.vue';
import StatusTag from '@/shared/ui/StatusTag.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import { formatDateTime, fromNow } from '@/shared/lib/date';
import { confirmDanger } from '@/shared/composables/useConfirm';

import {
  providerAutoDisabledCodeLabel,
  type CreateProviderInput,
  type ListProvidersFilter,
  type Provider,
  type UpdateProviderInput,
} from '../model/provider.types';
import {
  apiTypeValues,
  ApiTypeLabel,
  ProviderStatusLabel,
  ProviderStatusTone,
  providerStatusValues,
  type ApiType,
  type ProviderStatus,
} from '../model/enums';
import { getDemuxaiProviderPort } from '../services';
import ProviderEditDrawer from '../components/ProviderEditDrawer.vue';

const providerPort = getDemuxaiProviderPort();

const records = ref<Provider[]>([]);
const total = ref(0);
const loading = ref(false);

const page = ref(1);
const pageSize = ref(20);

interface PageFilter {
  keyword: string;
  apiType: ApiType | 'all';
  status: ProviderStatus | 'all';
}

const defaultFilter = (): PageFilter => ({
  keyword: '',
  apiType: 'all',
  status: 'all',
});

const filter = ref<PageFilter>(defaultFilter());

const drawerOpen = ref(false);
const drawerLoading = ref(false);
const editingProvider = ref<Provider | null>(null);

const testingUid = ref<string | null>(null);

function buildPortFilter(): ListProvidersFilter {
  return {
    keyword: filter.value.keyword.trim(),
    apiType: filter.value.apiType,
    status: filter.value.status,
  };
}

async function fetchData(): Promise<void> {
  loading.value = true;
  try {
    const r = await providerPort.list({
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
  () => [filter.value.apiType, filter.value.status, filter.value.keyword] as const,
  () => {
    page.value = 1;
    void fetchData();
  },
);

function resetFilter(): void {
  filter.value = defaultFilter();
  page.value = 1;
}

async function openCreate(): Promise<void> {
  editingProvider.value = null;
  drawerOpen.value = true;
}

async function openEdit(row: Provider): Promise<void> {
  editingProvider.value = row;
  drawerOpen.value = true;
}

async function onSubmit(payload: {
  create?: CreateProviderInput;
  update?: UpdateProviderInput;
}): Promise<void> {
  drawerLoading.value = true;
  try {
    if (payload.create) {
      const r = await providerPort.create(payload.create);
      if (r.success) {
        ElMessage.success('供应商已创建');
        drawerOpen.value = false;
        await fetchData();
      } else {
        ElMessage.error(r.error.message);
      }
      return;
    }
    if (payload.update && editingProvider.value) {
      const r = await providerPort.update(editingProvider.value.uid, payload.update);
      if (r.success) {
        ElMessage.success('已保存');
        drawerOpen.value = false;
        await fetchData();
      } else {
        ElMessage.error(r.error.message);
      }
    }
  } finally {
    drawerLoading.value = false;
  }
}

async function toggleStatus(row: Provider): Promise<void> {
  const isAuto = row.status === 'auto_disabled';
  if (isAuto) {
    const okp = await confirmDanger({
      title: '恢复自动停用供应商',
      message: `供应商 "${row.name}" 由调度因「${
        providerAutoDisabledCodeLabel[row.autoDisabledCode ?? ''] ?? row.autoDisabledCode ?? '未知'
      }」自动停用，确认人工恢复为启用吗？`,
      type: 'warning',
    });
    if (!okp) return;
  }
  const next: ProviderStatus = row.status === 'enabled' ? 'disabled' : 'enabled';
  const r = await providerPort.setStatus(row.uid, next);
  if (r.success) {
    ElMessage.success(`已${next === 'enabled' ? '启用' : '禁用'}`);
    await fetchData();
  } else {
    ElMessage.error(r.error.message);
  }
}

async function onDelete(row: Provider): Promise<void> {
  const orphans = computeDeletionOrphans(row);
  const orphanMsg =
    orphans.length > 0
      ? `\n\n以下平台模型 displayName 将随之被自动删除（不再被任何 mapping 引用）：\n  ${orphans.join('\n  ')}`
      : '';
  const okp = await confirmDanger({
    title: '删除供应商',
    message: `确认删除供应商 "${row.name}"？历史调用日志保留显示，该操作不可撤销。${orphanMsg}`,
    confirmText: '确认删除',
    type: 'warning',
  });
  if (!okp) return;
  const r = await providerPort.delete(row.uid);
  if (r.success) {
    ElMessage.success('已删除');
    await fetchData();
  } else {
    ElMessage.error(r.error.message);
  }
}

/** 给删除确认弹窗展示"将级联删除哪些平台 displayName" */
function computeDeletionOrphans(target: Provider): string[] {
  const referencedByOthers = new Set<string>();
  for (const p of records.value) {
    if (p.uid === target.uid) continue;
    for (const m of p.modelMappings) referencedByOthers.add(m.displayName);
  }
  const seen = new Set<string>();
  const orphans: string[] = [];
  for (const m of target.modelMappings) {
    if (referencedByOthers.has(m.displayName)) continue;
    if (seen.has(m.displayName)) continue;
    seen.add(m.displayName);
    orphans.push(m.displayName);
  }
  return orphans;
}

/** 把 mapping 解析成 `display → modelName` 字符串，便于在表格 tooltip 中展示 */
function describeMappings(p: Provider): Array<{ key: string; text: string }> {
  const pmIndex = new Map(p.providerModels.map((m) => [m.uid, m.modelName]));
  return p.modelMappings.map((m) => ({
    key: m.uid,
    text: `${m.displayName} → ${pmIndex.get(m.providerModelUid) ?? '(missing)'}`,
  }));
}

/** 行内不同 displayName 数量，作为 tag 主指标 */
function uniqueDisplayNames(p: Provider): number {
  const s = new Set<string>();
  for (const m of p.modelMappings) s.add(m.displayName);
  return s.size;
}

async function onTest(row: Provider): Promise<void> {
  testingUid.value = row.uid;
  try {
    const r = await providerPort.test(row.uid);
    if (!r.success) {
      ElMessage.error(r.error.message);
      return;
    }
    if (r.data.ok) {
      ElMessage.success(
        `连通正常 · ${r.data.latencyMs} ms · 上游可达 ${r.data.reachableModelNames.length} 模型`,
      );
    } else {
      ElMessage.error(`测试失败：${r.data.errorCode ?? 'unknown'} ${r.data.errorMessage ?? ''}`);
    }
    await fetchData();
  } finally {
    testingUid.value = null;
  }
}

function errorRateTone(rate?: number): 'success' | 'warning' | 'danger' {
  if (!rate || rate < 0.05) return 'success';
  if (rate < 0.2) return 'warning';
  return 'danger';
}

onMounted(() => {
  void fetchData();
});
</script>

<template>
  <div class="page">
    <PageHeader
      title="供应商"
      description="上游模型凭据。一个供应商 = 一组凭据 + 一种 apiType + 一组供应商模型 + 对外上架映射。连续错误自动停用，需人工恢复。"
    >
      <template #actions>
        <el-button :icon="Plus" type="primary" @click="openCreate">新建供应商</el-button>
      </template>
    </PageHeader>

    <el-card class="filter-card" shadow="never">
      <el-form inline @submit.prevent>
        <el-form-item label="搜索">
          <el-input
            v-model="filter.keyword"
            :prefix-icon="Search"
            placeholder="名称 / baseUrl"
            style="width: 240px"
            clearable
          />
        </el-form-item>
        <el-form-item label="协议类型">
          <el-select v-model="filter.apiType" style="width: 200px">
            <el-option label="全部" value="all" />
            <el-option
              v-for="p in apiTypeValues"
              :key="p"
              :label="ApiTypeLabel[p]"
              :value="p"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filter.status" style="width: 160px">
            <el-option label="全部" value="all" />
            <el-option
              v-for="s in providerStatusValues"
              :key="s"
              :label="ProviderStatusLabel[s]"
              :value="s"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button :icon="RefreshLeft" @click="resetFilter">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-table
      v-loading="loading"
      :data="records"
      row-key="uid"
      size="small"
      class="compact-table"
      :empty-text="' '"
    >
      <el-table-column label="名称" min-width="220">
        <template #default="{ row }: { row: Provider }">
          <div class="cell-name">
            <span class="cell-name__title">{{ row.name }}</span>
            <div class="cell-name__sub mono">{{ row.baseUrl }}</div>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="协议" width="140">
        <template #default="{ row }: { row: Provider }">
          <el-tag size="small" type="primary" effect="plain" round>
            {{ ApiTypeLabel[row.apiType] }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column label="模型 / 上架" width="130" align="center">
        <template #default="{ row }: { row: Provider }">
          <el-tooltip placement="top">
            <template #content>
              <div class="mono" style="max-width: 420px">
                <div v-if="row.modelMappings.length === 0">—</div>
                <div
                  v-for="entry in describeMappings(row)"
                  :key="entry.key"
                >
                  {{ entry.text }}
                </div>
              </div>
            </template>
            <span class="cell-routing">
              <span class="cell-routing__primary">
                {{ row.providerModels.length }} 模型
              </span>
              <span class="cell-routing__sub">
                {{ uniqueDisplayNames(row) }} 上架
              </span>
            </span>
          </el-tooltip>
        </template>
      </el-table-column>

      <el-table-column label="24h 调用" width="100" align="right">
        <template #default="{ row }: { row: Provider }">
          <span class="num">{{ (row.callCount24h ?? 0).toLocaleString() }}</span>
        </template>
      </el-table-column>

      <el-table-column label="24h 错误率" width="120" align="right">
        <template #default="{ row }: { row: Provider }">
          <StatusTag
            :label="`${((row.errorRate24h ?? 0) * 100).toFixed(2)}%`"
            :tone="errorRateTone(row.errorRate24h)"
          />
        </template>
      </el-table-column>

      <el-table-column label="状态" width="120">
        <template #default="{ row }: { row: Provider }">
          <StatusTag :label="ProviderStatusLabel[row.status]" :tone="ProviderStatusTone[row.status]" />
          <div v-if="row.status === 'auto_disabled' && row.autoDisabledCode" class="auto-reason">
            {{ providerAutoDisabledCodeLabel[row.autoDisabledCode] ?? row.autoDisabledCode }}
          </div>
        </template>
      </el-table-column>

      <el-table-column label="最近探测" width="140">
        <template #default="{ row }: { row: Provider }">
          <div v-if="row.testSucceededAtUtc" class="probe-cell">
            <div>{{ row.testLatencyMs }} ms</div>
            <div class="probe-cell__ago">{{ fromNow(row.testSucceededAtUtc) }}</div>
          </div>
          <span v-else class="cell-muted">—</span>
        </template>
      </el-table-column>

      <el-table-column label="更新时间" width="150">
        <template #default="{ row }: { row: Provider }">
          <span class="cell-date">{{ formatDateTime(row.updatedAtUtc) }}</span>
        </template>
      </el-table-column>

      <el-table-column label="操作" width="240" align="right" fixed="right">
        <template #default="{ row }: { row: Provider }">
          <el-button
            :icon="Connection"
            link
            type="primary"
            :loading="testingUid === row.uid"
            @click="onTest(row)"
          >
            测试
          </el-button>
          <el-button :icon="Edit" link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button
            :icon="CircleCheck"
            link
            :type="row.status === 'enabled' ? 'warning' : 'success'"
            @click="toggleStatus(row)"
          >
            {{ row.status === 'enabled' ? '禁用' : '启用' }}
          </el-button>
          <el-button :icon="Delete" link type="danger" @click="onDelete(row)">删除</el-button>
        </template>
      </el-table-column>

      <template #empty>
        <EmptyState
          title="暂无供应商"
          description="点击右上角「新建供应商」接入第一个上游模型供应商。"
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

    <ProviderEditDrawer
      v-model="drawerOpen"
      :provider="editingProvider"
      :loading="drawerLoading"
      @submit="onSubmit"
    />
  </div>
</template>

<style scoped>
.filter-card {
  margin-bottom: 14px;
  border-radius: 8px;
}
.filter-card :deep(.el-card__body) {
  padding: 14px 20px 0;
}
.cell-name__title {
  font-weight: 500;
  color: var(--el-text-color-primary);
}
.cell-name__sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
.mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}
.cell-routing {
  display: inline-flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.2;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}
.cell-routing__priority {
  font-weight: 600;
  color: var(--el-color-primary);
}
.cell-routing__weight {
  font-size: 11.5px;
  color: var(--el-text-color-secondary);
}
.cell-count {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  color: var(--el-color-primary);
  font-weight: 500;
  cursor: help;
}
.num {
  font-variant-numeric: tabular-nums;
}
.auto-reason {
  font-size: 11.5px;
  color: var(--el-color-danger);
  margin-top: 2px;
}
.probe-cell {
  font-size: 12.5px;
  line-height: 1.3;
}
.probe-cell__ago {
  font-size: 11.5px;
  color: var(--el-text-color-secondary);
}
.pagination-bar {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
