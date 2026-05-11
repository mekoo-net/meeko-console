<script setup lang="ts">
import { Expand, Fold, SwitchButton } from '@element-plus/icons-vue';

import { useAuthStore } from '@/stores/auth';

defineProps<{ collapsed: boolean; title: string }>();
const emit = defineEmits<{ (e: 'toggle-aside'): void }>();

const auth = useAuthStore();

function logout(): void {
  auth.logout();
}
</script>

<template>
  <div class="topbar">
    <el-button text :icon="collapsed ? Expand : Fold" @click="emit('toggle-aside')" />
    <h2 class="topbar__title">{{ title }}</h2>
    <div class="topbar__right">
      <el-tag v-if="auth.role" :type="auth.role === 'Admin' ? 'danger' : 'info'" effect="light" round>
        {{ auth.role }}
      </el-tag>
      <el-dropdown trigger="click">
        <span class="topbar__user">
          <el-avatar :size="28">{{ auth.displayInitial }}</el-avatar>
          <span class="topbar__user-name">{{ auth.displayName }}</span>
        </span>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item :icon="SwitchButton" @click="logout">退出登录</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<style scoped>
.topbar {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 16px;
}
.topbar__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.topbar__right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 14px;
}
.topbar__user {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.topbar__user-name {
  font-size: 14px;
  color: var(--el-text-color-regular);
}
</style>
