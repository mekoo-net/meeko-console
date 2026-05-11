<script setup lang="ts" generic="T">
import type { AppError } from '@/shared/api/httpTypes';
import EmptyState from './EmptyState.vue';

defineProps<{
  loading: boolean;
  error: AppError | undefined;
  items: readonly T[] | undefined;
  emptyTitle?: string;
  emptyDescription?: string;
}>();

defineSlots<{
  filter?: () => unknown;
  toolbar?: () => unknown;
  default: () => unknown;
  pagination?: () => unknown;
}>();
</script>

<template>
  <section class="data-shell">
    <div v-if="$slots.filter" class="data-shell__filter">
      <slot name="filter" />
    </div>

    <div v-if="$slots.toolbar" class="data-shell__toolbar">
      <slot name="toolbar" />
    </div>

    <div v-loading="loading" class="data-shell__body">
      <el-alert
        v-if="error"
        :title="`加载失败：${error.code}`"
        :description="error.message"
        type="error"
        show-icon
        :closable="false"
        class="data-shell__error"
      />
      <template v-else-if="!loading && (items === undefined || items.length === 0)">
        <EmptyState :title="emptyTitle ?? '暂无数据'" :description="emptyDescription" />
      </template>
      <template v-else>
        <slot />
      </template>
    </div>

    <div v-if="$slots.pagination" class="data-shell__pagination">
      <slot name="pagination" />
    </div>
  </section>
</template>

<style scoped>
.data-shell {
  background: #fff;
  border-radius: 12px;
  border: 1px solid var(--el-border-color-lighter);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.data-shell__filter {
  padding-bottom: 12px;
  border-bottom: 1px dashed var(--el-border-color-lighter);
}
.data-shell__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.data-shell__body {
  min-height: 220px;
}
.data-shell__error {
  margin-bottom: 8px;
}
.data-shell__pagination {
  display: flex;
  justify-content: flex-end;
}
</style>
