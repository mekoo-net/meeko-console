<script setup lang="ts">
import { ref } from 'vue';
import { Delete, Upload } from '@element-plus/icons-vue';

import { IMAGE_MIMES, imageSrc } from '../model/activity.types';

/** 固定位置的一张图（封面 / Hero）：按目标比例预览，点一下上传或替换。 */
defineProps<{
  label: string;
  hint: string;
  ratio: number;
  url: string | null;
  placeholder: string;
  uploading?: boolean;
}>();

const emit = defineEmits<{ upload: [file: File]; remove: [] }>();

const input = ref<HTMLInputElement>();

function onChosen(e: Event): void {
  const el = e.target as HTMLInputElement;
  const file = el.files?.[0];
  el.value = '';
  if (file) emit('upload', file);
}
</script>

<template>
  <div class="image-slot">
    <div class="image-slot__head">
      <span class="image-slot__label">{{ label }}</span>
      <span class="image-slot__hint">{{ hint }}</span>
    </div>
    <div
      class="image-slot__frame"
      :style="{ aspectRatio: String(ratio), background: url ? undefined : placeholder }"
      @click="input?.click()"
    >
      <img
        v-if="url"
        :src="imageSrc(url)!"
        alt=""
      >
      <span
        v-else
        class="image-slot__empty"
      >点击上传</span>
      <div
        class="image-slot__ops"
        @click.stop
      >
        <el-button
          size="small"
          :icon="Upload"
          :loading="uploading"
          @click="input?.click()"
        >
          {{ url ? '替换' : '上传' }}
        </el-button>
        <el-button
          v-if="url"
          size="small"
          :icon="Delete"
          @click="emit('remove')"
        />
      </div>
    </div>
    <input
      ref="input"
      type="file"
      :accept="IMAGE_MIMES.join(',')"
      hidden
      @change="onChosen"
    >
  </div>
</template>

<style scoped>
.image-slot__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}
.image-slot__label {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.image-slot__hint {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.image-slot__frame {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  border-radius: 10px;
  border: 1px dashed var(--el-border-color);
  overflow: hidden;
  cursor: pointer;
}
.image-slot__frame img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.image-slot__empty {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.image-slot__ops {
  position: absolute;
  right: 6px;
  bottom: 6px;
  display: flex;
  gap: 4px;
}
</style>
