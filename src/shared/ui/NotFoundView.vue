<script setup lang="ts">
import { useRouter } from 'vue-router';
const router = useRouter();
</script>

<template>
  <div class="nf">
    <div class="nf__code">404</div>
    <div class="nf__title">页面不存在</div>
    <el-button type="primary" @click="router.replace('/')">返回首页</el-button>
  </div>
</template>

<style scoped>
.nf {
  height: 80vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--el-text-color-secondary);
}
.nf__code {
  font-size: 64px;
  font-weight: 700;
  color: #cbd5f5;
}
.nf__title {
  font-size: 14px;
}
</style>
