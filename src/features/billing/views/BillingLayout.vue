<script setup lang="ts">
/**
 * 财务管理的容器组件。
 *
 * 二级导航（余额总览 / 充值记录 / 充值渠道）已统一收归到全局左侧 `SideMenu`
 * 的展开式子菜单中，本组件只负责承载 children 路由。
 */
</script>

<template>
  <div class="billing-layout">
    <router-view />
  </div>
</template>

<style scoped>
.billing-layout {
  min-height: 0;
}
</style>
