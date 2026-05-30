<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import PageHeader from '@/shared/ui/PageHeader.vue';
import { useAuthStore } from '@/stores/auth';

import { settingsSections } from '../model/settingsNav';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const visibleSections = computed(() =>
  settingsSections.filter((s) => !s.permission || auth.hasPermission(s.permission)),
);

const activeName = computed(() =>
  typeof route.name === 'string' ? route.name : (visibleSections.value[0]?.name ?? 'settings-auth'),
);

function onSelect(name: string): void {
  const section = visibleSections.value.find((s) => s.name === name);
  if (!section || section.disabled) return;
  if (route.name === name) return;
  void router.push({ name });
}
</script>

<template>
  <div class="settings-layout">
    <PageHeader
      title="系统设置"
      description="平台级配置，对所有业务线与前端生效。"
    />

    <div class="settings-layout__body">
      <aside class="settings-layout__aside">
        <el-menu
          :default-active="activeName"
          class="settings-layout__menu"
          @select="onSelect"
        >
          <el-menu-item
            v-for="section in visibleSections"
            :key="section.name"
            :index="section.name"
            :disabled="section.disabled"
          >
            <span>{{ section.title }}</span>
            <el-tag
              v-if="section.badge"
              size="small"
              type="info"
              effect="plain"
              class="settings-layout__badge"
            >
              {{ section.badge }}
            </el-tag>
          </el-menu-item>
        </el-menu>
      </aside>

      <main class="settings-layout__main">
        <router-view />
      </main>
    </div>
  </div>
</template>

<style scoped>
.settings-layout__body {
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr);
  gap: 0;
  min-height: 520px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  overflow: hidden;
  background: var(--el-bg-color);
}

@media (max-width: 960px) {
  .settings-layout__body {
    grid-template-columns: 1fr;
  }
}

.settings-layout__aside {
  border-right: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-blank);
}

.settings-layout__menu {
  border-right: none;
  padding: 8px 0;
}

.settings-layout__menu :deep(.el-menu-item) {
  height: 44px;
  line-height: 44px;
  margin: 0 8px 4px;
  border-radius: 6px;
}

.settings-layout__menu :deep(.el-menu-item.is-active) {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-weight: 600;
}

.settings-layout__badge {
  margin-left: 8px;
  vertical-align: middle;
}

.settings-layout__main {
  min-width: 0;
  background: var(--el-bg-color);
}
</style>
