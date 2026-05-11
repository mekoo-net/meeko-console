<script setup lang="ts"></script>

<template>
  <router-view />
</template>

<style>
:root {
  color-scheme: light;
}
html, body, #app {
  height: 100%;
}
body {
  margin: 0;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC',
    'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  background: var(--el-bg-color-page);
}
</style>
