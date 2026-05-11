<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

interface NavItem {
  path: string;
  label: string;
  icon: string;
  disabled?: boolean;
  badge?: string;
}

interface NavGroup {
  key: string;
  label: string;
  icon: string;
  items: NavItem[];
}

const groups: NavGroup[] = [
  {
    key: 'email',
    label: '邮箱通知',
    icon: '✉️',
    items: [
      { path: '/notices/email/channels', label: 'SMTP 渠道', icon: '🔗' },
      { path: '/notices/email/templates', label: '邮件模板', icon: '📄' },
    ],
  },
  {
    key: 'sms',
    label: '短信通知',
    icon: '📱',
    items: [
      { path: '/notices/sms/channels', label: '短信渠道', icon: '🔗', disabled: true, badge: '即将支持' },
      { path: '/notices/sms/templates', label: '短信模板', icon: '📄', disabled: true, badge: '即将支持' },
    ],
  },
];

const activeItem = computed(() => route.path);

function isActive(path: string): boolean {
  return route.path === path || route.path.startsWith(path + '/');
}

function navigate(item: NavItem): void {
  if (item.disabled) return;
  if (isActive(item.path)) return;
  void router.push(item.path);
}
</script>

<template>
  <div class="notices-layout">
    <!-- 左侧导航 -->
    <aside class="notices-nav">
      <div
        v-for="group in groups"
        :key="group.key"
        class="nav-group"
      >
        <div class="nav-group__header">
          <span class="nav-group__icon">{{ group.icon }}</span>
          <span class="nav-group__label">{{ group.label }}</span>
        </div>
        <ul class="nav-group__items">
          <li
            v-for="item in group.items"
            :key="item.path"
            class="nav-item"
            :class="{
              'nav-item--active': !item.disabled && isActive(item.path),
              'nav-item--disabled': item.disabled,
            }"
            @click="navigate(item)"
          >
            <span class="nav-item__icon">{{ item.icon }}</span>
            <span class="nav-item__label">{{ item.label }}</span>
            <el-tag
              v-if="item.badge"
              size="small"
              type="info"
              effect="plain"
              class="nav-item__badge"
            >
              {{ item.badge }}
            </el-tag>
          </li>
        </ul>
      </div>

      <div class="nav-divider" />

      <ul class="nav-group__items">
        <li
          class="nav-item"
          :class="{ 'nav-item--active': isActive('/notices/debug') }"
          @click="() => router.push('/notices/debug')"
        >
          <span class="nav-item__icon">🔧</span>
          <span class="nav-item__label">通知调试</span>
        </li>
      </ul>
    </aside>

    <!-- 内容区 -->
    <main class="notices-content">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.notices-layout {
  display: flex;
  gap: 0;
  min-height: 0;
  align-items: flex-start;
}

/* 左侧导航 */
.notices-nav {
  width: 192px;
  flex-shrink: 0;
  background: var(--el-bg-color-page);
  border-right: 1px solid var(--el-border-color-lighter);
  padding: 8px 0 16px;
  border-radius: 8px 0 0 8px;
  min-height: calc(100vh - 120px);
  position: sticky;
  top: 0;
}

.nav-group {
  margin-bottom: 4px;
}

.nav-group__header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--el-text-color-placeholder);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  user-select: none;
}

.nav-group__icon {
  font-size: 13px;
}

.nav-group__label {
  font-size: 11px;
}

.nav-group__items {
  list-style: none;
  padding: 0;
  margin: 0;
}

/* 导航条目 */
.nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  cursor: pointer;
  border-radius: 0;
  font-size: 13px;
  color: var(--el-text-color-regular);
  transition: background 0.15s, color 0.15s;
  user-select: none;
  position: relative;
}

.nav-item:hover:not(.nav-item--disabled) {
  background: var(--el-fill-color-light);
  color: var(--el-text-color-primary);
}

.nav-item--active {
  background: var(--el-color-primary-light-9) !important;
  color: var(--el-color-primary) !important;
  font-weight: 500;
}

.nav-item--active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 4px;
  bottom: 4px;
  width: 3px;
  background: var(--el-color-primary);
  border-radius: 0 2px 2px 0;
}

.nav-item--disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.nav-item__icon {
  font-size: 14px;
  flex-shrink: 0;
}

.nav-item__label {
  flex: 1;
  min-width: 0;
}

.nav-item__badge {
  flex-shrink: 0;
  font-size: 10px;
  padding: 0 4px;
  height: 18px;
  line-height: 18px;
}

/* 分隔线 */
.nav-divider {
  height: 1px;
  background: var(--el-border-color-lighter);
  margin: 8px 12px;
}

/* 右侧内容 */
.notices-content {
  flex: 1;
  min-width: 0;
  padding: 0 0 0 24px;
}
</style>
