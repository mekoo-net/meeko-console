<script setup lang="ts">
/**
 * 供应商组（已接入）：列出 admin 导入的 QueueGroup + 上游模型 + 对外别名。
 *
 * 入库 / 模型添加由「接入供应商」页统一负责，此处只做：
 *  - 查看 / 搜索 / 分组浏览
 *  - 编辑某个上游模型的对外别名（ModelRoute）
 *  - 删除单模型 / 删除整组（被引用时拒绝）
 */
import { computed, onMounted, ref, watch } from 'vue';

import { Delete, Edit, Plus, Refresh, Search, Setting } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

import PageHeader from '@/shared/ui/PageHeader.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import { fromNow } from '@/shared/lib/date';
import { confirmDanger } from '@/shared/composables/useConfirm';
import { clientPaginate, usePagination } from '@/shared/composables/usePagination';

import { ProviderGroupLabel } from '@demux/common';
import type { ProviderGroup, ProviderUpstreamModel } from '../model/catalog.types';
import type { ModelRouteStats } from '../model/modelRoute.types';
import { getDemuxCatalogPort, getDemuxModelRoutePort } from '../services';
import ProviderWorkspaceLayout from '../components/provider/ProviderWorkspaceLayout.vue';
import ProviderGroupSidebar from '../components/provider/ProviderGroupSidebar.vue';
import ProviderDetailPanel from '../components/provider/ProviderDetailPanel.vue';
import ProviderUpstreamModelEditDrawer from '../components/ProviderUpstreamModelEditDrawer.vue';
import ProviderGroupEditDrawer from '../components/provider/ProviderGroupEditDrawer.vue';
import CatalogImportDialog from '../components/CatalogImportDialog.vue';
const catalogPort = getDemuxCatalogPort();
const routePort = getDemuxModelRoutePort();

const groups = ref<ProviderGroup[]>([]);
const modelsByGroup = ref<Record<string, ProviderUpstreamModel[]>>({});
const routeStatsByGroup = ref<Record<string, ModelRouteStats>>({});

const loading = ref(false);
const detailLoading = ref(false);

const selectedQueueGroup = ref('');
const modelKeyword = ref('');

const importDialogOpen = ref(false);

const modelDrawerOpen = ref(false);
const modelDrawerGroup = ref<ProviderGroup | null>(null);
const modelDrawerModel = ref<ProviderUpstreamModel | null>(null);

const groupEditOpen = ref(false);
const groupEditTarget = ref<ProviderGroup | null>(null);

const modelPagination = usePagination({ pageSize: 20, pageSizes: [10, 20, 50, 100] });

const selectedGroup = computed(() =>
  groups.value.find((g) => g.queueGroup === selectedQueueGroup.value) ?? null,
);

const currentModels = computed(() => {
  const qg = selectedQueueGroup.value;
  if (!qg) return [];
  const list = modelsByGroup.value[qg] ?? [];
  const kw = modelKeyword.value.trim().toLowerCase();
  if (!kw) return list;
  return list.filter(
    (m) =>
      m.vendorModel.toLowerCase().includes(kw) ||
      (m.label ?? '').toLowerCase().includes(kw),
  );
});

const pagedModels = computed(() =>
  clientPaginate(
    currentModels.value,
    modelPagination.state.page,
    modelPagination.state.pageSize,
  ),
);

watch(
  currentModels,
  (list) => {
    modelPagination.setTotal(list.length);
  },
  { immediate: true },
);

watch(modelKeyword, () => {
  modelPagination.setPage(1);
});

function groupLabel(queueGroup: string, vendorSlug?: string | null): string {
  const slug = vendorSlug?.trim();
  if (slug) return `${slug} · ${queueGroup}`;
  return ProviderGroupLabel[queueGroup] ?? queueGroup;
}

function aliasCount(queueGroup: string, vendorModel: string): number {
  return routeStatsByGroup.value[queueGroup]?.byVendorModel[vendorModel] ?? 0;
}

function totalAliasCount(queueGroup: string): number {
  return routeStatsByGroup.value[queueGroup]?.total ?? 0;
}

async function fetchGroups(opts?: { silent?: boolean }): Promise<void> {
  if (!opts?.silent) loading.value = true;
  try {
    const r = await catalogPort.listProviderGroups();
    if (!r.success) {
      if (!opts?.silent) ElMessage.error(r.error.message);
      return;
    }
    groups.value = r.data;
    ensureSelection();
  } finally {
    if (!opts?.silent) loading.value = false;
  }
}

function ensureSelection(): void {
  if (groups.value.length === 0) {
    selectedQueueGroup.value = '';
    return;
  }
  const still = groups.value.some((g) => g.queueGroup === selectedQueueGroup.value);
  if (!still) {
    selectedQueueGroup.value = groups.value[0]!.queueGroup;
  }
}

