<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { prefetchRoute } from '@/router/prefetch';
import type { AppRole } from '@/stores/auth';
import { useAuthStore } from '@/stores/auth';
import {
  collectAncestors,
  collectLeaves,
  filterTree,
  matchView,
  navViews,
  type MenuNode,
  type NavView,
} from './nav';

defineProps<{ collapsed: boolean }>();

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

/** 当前路径所属的业务视图；无匹配时回退到第一个可见视图。 */
const currentView = computed<NavView>(() => {
  const matched = matchView(route.path);
  if (matched) return matched;
  const fallback = navViews.find((v) => isVisible(v) && filterTree(v.menu, isVisible).length > 0);
  return fallback ?? (navViews[0] as NavView);
});

/** 只渲染「当前视图」的菜单。 */
const visible = computed<MenuNode[]>(() => filterTree(currentView.value.menu, isVisible));

const allLeaves = computed(() => collectLeaves(visible.value));

const active = computed(() => {
  const path = route.path;
  const sorted = [...allLeaves.value].sort((a, b) => b.index.length - a.index.length);
  const matched = sorted.find((l) => path === l.index || path.startsWith(l.index + '/'));
  return matched?.index ?? allLeaves.value[0]?.index ?? '';
});

const opens = computed<string[]>(() => collectAncestors(visible.value, active.value) ?? []);

/**
 * `el-menu` 的 `open(index)` 方法在官方运行时是暴露的，但 d.ts 中未列出，
 * 这里手写一个最小接口避免 `any`。
 */
interface MenuInstance {
  open: (index: string) => void;
  close: (index: string) => void;
}

const menuRef = ref<MenuInstance | null>(null);

watch(
  opens,
  async (next) => {
    await nextTick();
    for (const idx of next) menuRef.value?.open(idx);
  },
  { immediate: true },
);

function navigate(index: string): void {
  if (route.path === index || route.path.startsWith(index + '/')) return;
  void router.push(index);
}

function onMenuHover(index: string): void {
  prefetchRoute(router, index);
}
</script>

<template>
  <el-menu
    ref="menuRef"
    :key="currentView.id"
    :collapse="collapsed"
    :default-active="active"
    :default-openeds="opens"
    :unique-opened="false"
    background-color="#0f172a"
    text-color="#e2e8f0"
    active-text-color="#60a5fa"
    class="side-menu"
    @select="navigate"
  >
    <template v-for="node in visible" :key="node.index">
      <!-- 叶子节点 -->
      <el-menu-item
        v-if="node.type === 'leaf'"
        :index="node.index"
        :disabled="node.disabled"
        @mouseenter="onMenuHover(node.index)"
      >
        <el-icon v-if="node.icon"><component :is="node.icon" /></el-icon>
        <template #title>
          <span>{{ node.title }}</span>
          <el-tag
            v-if="node.badge"
            size="small"
            type="info"
            effect="plain"
            class="side-menu__badge"
          >
            {{ node.badge }}
          </el-tag>
        </template>
      </el-menu-item>

      <!-- 二级 sub-menu -->
      <el-sub-menu v-else :index="node.index">
        <template #title>
          <el-icon v-if="node.icon"><component :is="node.icon" /></el-icon>
          <span>{{ node.title }}</span>
        </template>

        <template v-for="child in node.children" :key="child.index">
          <el-menu-item
            v-if="child.type === 'leaf'"
            :index="child.index"
            :disabled="child.disabled"
            @mouseenter="onMenuHover(child.index)"
          >
            <el-icon v-if="child.icon"><component :is="child.icon" /></el-icon>
            <template #title>
              <span>{{ child.title }}</span>
              <el-tag
                v-if="child.badge"
                size="small"
                type="info"
                effect="plain"
                class="side-menu__badge"
              >
                {{ child.badge }}
              </el-tag>
            </template>
          </el-menu-item>

          <!-- 三级 sub-menu -->
          <el-sub-menu v-else :index="child.index">
            <template #title>
              <el-icon v-if="child.icon"><component :is="child.icon" /></el-icon>
              <span>{{ child.title }}</span>
            </template>
            <el-menu-item
              v-for="leaf in child.children"
              :key="leaf.index"
              :index="leaf.index"
              :disabled="leaf.type === 'leaf' ? leaf.disabled : false"
              @mouseenter="leaf.type === 'leaf' ? onMenuHover(leaf.index) : undefined"
            >
              <el-icon v-if="leaf.type === 'leaf' && leaf.icon">
                <component :is="leaf.icon" />
              </el-icon>
              <template #title>
                <span>{{ leaf.title }}</span>
                <el-tag
                  v-if="leaf.type === 'leaf' && leaf.badge"
                  size="small"
                  type="info"
                  effect="plain"
                  class="side-menu__badge"
                >
                  {{ leaf.badge }}
                </el-tag>
              </template>
            </el-menu-item>
          </el-sub-menu>
        </template>
      </el-sub-menu>
    </template>
  </el-menu>
</template>

<style scoped>
.side-menu {
  border-right: none;
  background: transparent !important;
}
.side-menu :deep(.el-menu-item),
.side-menu :deep(.el-sub-menu__title) {
  margin: 2px 8px;
  border-radius: 8px;
  height: 42px;
  line-height: 42px;
}
.side-menu :deep(.el-menu-item.is-active) {
  background: rgba(96, 165, 250, 0.12) !important;
}
.side-menu :deep(.el-menu-item:hover),
.side-menu :deep(.el-sub-menu__title:hover) {
  background: rgba(255, 255, 255, 0.05) !important;
}
.side-menu :deep(.el-sub-menu .el-menu) {
  background: transparent !important;
}
.side-menu :deep(.el-sub-menu .el-menu-item),
.side-menu :deep(.el-sub-menu .el-sub-menu__title) {
  min-width: auto;
}
.side-menu :deep(.el-menu-item.is-disabled) {
  opacity: 0.45;
  cursor: not-allowed;
}
.side-menu__badge {
  margin-left: 8px;
  font-size: 10px;
  padding: 0 6px;
  height: 18px;
  line-height: 18px;
  vertical-align: middle;
}
</style>
