<script setup lang="ts">
/**
 * 列表页满高布局（opt-in）：Header + 筛选 + 表格(height 100%) + 分页。
 * 高度计算与 DemuxAI 定价页 provider-page 一致，不污染全局 table 样式。
 */
</script>

<template>
  <div class="fill-list-page">
    <div v-if="$slots.header" class="fill-list-page__header">
      <slot name="header" />
    </div>
    <div v-if="$slots.filters" class="fill-list-page__filters">
      <slot name="filters" />
    </div>
    <div class="fill-list-page__table">
      <div class="fill-list-page__table-shell">
        <slot />
      </div>
    </div>
    <div v-if="$slots.footer" class="fill-list-page__footer">
      <slot name="footer" />
    </div>
  </div>
</template>

<style scoped>
.fill-list-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: calc(100vh - 56px - 52px);
  min-height: 480px;
}

.fill-list-page__header,
.fill-list-page__filters,
.fill-list-page__footer {
  flex-shrink: 0;
}

.fill-list-page__filters {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.fill-list-page__table {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.fill-list-page__table-shell {
  height: 100%;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
}

.fill-list-page__table-shell :deep(.el-table) {
  --el-table-header-bg-color: var(--el-fill-color-light);
  --el-table-header-text-color: var(--el-text-color-regular);
}

.fill-list-page__footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 4px;
  border-top: 1px solid var(--el-border-color-lighter);
}

@media (max-width: 900px) {
  .fill-list-page {
    height: auto;
    min-height: calc(100vh - 108px);
  }

  .fill-list-page__table {
    min-height: 360px;
  }
}
</style>
