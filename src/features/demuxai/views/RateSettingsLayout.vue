<script setup lang="ts">
/**
 * 速率设置容器：页头 + 子页导航（总开关 / 账户设置 / IP 设置）。
 * 三个子页通过 useRateLimitSettings 共享同一份草稿，切换不丢未保存的编辑。
 */
import { useRoute } from 'vue-router';

import PageHeader from '@/shared/ui/PageHeader.vue';

const route = useRoute();

const tabs = [
  { name: 'demuxai-settings-rate', label: '总开关', to: '/demux/settings/rate' },
  { name: 'demuxai-settings-rate-accounts', label: '账户设置', to: '/demux/settings/rate/accounts' },
  { name: 'demuxai-settings-rate-ip', label: 'IP 设置', to: '/demux/settings/rate/ip' },
] as const;
</script>

<template>
  <div class="rate-settings">
    <PageHeader
      title="速率设置"
      description="控制 DemuxAI 网关的账户与 IP 速率限制"
    />

    <div class="rate-settings__card">
      <nav
        class="rate-settings__nav"
        aria-label="速率设置导航"
      >
        <router-link
          v-for="tab in tabs"
          :key="tab.name"
          :to="tab.to"
          class="rate-settings__tab"
          :class="{ 'rate-settings__tab--active': route.name === tab.name }"
        >
          {{ tab.label }}
        </router-link>
      </nav>

      <router-view />
    </div>
  </div>
</template>

<style scoped>
.rate-settings {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 56px - 52px);
  min-height: 480px;
}

.rate-settings__card {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  overflow: hidden;
  background: var(--el-bg-color);
}

.rate-settings__nav {
  display: flex;
  gap: 24px;
  padding: 0 24px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
}

.rate-settings__tab {
  position: relative;
  padding: 13px 2px;
  font-size: 14px;
  color: var(--el-text-color-regular);
  text-decoration: none;
  transition: color 0.15s;
}

.rate-settings__tab:hover {
  color: var(--el-color-primary);
}

.rate-settings__tab--active {
  color: var(--el-color-primary);
  font-weight: 500;
}

.rate-settings__tab--active::after {
  content: '';
  position: absolute;
  inset: auto 0 -1px;
  height: 2px;
  background: var(--el-color-primary);
}

.rate-settings__card > :deep(:not(nav)) {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
</style>
