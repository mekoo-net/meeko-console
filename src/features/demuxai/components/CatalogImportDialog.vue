<script setup lang="ts">
/**
 * 接入供应商弹窗：
 *  1. 打开时从 LLM 网关拉取 QueueGroup + 上游模型
 *  2. 左栏选组、右栏勾选要导入的上游模型
 *  3. 入库后不关闭弹窗，可继续接入其它组
 */
import { computed, reactive, ref, watch } from 'vue';

import { Check, CircleCheck, Download, Refresh, Search } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

import EmptyState from '@/shared/ui/EmptyState.vue';
import { formatDateTime } from '@/shared/lib/date';

import { ProviderGroupLabel } from '../model/enums';
import type {
  DiscoverCatalogResult,
  DiscoveredProviderGroup,
  DiscoveredUpstreamModel,
  ImportProviderGroupInput,
} from '../model/catalog.types';
import { getDemuxaiCatalogPort } from '../services';
import ProviderDetailPanel from './provider/ProviderDetailPanel.vue';
import './provider/providerWorkspace.css';

interface Props {
  modelValue: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'imported'): void;
}>();

const catalogPort = getDemuxaiCatalogPort();

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const discovering = ref(false);
const importing = ref(false);
const discoveredAtUtc = ref<number | null>(null);

const groups = ref<DiscoveredProviderGroup[]>([]);

const selectedQueueGroup = ref<string>('');
const groupKeyword = ref('');
const modelKeyword = ref('');

/** key = `${queueGroup}::${vendorModel}` */
const checkedModels = reactive<Record<string, boolean>>({});
/** 各组的对外通道 slug（可在右栏编辑，如 nai / pa） */
const groupVendorSlugs = reactive<Record<string, string>>({});

const filteredGroups = computed(() => {
  let list = groups.value;
  const kw = groupKeyword.value.trim().toLowerCase();
  if (kw) {
    list = list.filter(
      (g) =>
        g.queueGroup.toLowerCase().includes(kw) ||
        g.displayName.toLowerCase().includes(kw) ||
        (ProviderGroupLabel[g.queueGroup] ?? '').toLowerCase().includes(kw),
    );
  }
  return list;
});

const selectedGroup = computed(
  () => groups.value.find((g) => g.queueGroup === selectedQueueGroup.value) ?? null,
);

const visibleModels = computed<DiscoveredUpstreamModel[]>(() => {
  const g = selectedGroup.value;
  if (!g) return [];
  let list = g.models;
  const kw = modelKeyword.value.trim().toLowerCase();
  if (kw) {
    list = list.filter((m) => m.vendorModel.toLowerCase().includes(kw));
  }
  return list;
});

const selectedModelCount = computed(() => {
  const g = selectedGroup.value;
  if (!g) return 0;
  return g.models.reduce((acc, m) => acc + (isChecked(g.queueGroup, m.vendorModel) ? 1 : 0), 0);
});

const pendingModelCount = computed(() => {
  const g = selectedGroup.value;
  if (!g) return 0;
  return g.models.filter((m) => !m.alreadyImported).length;
});

function groupLabel(queueGroup: string, vendorSlug?: string | null): string {
  const slug = vendorSlug?.trim();
  if (slug) return slug;
  return ProviderGroupLabel[queueGroup] ?? queueGroup;
}

function checkboxKey(queueGroup: string, vendorModel: string): string {
  return `${queueGroup}::${vendorModel}`;
}

function isChecked(queueGroup: string, vendorModel: string): boolean {
  return Boolean(checkedModels[checkboxKey(queueGroup, vendorModel)]);
}

function toggleChecked(queueGroup: string, vendorModel: string, v: boolean): void {
  checkedModels[checkboxKey(queueGroup, vendorModel)] = v;
}

function selectAllPending(): void {
  const g = selectedGroup.value;
  if (!g) return;
  for (const m of g.models) {
    if (m.alreadyImported) continue;
    checkedModels[checkboxKey(g.queueGroup, m.vendorModel)] = true;
  }
}

function clearSelection(): void {
  const g = selectedGroup.value;
  if (!g) return;
  for (const m of g.models) {
    delete checkedModels[checkboxKey(g.queueGroup, m.vendorModel)];
  }
}

function ensureSelection(): void {
  const list = filteredGroups.value;
  if (list.length === 0) {
    selectedQueueGroup.value = '';
    return;
  }
  const still = list.some((g) => g.queueGroup === selectedQueueGroup.value);
  if (!still) selectedQueueGroup.value = list[0]!.queueGroup;
}

