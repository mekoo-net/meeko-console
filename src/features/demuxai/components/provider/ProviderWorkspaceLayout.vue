<script setup lang="ts">
import './providerWorkspace.css';

interface Props {
  loading?: boolean;
}

defineProps<Props>();
</script>

<template>
  <div class="provider-page">
    <slot name="header" />
    <div v-loading="loading" class="provider-page__workspace">
      <slot />
    </div>
  </div>
</template>
