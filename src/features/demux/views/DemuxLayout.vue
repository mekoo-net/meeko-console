<script setup lang="ts">
/**
 * DemuxAI 管理域的容器组件。
 *
 * 二级导航（渠道 / 模型 / 定价 / 日志）统一收归到全局左侧 SideMenu
 * 的展开式子菜单中，本组件只承载 children 路由。
 */
</script>

<template>
  <div class="demux-layout">
    <router-view />
  </div>
</template>

<style scoped>
.demux-layout {
  min-height: 0;
}
</style>
