<script setup lang="ts">
import { Suspense } from 'vue';

import { useNavigationStore } from '@/stores/navigation';

const nav = useNavigationStore();
</script>

<template>
  <div v-loading="nav.pending" class="route-viewport">
    <router-view v-slot="{ Component, route: r }">
      <Suspense>
        <component :is="Component" :key="r.fullPath" class="route-viewport__page" />
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
