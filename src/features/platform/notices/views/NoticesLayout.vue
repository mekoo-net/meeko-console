<script setup lang="ts">
/**
 * 通知中心的容器组件。
 *
 * 二级（邮件通知 / 短信通知）与三级（渠道 / 模板）导航已统一收归到
 * 全局左侧 `SideMenu`，本组件只负责承载 children 路由。
 */
</script>

<template>
  <div class="notices-layout">
    <router-view />
  </div>
</template>

<style scoped>
.notices-layout {
  min-height: 0;
}
</style>
