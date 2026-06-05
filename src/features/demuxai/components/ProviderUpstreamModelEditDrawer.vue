<script setup lang="ts">
/**
 * 上游模型编辑抽屉：查看/维护该模型上的全部对外别名。
 * 定价在「模型定价」页单独配置，此处不处理。
 */
import { computed, ref, watch } from 'vue';

import { Delete, Edit, Plus } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

import StatusTag from '@/shared/ui/StatusTag.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import { formatDateTime } from '@/shared/lib/date';
import { confirmDanger } from '@/shared/composables/useConfirm';

import { ProviderGroupLabel, publishedLabel, publishedTone } from '../model/enums';
import type { ProviderGroup, ProviderUpstreamModel } from '../model/catalog.types';
import type {
  CreateModelRouteInput,
  ModelRoute,
  UpdateModelRouteInput,
} from '../model/modelRoute.types';
import { getDemuxaiModelRoutePort } from '../services';
import ModelRouteEditDrawer from './ModelRouteEditDrawer.vue';

interface Props {
  modelValue: boolean;
  group: ProviderGroup | null;
  model: ProviderUpstreamModel | null;
  providerGroups: ProviderGroup[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'refresh'): void;
}>();

const routePort = getDemuxaiModelRoutePort();

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const routes = ref<ModelRoute[]>([]);
const routesLoading = ref(false);

const aliasDrawerOpen = ref(false);
const aliasDrawerLoading = ref(false);
const editingRoute = ref<ModelRoute | null>(null);

const groupTitle = computed(() => {
  if (!props.group) return '';
  const slug = props.group.vendorSlug?.trim();
  if (slug) return slug;
  return ProviderGroupLabel[props.group.queueGroup] ?? props.group.queueGroup;
});

async function loadRoutes(): Promise<void> {
  if (!props.group || !props.model) return;
  routesLoading.value = true;
  try {
    const r = await routePort.list({
      page: 1,
      pageSize: 500,
      filter: {
        keyword: '',
        vendorKey: props.group.queueGroup,
        isPublished: 'all',
      },
    });
    if (r.success) {
      routes.value = r.data.items.filter(
        (rt) => rt.vendorModel === props.model!.vendorModel,
      );
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    routesLoading.value = false;
  }
}

function openCreateAlias(): void {
  editingRoute.value = null;
  aliasDrawerOpen.value = true;
}

function openEditAlias(route: ModelRoute): void {
  editingRoute.value = route;
  aliasDrawerOpen.value = true;
}

async function onAliasSubmit(payload: {
  create?: CreateModelRouteInput;
  update?: UpdateModelRouteInput;
}): Promise<void> {
  aliasDrawerLoading.value = true;
  try {
    if (payload.create) {
      const r = await routePort.create(payload.create);
      if (r.success) {
        ElMessage.success('别名已创建');
        aliasDrawerOpen.value = false;
        await loadRoutes();
        emit('refresh');
      } else {
        ElMessage.error(r.error.message);
      }
      return;
    }
    if (payload.update && editingRoute.value) {
      const r = await routePort.update(editingRoute.value.uid, payload.update);
      if (r.success) {
        ElMessage.success('已保存');
        aliasDrawerOpen.value = false;
        await loadRoutes();
        emit('refresh');
      } else {
        ElMessage.error(r.error.message);
      }
    }
  } finally {
    aliasDrawerLoading.value = false;
  }
}

async function onDeleteAlias(route: ModelRoute): Promise<void> {
  const okp = await confirmDanger({
    title: '删除别名',
    message: `确认删除别名「${route.alias}」？删除后该别名将不可用。`,
    confirmText: '确认删除',
    type: 'warning',
  });
  if (!okp) return;
  const r = await routePort.delete(route.uid);
  if (r.success) {
    ElMessage.success('已删除');
    await loadRoutes();
    emit('refresh');
  } else {
    ElMessage.error(r.error.message);
  }
}

watch(
  () => [props.modelValue, props.group?.queueGroup, props.model?.vendorModel] as const,
  ([open]) => {
    if (open && props.group && props.model) void loadRoutes();
    else routes.value = [];
  },
);
</script>

<template>
  <el-drawer
    v-model="visible"
    title="编辑上游模型"
    size="800px"
    destroy-on-close
  >
    <template v-if="group && model">
      <el-descriptions :column="1" border size="small" class="meta">
        <el-descriptions-item label="供应商组">
          {{ groupTitle }}
          <span class="mono meta__sub">{{ group.queueGroup }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="上游模型 ID">
          <span class="mono">{{ model.vendorModel }}</span>
        </el-descriptions-item>
        <el-descriptions-item v-if="model.label" label="显示名">
          {{ model.label }}
        </el-descriptions-item>
      </el-descriptions>

      <div class="section-head">
        <span class="section-head__title">对外别名</span>
        <el-button type="primary" size="small" :icon="Plus" @click="openCreateAlias">
          创建别名
        </el-button>
      </div>

      <el-table
        v-loading="routesLoading"
        :data="routes"
        row-key="uid"
        size="small"
        class="alias-table"
        :empty-text="' '"
      >
        <el-table-column label="别名" min-width="160">
          <template #default="{ row }: { row: ModelRoute }">
            <span class="mono alias-name">{{ row.alias }}</span>
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
        <el-table-column label="更新" width="140">
          <template #default="{ row }: { row: ModelRoute }">
            <span class="cell-date">{{ formatDateTime(row.updatedAtUtc) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" align="right" fixed="right">
          <template #default="{ row }: { row: ModelRoute }">
            <el-button :icon="Edit" link type="primary" @click="openEditAlias(row)">编辑</el-button>
            <el-button :icon="Delete" link type="danger" @click="onDeleteAlias(row)">删除</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState
            title="暂无对外别名"
            description="一个上游模型可创建多个对外别名（别名需全局唯一）；用户请求 model 字段需映射到此外部别名。点击上方「创建别名」添加。"
            class="alias-empty"
          />
        </template>
      </el-table>
    </template>

    <ModelRouteEditDrawer
      v-model="aliasDrawerOpen"
      :route="editingRoute"
      :loading="aliasDrawerLoading"
      :provider-groups="providerGroups"
      :fixed-vendor-key="group?.queueGroup"
      :fixed-upstream-model-id="model?.vendorModel"
      @submit="onAliasSubmit"
    />
  </el-drawer>
</template>

<style scoped>
.mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}
.meta {
  margin-bottom: 20px;
}
.meta__sub {
  margin-left: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.section-head__title {
  font-size: 14px;
  font-weight: 600;
}
.alias-table {
  width: 100%;
}
.alias-name {
  font-weight: 600;
  color: var(--el-color-primary);
}
.cell-date {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.alias-empty {
  padding: 16px 0;
}
</style>
