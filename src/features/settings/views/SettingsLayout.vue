<script setup lang="ts">
/**
 * 系统设置的容器组件。
 *
 * 二级导航（账户设置 / 财务设置 / 平台设置 三组）已统一收归到全局左侧 `SideMenu`
 * 的展开式子菜单中，本组件只负责承载 children 路由，并提供统一的卡片外框
 * （各子页面为自包含面板）。
 */
</script>

<template>
  <div class="settings-layout">
    <div class="settings-layout__card">
      <router-view />
    </div>
  </div>
</template>

<style scoped>
.settings-layout {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.settings-layout__card {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  overflow: hidden;
  background: var(--el-bg-color);
}

.settings-layout__card > :deep(*) {
  flex: 1;
  min-height: 0;
}
</style>
