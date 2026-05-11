<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

const tabs = [
  { name: 'billing-overview', label: '余额总览', path: '/billing/overview' },
  { name: 'billing-recharges', label: '充值记录', path: '/billing/recharges' },
  { name: 'billing-channels', label: '充值渠道', path: '/billing/channels' },
];

const activeTab = computed(() => {
  const matched = tabs.find((t) => route.path.startsWith(t.path));
  return matched?.path ?? '/billing/overview';
});

function navigate(path: string): void {
  if (route.path === path) return;
  void router.push(path);
}
</script>

<template>
  <div class="billing-layout">
    <div class="billing-layout__nav">
      <el-tabs
        :model-value="activeTab"
        type="card"
        class="billing-nav-tabs"
        @tab-click="(tab: { paneName: unknown }) => navigate(tab.paneName as string)"
      >
        <el-tab-pane
          v-for="t in tabs"
          :key="t.path"
          :label="t.label"
          :name="t.path"
        />
      </el-tabs>
    </div>
    <router-view />
  </div>
</template>

<style scoped>
.billing-layout__nav {
  margin-bottom: 4px;
}
.billing-nav-tabs :deep(.el-tabs__header) {
  margin: 0;
}
</style>
