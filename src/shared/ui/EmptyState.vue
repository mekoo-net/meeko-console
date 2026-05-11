<script setup lang="ts">
defineProps<{ title: string; description?: string }>();
</script>

<template>
  <div class="empty">
    <div class="empty__icon">
      <svg viewBox="0 0 64 64" width="56" height="56" aria-hidden="true">
        <rect width="64" height="64" rx="14" fill="#e5e7eb" />
        <path d="M16 28 H48 V44 H16 Z" fill="#fff" stroke="#9ca3af" stroke-width="2" />
        <path d="M16 28 L32 18 L48 28" fill="#fff" stroke="#9ca3af" stroke-width="2" />
      </svg>
    </div>
    <h3 class="empty__title">{{ title }}</h3>
    <p v-if="description" class="empty__desc">{{ description }}</p>
    <div class="empty__actions">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 56px 16px;
  color: var(--el-text-color-secondary);
}
.empty__icon {
  margin-bottom: 12px;
}
.empty__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}
.empty__desc {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.empty__actions {
  margin-top: 14px;
}
</style>
