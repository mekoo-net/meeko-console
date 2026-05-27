<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Search } from '@element-plus/icons-vue';

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

interface Props {
  groups: ProviderGroup[];
  modelValue: ProviderGroupSelection;
  loading?: boolean;
  /** 定价页等场景展示「全部渠道」 */
  showAllOption?: boolean;
  allLabel?: string;
  searchPlaceholder?: string;
  emptyTitle?: string;
  emptyDescription?: string;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  showAllOption: false,
  allLabel: '全部渠道',
  searchPlaceholder: '搜索组名 / QueueGroup',
  emptyTitle: '暂无供应商组',
  emptyDescription: '请从「接入供应商」拉取并入库。',
});

const emit = defineEmits<{
  (e: 'update:modelValue', v: ProviderGroupSelection): void;
}>();

const keyword = ref('');
const pagination = usePagination({ initialPageSize: 15, pageSizes: [10, 15, 20, 50] });

function groupLabel(queueGroup: string, displayName: string): string {
  return ProviderGroupLabel[queueGroup] ?? displayName;
}

const filteredGroups = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  if (!kw) return props.groups;
  return props.groups.filter(
    (g) =>
      g.queueGroup.toLowerCase().includes(kw) ||
      g.displayName.toLowerCase().includes(kw) ||
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
          <span class="provider-sidebar__item-title">
            {{ groupLabel(g.queueGroup, g.displayName) }}
          </span>
          <StatusTag
            :label="ProviderGroupStatusLabel[g.status]"
            :tone="ProviderGroupStatusTone[g.status]"
          />
        </div>
        <span class="provider-sidebar__item-qg">{{ g.queueGroup }}</span>
        <div class="provider-sidebar__item-meta">
          <span>{{ g.upstreamModelCount }} 个上游模型</span>
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
        small
        background
      />
    </div>
  </aside>
</template>