async function loadModelsForGroup(queueGroup: string): Promise<void> {
  const r = await catalogPort.listUpstreamModels(queueGroup);
  if (r.success) {
    modelsByGroup.value = { ...modelsByGroup.value, [queueGroup]: r.data };
  }
}

async function loadRouteStatsForGroup(queueGroup: string): Promise<void> {
  const r = await routePort.stats(queueGroup);
  if (r.success) {
    routeStatsByGroup.value = { ...routeStatsByGroup.value, [queueGroup]: r.data };
  }
}

async function refreshGroupDetail(queueGroup: string): Promise<void> {
  detailLoading.value = true;
  try {
    await Promise.all([loadModelsForGroup(queueGroup), loadRouteStatsForGroup(queueGroup)]);
  } finally {
    detailLoading.value = false;
  }
}

async function refreshSelectedDetail(): Promise<void> {
  const qg = selectedQueueGroup.value;
  if (qg) await refreshGroupDetail(qg);
}

function openEditModel(model: ProviderUpstreamModel): void {
  if (!selectedGroup.value) return;
  modelDrawerGroup.value = selectedGroup.value;
  modelDrawerModel.value = model;
  modelDrawerOpen.value = true;
}

function openEditGroup(group: ProviderGroup): void {
  groupEditTarget.value = group;
  groupEditOpen.value = true;
}

async function onRemoveModel(model: ProviderUpstreamModel): Promise<void> {
  const group = selectedGroup.value;
  if (!group) return;
  const aliasN = aliasCount(group.queueGroup, model.vendorModel);
  const aliasNote =
    aliasN > 0
      ? `该模型下的 ${aliasN} 个对外别名将一并删除。`
      : '';
  const okp = await confirmDanger({
    title: '删除上游模型',
    message: `确认从组「${groupLabel(group.queueGroup, group.vendorSlug)}」移除模型 ${model.vendorModel}？${aliasNote}删除后如需恢复，需通过「接入供应商」重新导入。`,
    confirmText: '确认删除',
    type: 'warning',
  });
  if (!okp) return;
  const r = await catalogPort.deleteUpstreamModel(group.queueGroup, model.id);
  if (r.success) {
    ElMessage.success('已删除');
    await fetchGroups({ silent: true });
    await refreshGroupDetail(group.queueGroup);
  } else {
    ElMessage.error(r.error.message);
  }
}

async function onRemoveGroup(): Promise<void> {
  const group = selectedGroup.value;
  if (!group) return;
  const aliasN = totalAliasCount(group.queueGroup);
  const modelN = group.upstreamModelCount;
  const parts: string[] = [];
  if (modelN > 0) parts.push(`${modelN} 个上游模型`);
  if (aliasN > 0) parts.push(`${aliasN} 个对外别名`);
  const cascadeNote = parts.length > 0 ? `将一并删除其下 ${parts.join(' 和 ')}。` : '';
  const okp = await confirmDanger({
    title: '删除供应商组',
    message: `确认删除供应商组「${groupLabel(group.queueGroup, group.vendorSlug)}」？${cascadeNote}此操作不可恢复，如需恢复请通过「接入供应商」重新导入。`,
    confirmText: '全部移除',
    type: 'warning',
  });
  if (!okp) return;
  const r = await catalogPort.deleteProviderGroup(group.id);
  if (r.success) {
    ElMessage.success('已删除');
    await fetchGroups();
    await refreshSelectedDetail();
  } else {
    ElMessage.error(r.error.message);
  }
}

function openImportDialog(): void {
  importDialogOpen.value = true;
}

async function onCatalogImported(): Promise<void> {
  await fetchGroups({ silent: true });
  await refreshSelectedDetail();
}

watch(selectedQueueGroup, (qg, prev) => {
  if (!qg || qg === prev) return;
  modelKeyword.value = '';
  modelPagination.setPage(1);
  if (modelsByGroup.value[qg] === undefined) {
    void refreshGroupDetail(qg);
  }
});

onMounted(async () => {
  await fetchGroups();
});
</script>

