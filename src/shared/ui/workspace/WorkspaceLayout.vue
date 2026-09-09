<script setup lang="ts">
import './workspace.css';

defineProps<{ loading?: boolean }>();
</script>

<template>
  <div class="provider-page">
    <slot name="header" />
    <div
      v-loading="loading"
      class="provider-page__workspace"
    >
      <slot />
    </div>
  </div>
</template>