async function runDiscover(opts?: { silent?: boolean }): Promise<void> {
  discovering.value = true;
  try {
    const r = await catalogPort.discoverFromGateway();
    if (!r.success) {
      if (!opts?.silent) ElMessage.error(r.error.message);
      return;
    }
    applyDiscovery(r.data);
    if (!opts?.silent) {
      const total = r.data.groups.reduce((acc, g) => acc + g.models.length, 0);
      ElMessage.success(`已从网关拉取 ${r.data.groups.length} 个 QueueGroup、${total} 个上游模型`);
    }
  } finally {
    discovering.value = false;
  }
}

function applyDiscovery(payload: DiscoverCatalogResult): void {
  groups.value = payload.groups;
  discoveredAtUtc.value = payload.discoveredAtUtc;
  for (const g of payload.groups) {
    if (!(g.queueGroup in groupVendorSlugs)) {
      groupVendorSlugs[g.queueGroup] = '';
    }
  }
  ensureSelection();
}

async function onImport(): Promise<void> {
  const g = selectedGroup.value;
  if (!g) return;
  const models = g.models.filter((m) => isChecked(g.queueGroup, m.vendorModel));
  if (models.length === 0) {
    ElMessage.warning('请先勾选要入库的上游模型');
    return;
  }
  const vendorSlug = (groupVendorSlugs[g.queueGroup] || '').trim() || null;
  const payload: ImportProviderGroupInput = {
    queueGroup: g.queueGroup,
    vendorSlug,
    models: models.map((m) => ({ vendorModel: m.vendorModel })),
  };
  importing.value = true;
  try {
    const r = await catalogPort.importProviderGroup(payload);
    if (!r.success) {
      ElMessage.error(r.error.message);
      return;
    }
    ElMessage.success(
      r.data.importedModelCount > 0
        ? `已入库 ${r.data.importedModelCount} 个上游模型（QueueGroup：${r.data.queueGroup}）`
        : `供应商组「${r.data.queueGroup}」已是最新，无新增模型`,
    );
    clearSelection();
    await runDiscover({ silent: true });
    emit('imported');
  } finally {
    importing.value = false;
  }
}

function resetLocalState(): void {
  groups.value = [];
  discoveredAtUtc.value = null;
  selectedQueueGroup.value = '';
  groupKeyword.value = '';
  modelKeyword.value = '';
  for (const key of Object.keys(checkedModels)) {
    delete checkedModels[key];
  }
  for (const key of Object.keys(groupVendorSlugs)) {
    delete groupVendorSlugs[key];
  }
}

watch(filteredGroups, () => {
  ensureSelection();
});

watch(selectedQueueGroup, () => {
  modelKeyword.value = '';
});

watch(visible, (open) => {
  if (open) {
    void runDiscover({ silent: true });
  } else {
    resetLocalState();
  }
});
</script>

