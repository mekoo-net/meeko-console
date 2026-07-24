<script setup lang="ts">
/**
 * 存储管理的容器组件：承载内容浏览等子路由，提供与系统设置一致的面板外框。
 */
</script>

<template>
  <div class="storage-layout">
    <div class="storage-layout__card">
      <router-view />
    </div>
  </div>
</template>

<style scoped>
.storage-layout {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 56px - 52px);
  min-height: 480px;
}

.storage-layout__card {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  overflow: hidden;
  background: var(--el-bg-color);
}

.storage-layout__card > :deep(*) {
  flex: 1;
  min-height: 0;
}
</style>
