<script setup lang="ts">
defineProps<{
  title: string;
  description: string;
}>();
</script>

<template>
  <el-empty :description="title">
    <template #default>
      <p class="settings-placeholder__desc">{{ description }}</p>
    </template>
  </el-empty>
</template>

<style scoped>
.settings-placeholder__desc {
  max-width: 420px;
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}
</style>
