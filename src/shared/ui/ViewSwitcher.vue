<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowDown, Check, Grid } from '@element-plus/icons-vue';

import type { AppRole } from '@/stores/auth';
import { useAuthStore } from '@/stores/auth';
import { filterTree, firstLeafIndex, matchView, navViews, type NavView } from './nav';

defineProps<{ collapsed?: boolean }>();

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

function isVisible(node: { roles?: ReadonlyArray<AppRole>; perm?: string }): boolean {
  if (node.perm) {
    return auth.hasPermission(node.perm);
  }
  if (node.roles && node.roles.length > 0) {
    return auth.role !== null && node.roles.includes(auth.role);
  }
  return true;
}

/** 当前用户可见、且至少有一个可见菜单项的视图。 */
const views = computed<NavView[]>(() =>
  navViews.filter((v) => isVisible(v) && filterTree(v.menu, isVisible).length > 0),
);

const currentView = computed<NavView | null>(() => matchView(route.path) ?? views.value[0] ?? null);

function switchTo(view: NavView): void {
  if (view.id === currentView.value?.id) return;
  const target = firstLeafIndex(view, isVisible);
  if (target) void router.push(target);
}
</script>

<template>
  <el-dropdown
    class="view-switcher__root"
    trigger="click"
    placement="bottom-start"
    popper-class="view-switcher__popper"
    @command="switchTo"
  >
    <button class="view-switcher" :class="{ 'view-switcher--collapsed': collapsed }" type="button">
      <el-icon class="view-switcher__icon">
        <component :is="currentView?.icon ?? Grid" />
      </el-icon>
      <template v-if="!collapsed">
        <span class="view-switcher__title">{{ currentView?.title ?? '导航' }}</span>
        <el-icon class="view-switcher__caret"><ArrowDown /></el-icon>
      </template>
    </button>
    <template #dropdown>
      <el-dropdown-menu class="view-switcher__menu">
        <el-dropdown-item
          v-for="view in views"
          :key="view.id"
          :command="view"
          :class="{ 'is-current': view.id === currentView?.id }"
        >
          <el-icon v-if="view.icon" class="view-switcher__item-icon">
            <component :is="view.icon" />
          </el-icon>
          <span class="view-switcher__item-title">{{ view.title }}</span>
          <el-icon v-if="view.id === currentView?.id" class="view-switcher__item-check">
            <Check />
          </el-icon>
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<style scoped>
.view-switcher__root {
  display: flex;
  width: 100%;
  height: 100%;
}
.view-switcher {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 100%;
  padding: 0 16px;
  border: none;
  border-radius: 0;
  background: rgba(255, 255, 255, 0.06);
  color: #e2e8f0;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.2px;
  cursor: pointer;
  transition: background 0.15s ease;
}
.view-switcher:hover {
  background: rgba(255, 255, 255, 0.1);
}
.view-switcher--collapsed {
  padding: 0;
  justify-content: center;
}
.view-switcher__icon {
  font-size: 18px;
  color: #60a5fa;
}
.view-switcher__title {
  flex: 1;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.view-switcher__caret {
  font-size: 12px;
  color: #94a3b8;
}
.view-switcher__menu {
  min-width: 200px;
}
.view-switcher__menu :deep(.el-dropdown-menu__item) {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 14px;
}
.view-switcher__menu :deep(.el-dropdown-menu__item.is-current) {
  color: var(--el-color-primary);
  font-weight: 600;
  background: var(--el-color-primary-light-9);
}
.view-switcher__item-title {
  flex: 1;
}
.view-switcher__item-check {
  color: var(--el-color-primary);
}
</style>
