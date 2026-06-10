<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Edit, Search } from '@element-plus/icons-vue';

import StatusTag from '@/shared/ui/StatusTag.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import { clientPaginate, usePagination } from '@/shared/composables/usePagination';

import {
  ProviderGroupLabel,
  ProviderGroupStatusLabel,
  ProviderGroupStatusTone,
} from '../../model/enums';
import type { ProviderGroup } from '../../model/catalog.types';

/** 选中值：`all` 表示全部渠道；否则为 queueGroup */
export type ProviderGroupSelection = string;

export interface VendorPricingCounts {
  configured: number;
  unconfigured: number;
}

interface Props {
  groups: ProviderGroup[];
  modelValue: ProviderGroupSelection;
  loading?: boolean;
  /** 定价页：每渠道已配 / 未配别名数量 */
  counts?: Record<string, VendorPricingCounts>;
  /** 定价页等场景展示「全部渠道」 */
  showAllOption?: boolean;
  allLabel?: string;
  searchPlaceholder?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  /** 是否展示编辑 slug 按钮（供应商组页开启） */
  showEditButton?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  showAllOption: false,
  allLabel: '全部渠道',
  searchPlaceholder: '搜索组名 / QueueGroup',
  emptyTitle: '暂无供应商组',
  emptyDescription: '请从「接入供应商」拉取并入库。',
  showEditButton: false,
});

const emit = defineEmits<{
  (e: 'update:modelValue', v: ProviderGroupSelection): void;
  (e: 'edit', group: ProviderGroup): void;
}>();

const keyword = ref('');
const pagination = usePagination({ pageSize: 15, pageSizes: [10, 15, 20, 50] });

const filteredGroups = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  if (!kw) return props.groups;
  return props.groups.filter(
    (g) =>
      g.queueGroup.toLowerCase().includes(kw) ||
      (g.vendorSlug ?? '').toLowerCase().includes(kw) ||
      (ProviderGroupLabel[g.queueGroup] ?? '').toLowerCase().includes(kw),
  );
});

const pagedGroups = computed(() =>
  clientPaginate(filteredGroups.value, pagination.state.page, pagination.state.pageSize),
);

const showList = computed(
  () => props.showAllOption || filteredGroups.value.length > 0,
);

watch(
  filteredGroups,
  (list) => {
    pagination.setTotal(list.length);
  },
  { immediate: true },
);

watch(keyword, () => {
  pagination.setPage(1);
});

function select(value: ProviderGroupSelection): void {
  emit('update:modelValue', value);
}

function onEdit(group: ProviderGroup, event: MouseEvent): void {
  event.stopPropagation();
  emit('edit', group);
}

function slugDisplay(vendorSlug?: string | null): string {
  const slug = vendorSlug?.trim();
  return slug || '（未设置 slug）';
}
</script>

<template>
  <aside v-loading="loading" class="provider-sidebar">
    <div class="provider-sidebar__toolbar">
      <el-input
        v-model="keyword"
        :prefix-icon="Search"
        :placeholder="searchPlaceholder"
        clearable
        size="small"
      />
    </div>

    <div v-if="showList" class="provider-sidebar__list">
      <button
        v-if="showAllOption"
        type="button"
        class="provider-sidebar__item provider-sidebar__item--all"
        :class="{ 'provider-sidebar__item--active': modelValue === 'all' }"
        @click="select('all')"
      >
        <span class="provider-sidebar__item-title">{{ allLabel }}</span>
        <span class="provider-sidebar__item-meta">展示所有渠道的别名定价</span>
      </button>

      <button
        v-for="g in pagedGroups"
        :key="g.queueGroup"
        type="button"
        class="provider-sidebar__item"
        :class="{ 'provider-sidebar__item--active': modelValue === g.queueGroup }"
        @click="select(g.queueGroup)"
      >
        <div class="provider-sidebar__item-head">
          <span
            class="provider-sidebar__item-title"
            :class="{ 'provider-sidebar__item-title--unset': !g.vendorSlug?.trim() }"
          >
            {{ slugDisplay(g.vendorSlug) }}
          </span>
          <div class="provider-sidebar__item-actions">
            <StatusTag
              :label="ProviderGroupStatusLabel[g.status]"
              :tone="ProviderGroupStatusTone[g.status]"
            />
            <el-button
              v-if="showEditButton"
              :icon="Edit"
              link
              type="primary"
              size="small"
              title="编辑对外通道 slug"
              @click="onEdit(g, $event)"
            />
          </div>
        </div>
        <span class="provider-sidebar__item-qg">{{ g.queueGroup }}</span>
        <div class="provider-sidebar__item-meta">
          <span>{{ g.upstreamModelCount }} 个上游模型</span>
          <span v-if="counts" class="provider-sidebar__badges">
            <el-tag
              v-if="counts[g.queueGroup]?.configured"
              size="small"
              type="success"
              effect="plain"
              round
            >
              已配 {{ counts[g.queueGroup]?.configured }}
            </el-tag>
            <el-tag
              v-if="counts[g.queueGroup]?.unconfigured"
              size="small"
              type="danger"
              effect="plain"
              round
            >
              未配 {{ counts[g.queueGroup]?.unconfigured }}
            </el-tag>
          </span>
        </div>
      </button>
    </div>

    <EmptyState
      v-else-if="groups.length === 0"
      :title="emptyTitle"
      :description="emptyDescription"
      class="provider-sidebar__empty"
    />
    <div v-else class="provider-sidebar__no-match">无匹配供应商组</div>

    <div
      v-if="groups.length > 0"
      class="provider-pagination provider-pagination--compact"
    >
      <el-pagination
        v-model:current-page="pagination.state.page"
        v-model:page-size="pagination.state.pageSize"
        :total="pagination.state.total"
        :page-sizes="pagination.pageSizes"
        layout="total, prev, pager, next"
        size="small"
        background
      />
    </div>
  </aside>
</template>
