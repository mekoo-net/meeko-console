<script setup lang="ts">
/**
 * 模型路由运营：对外别名 → 渠道 + 上游注册名。
 * 同一 alias 可多行（weight 分流）；配置将下发网关（后端待接）。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Delete, Edit, Plus, PriceTag, RefreshLeft, Search } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

import PageHeader from '@/shared/ui/PageHeader.vue';
import StatusTag from '@/shared/ui/StatusTag.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import { formatDateTime } from '@/shared/lib/date';
import { confirmDanger } from '@/shared/composables/useConfirm';

import {
  ProviderGroupLabel,
  modelRouteStatusValues,
  ModelRouteStatusLabel,
  ModelRouteStatusTone,
  type ModelRouteStatus,
} from '../model/enums';
import type {
  CreateModelRouteInput,
  ListModelRoutesFilter,
  ModelRoute,
  UpdateModelRouteInput,
} from '../model/modelRoute.types';
import type { ProviderGroup } from '../model/catalog.types';
import { getDemuxaiCatalogPort, getDemuxaiModelRoutePort } from '../services';
import ModelRouteEditDrawer from '../components/ModelRouteEditDrawer.vue';

const route = useRoute();
const router = useRouter();
const routePort = getDemuxaiModelRoutePort();
const catalogPort = getDemuxaiCatalogPort();

const records = ref<ModelRoute[]>([]);
const total = ref(0);
const loading = ref(false);
const providerGroups = ref<ProviderGroup[]>([]);

const page = ref(1);
const pageSize = ref(20);

interface PageFilter {
  keyword: string;
  channelKey: string | 'all';
  status: ModelRouteStatus | 'all';
}

const defaultFilter = (): PageFilter => ({
  keyword: '',
  channelKey: 'all',
  status: 'all',
});

const filter = ref<PageFilter>(defaultFilter());

const drawerOpen = ref(false);
const drawerLoading = ref(false);
const editingRoute = ref<ModelRoute | null>(null);

/** 当前页内按 alias 分组，用于展示「N 条路由」 */
const aliasGroupCount = computed(() => {
  const m = new Map<string, number>();
  for (const r of records.value) {
    m.set(r.alias, (m.get(r.alias) ?? 0) + 1);
  }
  return m;
});

function buildPortFilter(): ListModelRoutesFilter {
  return {
    keyword: filter.value.keyword.trim(),
    channelKey: filter.value.channelKey,
    status: filter.value.status,
  };
}

async function loadProviderGroups(): Promise<void> {
  const r = await catalogPort.listProviderGroups();
  if (r.success) providerGroups.value = r.data;
}

