<script setup lang="ts">
/**
 * 「组件设置」的容器：平台依赖的各个组件（现在只有 OneApi）自己的设置页，一个组件一个目录。
 * 二级导航在全局 SideMenu，一个组件一组；OneApi 网关的安全策略（分类器、过滤器）单独一组。
 *
 * 和系统设置的容器不一样，这里不套卡片外框：模型价格是左右分栏的整页，自己带面板。
 * 以后加表单式的设置页，由页面自己套 SettingsPanelShell。
 */
</script>

<template>
  <div class="components-layout">
    <router-view />
  </div>
</template>

<style scoped>
.components-layout {
  min-height: 0;
}
</style>
