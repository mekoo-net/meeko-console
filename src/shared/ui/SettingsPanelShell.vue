<script setup lang="ts">
defineProps<{
  title: string;
  description?: string;
}>();
</script>

<template>
  <div class="settings-panel">
    <header class="settings-panel__head">
      <div>
        <h3 class="settings-panel__title">{{ title }}</h3>
        <p v-if="description" class="settings-panel__desc">{{ description }}</p>
      </div>
      <div v-if="$slots.actions" class="settings-panel__head-actions">
        <slot name="actions" />
      </div>
    </header>

    <div class="settings-panel__body">
      <slot />
    </div>

    <footer v-if="$slots.footer" class="settings-panel__footer">
      <slot name="footer" />
    </footer>
  </div>
</template>

<style scoped src="./settings-panel.css"></style>
