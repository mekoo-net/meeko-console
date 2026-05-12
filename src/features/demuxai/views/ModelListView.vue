<script setup lang="ts">
/**
 * 平台模型列表页 —— **元数据编辑器**。
 *
 * 关键差异于"渠道时代"：
 *  - 没有「新建模型」按钮：模型由 `provider_model_mappings.display_name` 自动创建
 *  - 没有「删除模型」按钮：reconcile 在最后一条 mapping 消失时自动删除
 *  - 没有「启用 / 下架」开关：停用一律在 Provider 层操作（mapping.enabled）
 *  - 行内仅 **编辑** 按钮，调出"元数据编辑抽屉"
 *
 * 「承载于」列反向派生：从 providers.modelMappings × providerModels 汇总到
 *   displayName → [{ providerName, modelName, weight, enabled }]
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { Edit, RefreshLeft, Search } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

import PageHeader from '@/shared/ui/PageHeader.vue';
import StatusTag from '@/shared/ui/StatusTag.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import { formatDateTime } from '@/shared/lib/date';

import {
  modelCapabilityValues,
  ModelCapabilityLabel,
  modelFamilyValues,
  ModelFamilyLabel,
  type ModelCapability,
  type ModelFamily,
} from '../model/enums';
import type { ListModelsFilter, Model, UpdateModelInput } from '../model/model.types';
import type { Provider } from '../model/provider.types';
import { getDemuxaiModelPort, getDemuxaiProviderPort } from '../services';
import ModelEditDrawer from '../components/ModelEditDrawer.vue';

const router = useRouter();
const modelPort = getDemuxaiModelPort();
const providerPort = getDemuxaiProviderPort();

const records = ref<Model[]>([]);
const total = ref(0);
const loading = ref(false);

const page = ref(1);
const pageSize = ref(20);

interface PageFilter {
  keyword: string;
  family: ModelFamily | 'all';
  capability: ModelCapability | 'all';
}

const defaultFilter = (): PageFilter => ({
  keyword: '',
  family: 'all',
  capability: 'all',
});

const filter = ref<PageFilter>(defaultFilter());

const drawerOpen = ref(false);
const drawerLoading = ref(false);
const editingModel = ref<Model | null>(null);

const providers = ref<Provider[]>([]);

interface CarriedByEntry {
  providerUid: string;
  providerName: string;
  /** 上游 model 技术名（= provider_model.model_name） */
  modelName: string;
  /** 与同 displayName 多路映射时的加权；缺失视为 100 */
  mappingWeight: number;
  enabled: boolean;
}

/** displayName → 承载列表（反向派生于 provider.modelMappings + providerModels） */
const carriedByMap = computed(() => {
  const m = new Map<string, CarriedByEntry[]>();
  for (const p of providers.value) {
    const pmIndex = new Map(p.providerModels.map((x) => [x.uid, x]));
    for (const mp of p.modelMappings) {
      const pmRef = pmIndex.get(mp.providerModelUid);
      if (!pmRef) continue;
      const list = m.get(mp.displayName) ?? [];
      list.push({
        providerUid: p.uid,
        providerName: p.name,
        modelName: pmRef.modelName,
        mappingWeight: mp.mappingWeight ?? 100,
        enabled: mp.enabled,
      });
      m.set(mp.displayName, list);
    }
  }
  return m;
});

const editingCarriedBy = computed<CarriedByEntry[]>(() =>
  editingModel.value ? carriedByMap.value.get(editingModel.value.modelId) ?? [] : [],
);

function buildPortFilter(): ListModelsFilter {
  return {
    keyword: filter.value.keyword.trim(),
    family: filter.value.family,
    capability: filter.value.capability,
  };
}

async function loadProviders(): Promise<void> {
  const r = await providerPort.list({
    page: 1,
    pageSize: 200,
    filter: { keyword: '', apiType: 'all', status: 'all' },
  });
  if (r.success) providers.value = r.data.items;
}

