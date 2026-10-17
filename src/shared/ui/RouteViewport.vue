<script setup lang="ts">
import { inject, unref } from 'vue';
import { viewDepthKey, type RouteLocationNormalizedLoaded } from 'vue-router';

import { useNavigationStore } from '@/stores/navigation';

const nav = useNavigationStore();
const depth = inject(viewDepthKey, 0);

/**
 * 叶子页按完整路径重建：查询参数变了也重新加载。带子路由的布局页只在本层路由或参数变化时重建，
 * 切换子页不连带重建布局——否则账户详情这类在布局里取数的页面，每切一个标签都要重新加载头部。
 */
function viewKey(r: RouteLocationNormalizedLoaded): string {
  let d = unref(depth);
  while (r.matched[d] && !r.matched[d]!.components) d++;
  const record = r.matched[d];
  if (!record || record.children.length === 0) return r.fullPath;
  return `${record.path}?${JSON.stringify(r.params)}`;
}
</script>

<template>
  <div v-loading="nav.pending" class="route-viewport">
    <router-view v-slot="{ Component, route: r }">
      <Suspense>
        <component :is="Component" :key="viewKey(r)" class="route-viewport__page" />
        <template #fallback />
      </Suspense>
    </router-view>
  </div>
</template>

<style scoped>
.route-viewport {
  position: relative;
  min-height: 100%;
  box-sizing: border-box;
}

.route-viewport__page {
  min-height: 100%;
  box-sizing: border-box;
}
</style>
