<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Bell, CreditCard, Lock, User } from '@element-plus/icons-vue';

import { useAuthStore } from '@/stores/auth';

defineProps<{ collapsed: boolean }>();

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

interface MenuItem {
  index: string;
  title: string;
  icon: unknown;
  roles?: ReadonlyArray<'Admin' | 'Owner' | 'Member'>;
}

const items: readonly MenuItem[] = [
  { index: '/accounts', title: '账户管理', icon: User },
  { index: '/billing', title: '账单管理', icon: CreditCard },
  { index: '/admins', title: '访问控制', icon: Lock, roles: ['Admin'] },
  { index: '/notices', title: '通知中心', icon: Bell, roles: ['Admin'] },
];

const visible = computed(() =>
  items.filter((i) => !i.roles || (auth.role && i.roles.includes(auth.role))),
);

const active = computed(() => {
  const matched = items.find((i) => route.path.startsWith(i.index));
  return matched?.index ?? '/accounts';
});

function navigate(index: string): void {
  if (route.path.startsWith(index)) return;
  void router.push(index);
}
</script>

<template>
  <el-menu
    :collapse="collapsed"
    :default-active="active"
    background-color="#0f172a"
    text-color="#e2e8f0"
    active-text-color="#60a5fa"
    class="side-menu"
    @select="navigate"
  >
    <el-menu-item v-for="item in visible" :key="item.index" :index="item.index">
      <el-icon><component :is="item.icon" /></el-icon>
      <template #title>{{ item.title }}</template>
    </el-menu-item>
  </el-menu>
</template>

<style scoped>
.side-menu {
  border-right: none;
  background: transparent !important;
}
.side-menu :deep(.el-menu-item) {
  margin: 2px 8px;
  border-radius: 8px;
  height: 42px;
  line-height: 42px;
}
.side-menu :deep(.el-menu-item.is-active) {
  background: rgba(96, 165, 250, 0.12) !important;
}
.side-menu :deep(.el-menu-item:hover) {
  background: rgba(255, 255, 255, 0.05) !important;
}
</style>