<template>
  <ProviderWorkspaceLayout :loading="loading">
    <template #header>
      <PageHeader
        title="供应商组"
        description="此处仅展示已接入的供应商组。新增 QueueGroup 或上游模型请去「接入供应商」从网关拉取。模型需在「模型定价」配价后方可被调用。未设置对外 slug 的组不会出现在公开定价。"
      >
        <template #actions>
          <el-button :icon="Refresh" plain :loading="loading" @click="fetchGroups()">
            刷新
          </el-button>
          <el-button type="primary" :icon="Plus" @click="openImportDialog">
            去接入
          </el-button>
        </template>
      </PageHeader>
    </template>

    <ProviderGroupSidebar
      v-model="selectedQueueGroup"
      :groups="groups"
      show-edit-button
      empty-title="尚未接入任何供应商组"
      empty-description="点击右上角「去接入」从 LLM 网关拉取并入库。"
      @edit="openEditGroup"
    />

    <ProviderDetailPanel v-if="selectedGroup">
      <template #header>
        <div class="detail-header__main">
          <h2 class="provider-detail__title">
            {{ groupLabel(selectedGroup.queueGroup, selectedGroup.vendorSlug) }}
          </h2>
          <p class="provider-detail__sub">{{ selectedGroup.queueGroup }}</p>
          <div class="provider-detail__stats">
            <span>{{ selectedGroup.upstreamModelCount }} 上游模型</span>
            <span>{{ totalAliasCount(selectedGroup.queueGroup) }} 个别名</span>
            <span>入库于 {{ fromNow(selectedGroup.importedAtUtc) }}</span>
          </div>
        </div>
        <div class="detail-actions">
          <el-button :icon="Setting" plain @click="openEditGroup(selectedGroup)">
            编辑通道 slug
          </el-button>
          <el-button :icon="Plus" plain @click="openImportDialog">补充模型</el-button>
          <el-button :icon="Delete" type="danger" plain @click="onRemoveGroup">
            删除供应商组
          </el-button>
        </div>
      </template>

      <template #toolbar>
        <el-input
          v-model="modelKeyword"
          :prefix-icon="Search"
          placeholder="搜索上游模型 ID / 显示名"
          clearable
          style="max-width: 320px"
        />
      </template>

      <div class="provider-detail__table-wrap">
        <el-table
          v-loading="detailLoading"
          :data="pagedModels"
          row-key="id"
          size="small"
          class="compact-table"
          height="100%"
          :empty-text="' '"
        >
          <el-table-column label="上游模型" min-width="260">
            <template #default="{ row: m }: { row: ProviderUpstreamModel }">
              <span class="mono model-id">{{ m.vendorModel }}</span>
              <span v-if="m.label && m.label !== m.vendorModel" class="model-label">
                {{ m.label }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="别名数" width="100" align="center">
            <template #default="{ row: m }: { row: ProviderUpstreamModel }">
              <span class="num">{{ aliasCount(selectedGroup.queueGroup, m.vendorModel) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="160" align="right" fixed="right">
            <template #default="{ row: m }: { row: ProviderUpstreamModel }">
              <el-button :icon="Edit" link type="primary" @click="openEditModel(m)">编辑</el-button>
              <el-button :icon="Delete" link type="danger" @click="onRemoveModel(m)">移除</el-button>
            </template>
          </el-table-column>
          <template #empty>
            <EmptyState
              :title="modelKeyword ? '无匹配模型' : '该供应商组下暂无上游模型'"
              :description="
                modelKeyword
                  ? '换个关键词，或清空搜索。'
                  : '点击右上角「补充模型」从网关拉取并选择导入。'
              "
            />
          </template>
        </el-table>
      </div>
      <div class="provider-pagination">
        <el-pagination
          v-model:current-page="modelPagination.state.page"
          v-model:page-size="modelPagination.state.pageSize"
          :total="modelPagination.state.total"
          :page-sizes="modelPagination.pageSizes"
          layout="total, sizes, prev, pager, next"
          background
        />
      </div>
    </ProviderDetailPanel>

    <ProviderDetailPanel v-else show-placeholder>
      <template #placeholder>
        <EmptyState
          title="尚未接入任何供应商组"
          description="点击右上角「去接入」从 LLM 网关拉取并入库。"
        >
          <el-button type="primary" :icon="Plus" @click="openImportDialog">去接入</el-button>
        </EmptyState>
      </template>
    </ProviderDetailPanel>

    <ProviderUpstreamModelEditDrawer
      v-model="modelDrawerOpen"
      :group="modelDrawerGroup"
      :model="modelDrawerModel"
      :provider-groups="groups"
      @refresh="refreshSelectedDetail"
    />

    <ProviderGroupEditDrawer
      v-model="groupEditOpen"
      :group="groupEditTarget"
      @refresh="fetchGroups({ silent: true })"
    />

    <CatalogImportDialog v-model="importDialogOpen" @imported="onCatalogImported" />
  </ProviderWorkspaceLayout>
</template>

<style scoped>
.detail-header__main {
  flex: 1;
  min-width: 0;
}
.detail-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}
.model-id {
  font-weight: 500;
}
.model-label {
  display: block;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
.num {
  font-variant-numeric: tabular-nums;
}
</style>
