<script setup lang="ts">
import { computed, useSlots } from 'vue';

const props = defineProps<{
  modelValue: boolean;
  title?: string;
  width?: string;
  top?: string;
}>();

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();

const slots = useSlots();

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="title"
    :width="width ?? '80%'"
    :top="top ?? '10vh'"
    destroy-on-close
    class="lg-dialog"
  >
    <template
      v-if="slots.header"
      #header
    >
      <slot name="header" />
    </template>

    <slot />

    <template
      v-if="slots.footer"
      #footer
    >
      <slot name="footer" />
    </template>
  </el-dialog>
</template>

<style>
/* 非 scoped：el-dialog 根节点被 Teleport 到 body，lg-dialog 类直接落在 .el-dialog 上，
   scoped 后代选择器命不中。用固定类名做全局约束，供所有「二级页面」弹窗复用。
   内容区用 flex 撑满；需要填满高度的表格加 class="lg-fill" 即可。 */
.lg-dialog.el-dialog {
  display: flex;
  flex-direction: column;
  height: 80vh;
}
.lg-dialog .el-dialog__body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.lg-dialog .lg-fill {
  flex: 1;
  min-height: 0;
}
</style>
