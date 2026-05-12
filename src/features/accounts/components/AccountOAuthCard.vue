<script setup lang="ts">
import { computed } from 'vue';

import {
  OAuthProviderLabel,
  oauthProviderValues,
  type OAuthBinding,
  type OAuthProvider,
} from '../model/account.types';

const props = defineProps<{
  bindings?: OAuthBinding[];
}>();

const map = computed(() => {
  const m = new Map<OAuthProvider, OAuthBinding>();
  (props.bindings ?? []).forEach((b) => m.set(b.provider, b));
  return m;
});

/** 仅使用 emoji 兜底，避免引入额外图标资源。后续可换 SVG icon。 */
const providerIcons: Readonly<Record<OAuthProvider, string>> = {
  wechat: '💬',
  qq: '🐧',
  github: '🐙',
  google: 'G',
};
</script>

<template>
  <div class="oauth-card">
    <div class="oauth-card__head">
      <span class="oauth-card__label">第三方登录</span>
      <span class="oauth-card__sub">{{ map.size }} / {{ oauthProviderValues.length }} 已绑定</span>
    </div>

    <div class="oauth-card__list">
      <div
        v-for="p in oauthProviderValues"
        :key="p"
        class="oauth-item"
        :class="{ 'oauth-item--bound': map.has(p) }"
      >
        <div class="oauth-item__icon">{{ providerIcons[p] }}</div>
        <div class="oauth-item__body">
          <div class="oauth-item__name">{{ OAuthProviderLabel[p] }}</div>
          <div v-if="map.get(p)" class="oauth-item__nick">
            {{ map.get(p)?.nickname ?? map.get(p)?.externalUid }}
          </div>
          <div v-else class="oauth-item__nick oauth-item__nick--muted">未绑定</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.oauth-card {
  background: #fff;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 152px;
}
.oauth-card__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.oauth-card__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.oauth-card__sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}
.oauth-card__list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
.oauth-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px solid transparent;
}
.oauth-item--bound {
  background: #ecfdf5;
  border-color: #a7f3d0;
}
.oauth-item__icon {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
}
.oauth-item__body {
  flex: 1;
  min-width: 0;
}
.oauth-item__name {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}
.oauth-item__nick {
  font-size: 11px;
  color: var(--el-text-color-regular);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.oauth-item__nick--muted {
  color: var(--el-text-color-placeholder);
}
</style>
