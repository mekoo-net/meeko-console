<script setup lang="ts">
interface Props {
  /** 为 true 时仅展示占位区（不传 header / toolbar / 默认插槽） */
  showPlaceholder?: boolean;
}

withDefaults(defineProps<Props>(), {
  showPlaceholder: false,
});
</script>

<template>
  <section class="provider-detail">
    <div v-if="showPlaceholder" class="provider-detail__placeholder">
      <slot name="placeholder">
        <span class="provider-detail__placeholder-hint">请选择左侧供应商组</span>
      </slot>
    </div>
    <template v-else>
      <header v-if="$slots.header" class="provider-detail__header">
        <slot name="header" />
      </header>
      <div v-if="$slots.toolbar" class="provider-detail__toolbar">
        <slot name="toolbar" />
      </div>
      <div class="provider-detail__body">
        <slot />
      </div>
    </template>
  </section>
</template>
