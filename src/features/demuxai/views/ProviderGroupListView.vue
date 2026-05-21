<script setup lang="ts">
/**
 * 供应商组：左右分栏主从布局（共享 provider 组件）。
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';

import { Delete, Edit, Plus, Refresh, Search } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

import PageHeader from '@/shared/ui/PageHeader.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import { fromNow } from '@/shared/lib/date';
import { confirmDanger } from '@/shared/composables/useConfirm';
import { clientPaginate, usePagination } from '@/shared/composables/usePagination';

import {
  ProviderCatalogSourceLabel,
  ProviderGroupLabel,
} from '../model/enums';
import type {
  CreateUpstreamModelInput,
  ProviderGroup,
  ProviderUpstreamModel,
} from '../model/catalog.types';
import type { ModelRoute } from '../model/modelRoute.types';
import { getDemuxaiCatalogPort, getDemuxaiModelRoutePort } from '../services';
import ProviderWorkspaceLayout from '../components/provider/ProviderWorkspaceLayout.vue';
import ProviderGroupSidebar from '../components/provider/ProviderGroupSidebar.vue';
import ProviderDetailPanel from '../components/provider/ProviderDetailPanel.vue';
import ProviderUpstreamModelAddDialog from '../components/ProviderUpstreamModelAddDialog.vue';
import ProviderUpstreamModelEditDrawer from '../components/ProviderUpstreamModelEditDrawer.vue';

const catalogPort = getDemuxaiCatalogPort();
const routePort = getDemuxaiModelRoutePort();

const groups = ref<ProviderGroup[]>([]);
const modelsByGroup = ref<Record<string, ProviderUpstreamModel[]>>({});
const routesByGroup = ref<Record<string, ModelRoute[]>>({});

const loading = ref(false);
const detailLoading = ref(false);
const syncing = ref(false);

const selectedQueueGroup = ref('');
const modelKeyword = ref('');

const lastSyncedAtUtc = ref<string | null>(null);
const autoSyncEnabled = ref(true);
const AUTO_SYNC_MS = 60_000;
let autoSyncTimer: ReturnType<typeof setInterval> | null = null;

const addModelDialogOpen = ref(false);
const addModelLoading = ref(false);
const modelDrawerOpen = ref(false);
const modelDrawerGroup = ref<ProviderGroup | null>(null);
const modelDrawerModel = ref<ProviderUpstreamModel | null>(null);

const modelPagination = usePagination({ initialPageSize: 20, pageSizes: [10, 20, 50, 100] });

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
      m.upstreamModelId.toLowerCase().includes(kw) ||
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

function groupLabel(queueGroup: string, displayName: string): string {
  return ProviderGroupLabel[queueGroup] ?? displayName;
}

function aliasCount(queueGroup: string, upstreamModelId: string): number {
  return (routesByGroup.value[queueGroup] ?? []).filter(
    (rt) => rt.upstreamModelId === upstreamModelId,
  ).length;
}

function routesForModel(queueGroup: string, upstreamModelId: string): ModelRoute[] {
  return (routesByGroup.value[queueGroup] ?? []).filter(
    (rt) => rt.upstreamModelId === upstreamModelId,
  );
}

function totalAliasCount(queueGroup: string): number {
  return (routesByGroup.value[queueGroup] ?? []).length;
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

async function loadRoutesForGroup(queueGroup: string): Promise<void> {
  const r = await routePort.list({
    page: 1,
    pageSize: 500,
    filter: { keyword: '', channelKey: queueGroup, status: 'all' },
  });
  if (r.success) {
    routesByGroup.value = { ...routesByGroup.value, [queueGroup]: r.data.items };
  }
}

async function refreshGroupDetail(queueGroup: string): Promise<void> {
  detailLoading.value = true;
  try {
    await Promise.all([loadModelsForGroup(queueGroup), loadRoutesForGroup(queueGroup)]);
  } finally {
    detailLoading.value = false;
  }
}

async function refreshSelectedDetail(): Promise<void> {
  const qg = selectedQueueGroup.value;
  if (qg) await refreshGroupDetail(qg);
}

async function runGatewaySync(opts?: { silent?: boolean }): Promise<boolean> {
  syncing.value = true;
  try {
    const r = await catalogPort.syncFromGateway();
    if (!r.success) {
      if (!opts?.silent) ElMessage.error(r.error.message);
      return false;
    }
    lastSyncedAtUtc.value = r.data.syncedAtUtc;
    modelsByGroup.value = {};
    routesByGroup.value = {};
    await fetchGroups({ silent: opts?.silent });
    await refreshSelectedDetail();
    if (!opts?.silent) {
      ElMessage.success(
        `已从网关同步 ${r.data.providerCount} 个供应商组、${r.data.modelCount} 个上游模型`,
      );
    }
    return true;
  } finally {
    syncing.value = false;
  }
}

function startAutoSyncTimer(): void {
  stopAutoSyncTimer();
  if (!autoSyncEnabled.value) return;
  autoSyncTimer = setInterval(() => {
    if (syncing.value || loading.value) return;
    void runGatewaySync({ silent: true });
  }, AUTO_SYNC_MS);
}

function stopAutoSyncTimer(): void {
  if (autoSyncTimer !== null) {
    clearInterval(autoSyncTimer);
    autoSyncTimer = null;
  }
}

function onAutoSyncToggle(enabled: boolean | string | number): void {
  autoSyncEnabled.value = Boolean(enabled);
  if (autoSyncEnabled.value) startAutoSyncTimer();
  else stopAutoSyncTimer();
}

function openAddModel(): void {
  if (!selectedGroup.value) return;
  addModelDialogOpen.value = true;
}

async function onAddModel(payload: CreateUpstreamModelInput): Promise<void> {
  addModelLoading.value = true;
  try {
    const r = await catalogPort.addUpstreamModel(payload);
    if (r.success) {
      ElMessage.success('已添加上游模型');
      addModelDialogOpen.value = false;
      await fetchGroups({ silent: true });
      await refreshGroupDetail(payload.queueGroup);
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    addModelLoading.value = false;
  }
}

function openEditModel(model: ProviderUpstreamModel): void {
  if (!selectedGroup.value) return;
  modelDrawerGroup.value = selectedGroup.value;
  modelDrawerModel.value = model;
  modelDrawerOpen.value = true;
}

async function onRemoveModel(model: ProviderUpstreamModel): Promise<void> {
  const group = selectedGroup.value;
  if (!group) return;
  const bound = routesForModel(group.queueGroup, model.upstreamModelId);
  if (bound.length > 0) {
    ElMessage.warning('请先在「编辑」中删除该模型的全部对外别名，再移除上游模型');
    return;
  }
  const okp = await confirmDanger({
    title: '删除上游模型',
    message: `确认从组「${group.displayName}」移除模型 ${model.upstreamModelId}？`,
    confirmText: '确认删除',
    type: 'warning',
  });
  if (!okp) return;
  const r = await catalogPort.removeUpstreamModel(group.queueGroup, model.upstreamModelId);
  if (r.success) {
    ElMessage.success('已删除');
    await fetchGroups({ silent: true });
    await refreshGroupDetail(group.queueGroup);
  } else {
    ElMessage.error(r.error.message);
  }
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
  await runGatewaySync({ silent: true });
  startAutoSyncTimer();
});

onUnmounted(() => {
  stopAutoSyncTimer();
});
</script>

<template>
  <ProviderWorkspaceLayout :loading="loading">
    <template #header>
      <PageHeader
        title="供应商组"
        description="供应商组仅来自网关注册（QueueGroup），不可手工新建。左侧选组，右侧管理上游模型与对外别名；定价在「模型定价」页维护。"
      >
        <template #actions>
          <span v-if="lastSyncedAtUtc" class="sync-hint">
            上次同步 {{ fromNow(lastSyncedAtUtc) }}
          </span>
          <el-switch
            :model-value="autoSyncEnabled"
            inline-prompt
            active-text="自动"
            inactive-text="手动"
            @change="onAutoSyncToggle"
          />
          <el-button :icon="Refresh" type="primary" :loading="syncing" @click="runGatewaySync()">
            立即同步
          </el-button>
        </template>
      </PageHeader>
    </template>

    <ProviderGroupSidebar
      v-model="selectedQueueGroup"
      :groups="groups"
      empty-description="点击「立即同步」从网关注册表拉取 Provider。"
    />

    <ProviderDetailPanel v-if="selectedGroup">
      <template #header>
        <div class="detail-header__main">
          <h2 class="provider-detail__title">
            {{ groupLabel(selectedGroup.queueGroup, selectedGroup.displayName) }}
          </h2>
          <p class="provider-detail__sub">{{ selectedGroup.queueGroup }}</p>
          <div class="provider-detail__stats">
            <span>{{ ProviderCatalogSourceLabel[selectedGroup.source] }}</span>
            <span>{{ selectedGroup.instanceCount }} 实例</span>
            <span>{{ selectedGroup.upstreamModelCount }} 上游模型</span>
            <span>{{ totalAliasCount(selectedGroup.queueGroup) }} 个别名</span>
            <span>同步 {{ fromNow(selectedGroup.syncedAtUtc) }}</span>
          </div>
        </div>
        <el-button type="primary" :icon="Plus" @click="openAddModel">添加上游模型</el-button>
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
          row-key="upstreamModelId"
          size="small"
          class="compact-table"
          height="100%"
          :empty-text="' '"
        >
          <el-table-column label="上游模型" min-width="260">
            <template #default="{ row: m }: { row: ProviderUpstreamModel }">
              <span class="mono model-id">{{ m.upstreamModelId }}</span>
              <span v-if="m.label && m.label !== m.upstreamModelId" class="model-label">
                {{ m.label }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="来源" width="96">
            <template #default="{ row: m }: { row: ProviderUpstreamModel }">
              <el-tag size="small" effect="plain" :type="m.source === 'gateway' ? 'info' : 'warning'">
                {{ ProviderCatalogSourceLabel[m.source] }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="别名数" width="80" align="center">
            <template #default="{ row: m }: { row: ProviderUpstreamModel }">
              <span class="num">{{ aliasCount(selectedGroup.queueGroup, m.upstreamModelId) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="140" align="right" fixed="right">
            <template #default="{ row: m }: { row: ProviderUpstreamModel }">
              <el-button :icon="Edit" link type="primary" @click="openEditModel(m)">编辑</el-button>
              <el-button
                v-if="m.source === 'manual'"
                :icon="Delete"
                link
                type="danger"
                @click="onRemoveModel(m)"
              >
                移除
              </el-button>
            </template>
          </el-table-column>
          <template #empty>
            <EmptyState
              :title="modelKeyword ? '无匹配模型' : '暂无上游模型'"
              :description="
                modelKeyword
                  ? '换个关键词，或清空搜索。'
                  : '网关注册模型会随同步出现；也可点击「添加上游模型」手工登记。'
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
          title="暂无供应商组"
          description="点击「立即同步」从网关注册表拉取 Provider。"
        />
      </template>
    </ProviderDetailPanel>

    <ProviderUpstreamModelAddDialog
      v-if="selectedGroup"
      v-model="addModelDialogOpen"
      :queue-group="selectedGroup.queueGroup"
      :display-name="selectedGroup.displayName"
      :loading="addModelLoading"
      @submit="onAddModel"
    />

    <ProviderUpstreamModelEditDrawer
      v-model="modelDrawerOpen"
      :group="modelDrawerGroup"
      :model="modelDrawerModel"
      :provider-groups="groups"
      @refresh="refreshSelectedDetail"
    />
  </ProviderWorkspaceLayout>
</template>

<style scoped>
.detail-header__main {
  flex: 1;
  min-width: 0;
}
.provider-detail__header {
  width: 100%;
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
.sync-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-right: 8px;
}
</style>