async function fetchData(): Promise<void> {
  loading.value = true;
  try {
    const r = await routePort.list({
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
  () => [filter.value.keyword, filter.value.channelKey, filter.value.status] as const,
  () => {
    page.value = 1;
    void fetchData();
  },
);

function resetFilter(): void {
  filter.value = defaultFilter();
  page.value = 1;
}

function channelLabel(key: string): string {
  return ProviderGroupLabel[key] ?? key;
}

function openCreate(): void {
  editingRoute.value = null;
  drawerOpen.value = true;
}

function openEdit(row: ModelRoute): void {
  editingRoute.value = row;
  drawerOpen.value = true;
}

async function onSubmit(payload: {
  create?: CreateModelRouteInput;
  update?: UpdateModelRouteInput;
}): Promise<void> {
  drawerLoading.value = true;
  try {
    if (payload.create) {
      const r = await routePort.create(payload.create);
      if (r.success) {
        ElMessage.success('模型路由已创建');
        drawerOpen.value = false;
        await fetchData();
      } else {
        ElMessage.error(r.error.message);
      }
      return;
    }
    if (payload.update && editingRoute.value) {
      const r = await routePort.update(editingRoute.value.uid, payload.update);
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

async function onDelete(row: ModelRoute): Promise<void> {
  const poolSize = aliasGroupCount.value.get(row.alias) ?? 1;
  const okp = await confirmDanger({
    title: '删除模型路由',
    message:
      poolSize > 1
        ? `确认删除别名「${row.alias}」的这条分流路由（上游 ${row.upstreamModelId}）？同别名仍有 ${poolSize - 1} 条路由。`
        : `确认删除别名「${row.alias}」？删除后该别名将不可用。`,
    confirmText: '确认删除',
    type: 'warning',
  });
  if (!okp) return;
  const r = await routePort.delete(row.uid);
  if (r.success) {
    ElMessage.success('已删除');
    await fetchData();
  } else {
    ElMessage.error(r.error.message);
  }
}

function jumpPricing(alias: string): void {
  void router.push({ name: 'demuxai-pricing', query: { keyword: alias } });
}

const initialChannelKey = computed(() => {
  const q = route.query.channel;
  return typeof q === 'string' ? q : undefined;
});

onMounted(async () => {
  if (initialChannelKey.value) {
    filter.value.channelKey = initialChannelKey.value;
  }
  await loadProviderGroups();
  await fetchData();
});
</script>

<template>
  <div class="page">
    <PageHeader
      title="模型路由"
      description="配置对外别名与上游注册名的映射。用户请求 model=别名 时，网关解析为 channel + upstream 并可按权重分流。保存后将由 DemuxAi 快照下发网关（API 待接）。"
    >
      <template #actions>
        <el-button :icon="Plus" type="primary" @click="openCreate">新建路由</el-button>
      </template>
    </PageHeader>

    <el-card class="filter-card" shadow="never">
      <el-form inline @submit.prevent>
        <el-form-item label="搜索">
          <el-input
            v-model="filter.keyword"
            :prefix-icon="Search"
            placeholder="别名 / 上游模型 / 渠道"
            style="width: 260px"
            clearable
          />
        </el-form-item>
        <el-form-item label="供应商组">
          <el-select v-model="filter.channelKey" style="width: 160px">
            <el-option label="全部" value="all" />
            <el-option
              v-for="ch in providerGroups"
              :key="ch.queueGroup"
              :label="channelLabel(ch.queueGroup)"
              :value="ch.queueGroup"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filter.status" style="width: 140px">
            <el-option label="全部" value="all" />
            <el-option
              v-for="s in modelRouteStatusValues"
              :key="s"
              :label="ModelRouteStatusLabel[s]"
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
      <el-table-column label="对外别名" min-width="180">
        <template #default="{ row }: { row: ModelRoute }">
          <div class="cell-alias">
            <span class="mono alias">{{ row.alias }}</span>
            <el-tag
              v-if="(aliasGroupCount.get(row.alias) ?? 0) > 1"
              size="small"
              type="warning"
              effect="plain"
              round
            >
              {{ aliasGroupCount.get(row.alias) }} 路分流
            </el-tag>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="供应商组" width="120">
        <template #default="{ row }: { row: ModelRoute }">
          <el-tag size="small" effect="plain">{{ channelLabel(row.channelKey) }}</el-tag>
        </template>
      </el-table-column>

      <el-table-column label="上游注册名" min-width="200">
        <template #default="{ row }: { row: ModelRoute }">
          <span class="mono upstream">{{ row.upstreamModelId }}</span>
        </template>
      </el-table-column>

      <el-table-column label="权重" width="80" align="center">
        <template #default="{ row }: { row: ModelRoute }">
          <span class="num">{{ row.weight }}</span>
        </template>
      </el-table-column>

      <el-table-column label="状态" width="100">
        <template #default="{ row }: { row: ModelRoute }">
          <StatusTag
            :label="ModelRouteStatusLabel[row.status]"
            :tone="ModelRouteStatusTone[row.status]"
          />
        </template>
      </el-table-column>

      <el-table-column label="更新" width="150">
        <template #default="{ row }: { row: ModelRoute }">
          <span class="cell-date">{{ formatDateTime(row.updatedAtUtc) }}</span>
        </template>
      </el-table-column>

      <el-table-column label="操作" width="220" align="right" fixed="right">
        <template #default="{ row }: { row: ModelRoute }">
          <el-button :icon="PriceTag" link type="primary" @click="jumpPricing(row.alias)">
            定价
          </el-button>
          <el-button :icon="Edit" link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button :icon="Delete" link type="danger" @click="onDelete(row)">删除</el-button>
        </template>
      </el-table-column>

      <template #empty>
        <EmptyState
          title="暂无模型路由"
          description="先在「上游渠道」同步目录，再为本页新建别名映射。"
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

    <ModelRouteEditDrawer
      v-model="drawerOpen"
      :route="editingRoute"
      :loading="drawerLoading"
      :provider-groups="providerGroups"
      :initial-channel-key="initialChannelKey"
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
.mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}
.cell-alias {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.alias {
  font-weight: 600;
  color: var(--el-color-primary);
}
.upstream {
  font-size: 12.5px;
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