async function fetchData(): Promise<void> {
  loading.value = true;
  try {
    const r = await modelPort.list({
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
  () => [filter.value.keyword, filter.value.family, filter.value.capability] as const,
  () => {
    page.value = 1;
    void fetchData();
  },
);

function resetFilter(): void {
  filter.value = defaultFilter();
  page.value = 1;
}

function openEdit(row: Model): void {
  editingModel.value = row;
  drawerOpen.value = true;
}

async function onSubmit(payload: { update: UpdateModelInput }): Promise<void> {
  if (!editingModel.value) return;
  drawerLoading.value = true;
  try {
    const r = await modelPort.update(editingModel.value.uid, payload.update);
    if (r.success) {
      ElMessage.success('已保存');
      drawerOpen.value = false;
      await fetchData();
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    drawerLoading.value = false;
  }
}

function jumpToProvider(providerUid: string): void {
  drawerOpen.value = false;
  void router.push({
    name: 'demuxai-providers',
    query: { focus: providerUid },
  });
}

onMounted(() => {
  void loadProviders();
  void fetchData();
});
</script>

<template>
  <div class="page">
    <PageHeader
      title="模型列表"
      description="平台对外暴露的模型条目。modelId 是计费 / 配额主键，**由 Provider 映射自动创建与删除**；本页只能编辑展示名、家族、能力、可见 LV 等元数据。"
    />

    <el-card class="filter-card" shadow="never">
      <el-form inline @submit.prevent>
        <el-form-item label="搜索">
          <el-input
            v-model="filter.keyword"
            :prefix-icon="Search"
            placeholder="modelId / 展示名"
            style="width: 240px"
            clearable
          />
        </el-form-item>
        <el-form-item label="模型族">
          <el-select v-model="filter.family" style="width: 160px">
            <el-option label="全部" value="all" />
            <el-option
              v-for="f in modelFamilyValues"
              :key="f"
              :label="ModelFamilyLabel[f]"
              :value="f"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="能力">
          <el-select v-model="filter.capability" style="width: 160px">
            <el-option label="全部" value="all" />
            <el-option
              v-for="c in modelCapabilityValues"
              :key="c"
              :label="ModelCapabilityLabel[c]"
              :value="c"
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
      <el-table-column label="模型" min-width="280">
        <template #default="{ row }: { row: Model }">
          <div class="cell-model">
            <div class="cell-model__title">
              <span class="cell-model__name">{{ row.displayName }}</span>
            </div>
            <div class="cell-model__id">{{ row.modelId }}</div>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="族" width="110">
        <template #default="{ row }: { row: Model }">
          <el-tag size="small" type="info" effect="plain" round>
            {{ ModelFamilyLabel[row.family] }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column label="能力" min-width="220">
        <template #default="{ row }: { row: Model }">
          <div class="cell-caps">
            <el-tag
              v-for="c in row.capabilities"
              :key="c"
              size="small"
              type="info"
              effect="plain"
            >
              {{ ModelCapabilityLabel[c] }}
            </el-tag>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="上下文" width="100" align="right">
        <template #default="{ row }: { row: Model }">
          <span class="num">{{ (row.maxContextTokens / 1000).toFixed(0) }}K</span>
        </template>
      </el-table-column>

      <el-table-column label="最低 LV" width="90" align="center">
        <template #default="{ row }: { row: Model }">
          <StatusTag :label="`Lv${row.visibleMinTier}`" tone="info" />
        </template>
      </el-table-column>

      <el-table-column label="承载于" width="120">
        <template #default="{ row }: { row: Model }">
          <el-tooltip placement="top">
            <template #content>
              <div style="max-width: 420px">
                <div
                  v-for="entry in carriedByMap.get(row.modelId) ?? []"
                  :key="`${entry.providerUid}|${entry.modelName}`"
                >
                  {{ entry.providerName }} ← {{ entry.modelName }}
                  <span v-if="!entry.enabled">（已停用）</span>
                  <span v-else-if="entry.mappingWeight !== 100">
                    · w{{ entry.mappingWeight }}
                  </span>
                </div>
                <div v-if="(carriedByMap.get(row.modelId) ?? []).length === 0">—</div>
              </div>
            </template>
            <span
              class="cell-count"
              :class="{ 'cell-count--zero': (carriedByMap.get(row.modelId) ?? []).length === 0 }"
            >
              {{ (carriedByMap.get(row.modelId) ?? []).length }} 个
            </span>
          </el-tooltip>
        </template>
      </el-table-column>

      <el-table-column label="更新时间" width="150">
        <template #default="{ row }: { row: Model }">
          <span class="cell-date">{{ formatDateTime(row.updatedAtUtc) }}</span>
        </template>
      </el-table-column>

      <el-table-column label="操作" width="100" align="right" fixed="right">
        <template #default="{ row }: { row: Model }">
          <el-button :icon="Edit" link type="primary" @click="openEdit(row)">编辑</el-button>
        </template>
      </el-table-column>

      <template #empty>
        <EmptyState
          title="暂无模型"
          description="模型由 Provider 映射自动创建。请先到「供应商」页配置上游凭据并新增模型映射。"
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

    <ModelEditDrawer
      v-model="drawerOpen"
      :model="editingModel"
      :loading="drawerLoading"
      :carried-by="editingCarriedBy"
      @submit="onSubmit"
      @jump-to-provider="jumpToProvider"
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
.cell-model__title {
  display: flex;
  align-items: center;
  gap: 6px;
}
.cell-model__name {
  font-weight: 500;
  color: var(--el-text-color-primary);
}
.cell-model__id {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
.cell-caps {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.cell-count {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  color: var(--el-color-primary);
  font-weight: 500;
  cursor: help;
}
.cell-count--zero {
  color: var(--el-color-danger);
}
.num {
  font-variant-numeric: tabular-nums;
}
.pagination-bar {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
