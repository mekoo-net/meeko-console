<script setup lang="ts">
/**
 * 概览页统一的卡片容器：标题栏（title + 右侧 actions 插槽）+ 卡片主体。
 *
 * 用法：
 *   <Panel title="调用量趋势">
 *     <template #actions> ...legend / hint ... </template>
 *     <div>...chart body...</div>
 *   </Panel>
 */
defineProps<{ title: string }>();
</script>

<template>
  <section class="panel">
    <header class="panel__head">
      <h3 class="panel__title">{{ title }}</h3>
      <div class="panel__actions">
        <slot name="actions" />
      </div>
    </header>
    <div class="panel__body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.panel {
  background: #fff;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  gap: 12px;
  flex-wrap: wrap;
}
.panel__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.panel__actions {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.panel__body {
  flex: 1;
  padding: 14px 16px;
  min-height: 200px;
}
</style>
