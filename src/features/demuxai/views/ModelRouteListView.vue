<script setup lang="ts">
/**
 * 模型别名绑定运营：对外别名 → 渠道 + 上游注册名。
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

import { ProviderGroupLabel, publishedLabel, publishedTone } from '@demux/common';
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
  vendorKey: string | 'all';
  isPublished: boolean | 'all';
}

const defaultFilter = (): PageFilter => ({
  keyword: '',
  vendorKey: 'all',
  isPublished: 'all',
});

const filter = ref<PageFilter>(defaultFilter());

const drawerOpen = ref(false);
const drawerLoading = ref(false);
const editingRoute = ref<ModelRoute | null>(null);

const publishFilterOptions: { label: string; value: boolean | 'all' }[] = [
  { label: '全部', value: 'all' },
  { label: '已上线', value: true },
  { label: '已下线', value: false },
];

function buildPortFilter(): ListModelRoutesFilter {
  return {
    keyword: filter.value.keyword.trim(),
    vendorKey: filter.value.vendorKey,
    isPublished: filter.value.isPublished,
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
  () => [filter.value.keyword, filter.value.vendorKey, filter.value.isPublished] as const,
  () => {
    page.value = 1;
    void fetchData();
  },
);

function resetFilter(): void {
  filter.value = defaultFilter();
  page.value = 1;
}

function vendorLabel(key: string): string {
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
        ElMessage.success('别名绑定已创建');
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
  const okp = await confirmDanger({
    title: '删除别名绑定',
    message: `确认删除别名「${row.alias}」？删除后该别名将不可用。`,
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

const initialVendorKey = computed(() => {
  const q = route.query.vendor;
  return typeof q === 'string' ? q : undefined;
});

onMounted(async () => {
  if (initialVendorKey.value) {
    filter.value.vendorKey = initialVendorKey.value;
  }
  await loadProviderGroups();
  await fetchData();
});
</script>

<template>
  <div class="page">
    <PageHeader
      title="模型路由"
      description="配置对外别名与上游注册名的映射。用户请求 model=别名 时，网关解析为 vendor + upstream。"
    >
      <template #actions>
        <el-button :icon="Plus" type="primary" @click="openCreate">新建绑定</el-button>
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
          <el-select v-model="filter.vendorKey" style="width: 160px">
            <el-option label="全部" value="all" />
            <el-option
              v-for="ch in providerGroups"
              :key="ch.queueGroup"
              :label="vendorLabel(ch.queueGroup)"
              :value="ch.queueGroup"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="上线状态">
          <el-select v-model="filter.isPublished" style="width: 140px">
            <el-option
              v-for="opt in publishFilterOptions"
              :key="String(opt.value)"
              :label="opt.label"
              :value="opt.value"
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
          <span class="mono alias">{{ row.alias }}</span>
        </template>
      </el-table-column>

      <el-table-column label="供应商组" width="120">
        <template #default="{ row }: { row: ModelRoute }">
          <el-tag size="small" effect="plain">{{ vendorLabel(row.vendorKey) }}</el-tag>
        </template>
      </el-table-column>

      <el-table-column label="上游注册名" min-width="200">
        <template #default="{ row }: { row: ModelRoute }">
          <span class="mono upstream">{{ row.vendorModel }}</span>
        </template>
      </el-table-column>

      <el-table-column label="上线状态" width="100">
        <template #default="{ row }: { row: ModelRoute }">
          <StatusTag
            :label="publishedLabel(row.isPublished)"
            :tone="publishedTone(row.isPublished)"
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
          title="暂无别名绑定"
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
      :initial-vendor-key="initialVendorKey"
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
.alias {
  font-weight: 600;
  color: var(--el-color-primary);
}
.upstream {
  font-size: 12.5px;
}
.pagination-bar {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
