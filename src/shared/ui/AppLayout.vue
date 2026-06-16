<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';

import RouteViewport from './RouteViewport.vue';
import SideMenu from './SideMenu.vue';
import TopBar from './TopBar.vue';
import ViewSwitcher from './ViewSwitcher.vue';

const route = useRoute();

const collapsed = ref(false);

const pageTitle = computed(() => {
  const meta = route.meta as { title?: string };
  return meta?.title ?? 'Meeko 管理后台';
});
</script>

<template>
  <el-container class="app-shell">
    <el-aside :width="collapsed ? '64px' : '220px'" class="app-aside">
      <div class="app-aside__switcher" :class="{ 'app-aside__switcher--collapsed': collapsed }">
        <ViewSwitcher :collapsed="collapsed" />
      </div>
      <SideMenu :collapsed="collapsed" />
    </el-aside>
    <el-container>
      <el-header height="56px" class="app-header">
        <TopBar
          :collapsed="collapsed"
          :title="pageTitle"
          @toggle-aside="collapsed = !collapsed"
        />
      </el-header>
      <el-main class="app-main">
        <RouteViewport />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.app-shell {
  height: 100vh;
  background: var(--el-bg-color-page);
}

.app-aside {
  background: #0f172a;
  color: #e2e8f0;
  transition: width 0.18s ease;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  overflow: hidden;
}

.app-aside__switcher {
  height: 64px;
  display: flex;
  align-items: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.app-header {
  background: #fff;
  border-bottom: 1px solid var(--el-border-color-lighter);
  padding: 0 20px;
  display: flex;
  align-items: center;
}

.app-main {
  padding: 20px 24px 32px;
  background: #f3f4f6;
}

.app-main :deep(.route-viewport__page) {
  min-height: 100%;
}
</style>