<template>
  <el-dialog
    v-model="visible"
    title="接入供应商"
    class="catalog-import-dialog"
    width="min(1200px, 96vw)"
    top="4vh"
    :close-on-click-modal="false"
    destroy-on-close
    append-to-body
  >
    <p class="catalog-import-dialog__desc">
      从 LLM 网关拉取当前可服务的 QueueGroup 与上游模型，勾选后入库；入库后可在本页继续接入其它组。
    </p>

    <div class="catalog-import-dialog__actions">
      <span v-if="discoveredAtUtc" class="catalog-import-dialog__meta">
        上次拉取：{{ formatDateTime(discoveredAtUtc) }}
      </span>
      <el-button
        type="primary"
        :icon="Refresh"
        :loading="discovering"
        @click="runDiscover()"
      >
        重新拉取
      </el-button>
    </div>

    <div
      v-loading="discovering && groups.length === 0"
      class="catalog-import-dialog__workspace"
    >
      <aside class="provider-sidebar">
        <div class="provider-sidebar__toolbar import-toolbar">
          <el-input
            v-model="groupKeyword"
            :prefix-icon="Search"
            placeholder="搜索 QueueGroup / 展示名"
            clearable
            size="small"
          />
        </div>

        <div v-if="filteredGroups.length > 0" class="provider-sidebar__list">
          <button
            v-for="g in filteredGroups"
            :key="g.queueGroup"
            type="button"
            class="provider-sidebar__item"
            :class="{ 'provider-sidebar__item--active': selectedQueueGroup === g.queueGroup }"
            @click="selectedQueueGroup = g.queueGroup"
          >
            <div class="provider-sidebar__item-head">
              <span class="provider-sidebar__item-title">
                {{ groupLabel(g.queueGroup) }}
              </span>
              <el-tag
                v-if="g.alreadyImported"
                size="small"
                effect="plain"
                type="success"
              >
                已入库
              </el-tag>
              <el-tag v-else size="small" effect="plain" type="warning">
                未入库
              </el-tag>
            </div>
            <span class="provider-sidebar__item-qg">{{ g.queueGroup }}</span>
            <div class="provider-sidebar__item-meta">
              <span>{{ g.models.length }} 上游模型</span>
              <span>
                新增 {{ g.models.filter((m) => !m.alreadyImported).length }}
              </span>
            </div>
          </button>
        </div>
        <EmptyState
          v-else-if="!discovering"
          :title="groupKeyword ? '无匹配 QueueGroup' : '尚未从网关拉取数据'"
          description="点击「重新拉取」从 LLM 网关获取清单。"
          class="provider-sidebar__empty"
        />
      </aside>

      <ProviderDetailPanel v-if="selectedGroup">
        <template #header>
          <div class="detail-header__main">
            <h2 class="provider-detail__title">
              {{ groupLabel(selectedGroup.queueGroup, selectedGroup.displayName) }}
            </h2>
            <p class="provider-detail__sub">{{ selectedGroup.queueGroup }}</p>
            <div class="provider-detail__stats">
              <span>{{ selectedGroup.models.length }} 个上游模型</span>
              <span>待入库 {{ pendingModelCount }}</span>
              <span>已勾选 {{ selectedModelCount }}</span>
            </div>
          </div>
          <div class="detail-actions">
            <el-button :icon="Check" plain @click="selectAllPending">
              勾选全部未入库
            </el-button>
            <el-button plain :disabled="selectedModelCount === 0" @click="clearSelection">
              清空勾选
            </el-button>
            <el-button
              type="primary"
              :icon="Download"
              :loading="importing"
              :disabled="selectedModelCount === 0"
              @click="onImport"
            >
              创建并继续 ({{ selectedModelCount }})
            </el-button>
          </div>
        </template>

        <template #toolbar>
          <div class="import-detail-toolbar">
            <el-input
              v-model="groupVendorSlugs[selectedGroup.queueGroup]"
              placeholder="对外通道 slug（如 nai / pa / rong）"
              style="max-width: 280px"
            />
            <el-input
              v-model="modelKeyword"
              :prefix-icon="Search"
              placeholder="搜索上游模型 ID"
              clearable
              style="max-width: 320px"
            />
          </div>
        </template>

        <div class="provider-detail__table-wrap">
          <el-table
            :data="visibleModels"
            row-key="vendorModel"
            size="small"
            class="compact-table"
            height="100%"
            :empty-text="' '"
          >
            <el-table-column label="" width="48" align="center">
              <template #default="{ row: m }: { row: DiscoveredUpstreamModel }">
                <el-checkbox
                  :model-value="isChecked(selectedQueueGroup, m.vendorModel)"
                  :disabled="m.alreadyImported"
                  @change="(v) => toggleChecked(selectedQueueGroup, m.vendorModel, Boolean(v))"
                />
              </template>
            </el-table-column>
            <el-table-column label="上游模型" min-width="280">
              <template #default="{ row: m }: { row: DiscoveredUpstreamModel }">
                <span class="mono model-id">{{ m.vendorModel }}</span>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="120">
              <template #default="{ row: m }: { row: DiscoveredUpstreamModel }">
                <el-tag
                  v-if="m.alreadyImported"
                  size="small"
                  effect="plain"
                  type="success"
                >
                  <el-icon><CircleCheck /></el-icon>
                  已入库
                </el-tag>
                <el-tag v-else size="small" effect="plain" type="info">待入库</el-tag>
              </template>
            </el-table-column>
            <template #empty>
              <EmptyState
                :title="modelKeyword ? '无匹配模型' : '该 QueueGroup 暂无上游模型'"
                :description="modelKeyword ? '换个关键词或清空搜索。' : '网关此刻报告为空，可换组或重新拉取。'"
              />
            </template>
          </el-table>
        </div>
      </ProviderDetailPanel>

      <ProviderDetailPanel v-else show-placeholder>
        <template #placeholder>
          <EmptyState
            title="选择左侧 QueueGroup 开始接入"
            description="点击左栏一个供应商组，右侧勾选要入库的上游模型；可连续操作多组。"
          />
        </template>
      </ProviderDetailPanel>
    </div>
  </el-dialog>
</template>

<style scoped>
.catalog-import-dialog__desc {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}
.catalog-import-dialog__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  margin-bottom: 12px;
}
.catalog-import-dialog__meta {
  margin-right: auto;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.catalog-import-dialog__workspace {
  display: flex;
  gap: 16px;
  align-items: stretch;
  height: min(68vh, 640px);
  min-height: 420px;
}
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
.import-toolbar {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.filter-radio {
  align-self: stretch;
}
.filter-radio :deep(.el-radio-button) {
  flex: 1;
}
.filter-radio :deep(.el-radio-button__inner) {
  width: 100%;
}
.import-detail-toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
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
</style>

<style>
.catalog-import-dialog .el-dialog__body {
  padding-top: 8px;
}
</style>
