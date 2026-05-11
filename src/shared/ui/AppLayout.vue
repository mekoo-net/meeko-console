<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';

import SideMenu from './SideMenu.vue';
import TopBar from './TopBar.vue';

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
      <div class="brand" :class="{ 'brand--collapsed': collapsed }">
        <div class="brand__logo">M</div>
        <span v-if="!collapsed" class="brand__name">Meeko Admin</span>
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
        <router-view v-slot="{ Component, route: r }">
          <transition name="fade" mode="out-in">
            <component :is="Component" :key="r.fullPath" />
          </transition>
        </router-view>
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

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 56px;
  padding: 0 18px;
  font-weight: 600;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.brand__logo {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: linear-gradient(135deg, #2563eb, #7c3aed);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: #fff;
}

.brand__name {
  font-size: 15px;
  letter-spacing: 0.2px;
}

.brand--collapsed {
  padding: 0;
  justify-content: center;
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

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.12s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
