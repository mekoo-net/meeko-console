<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Delete, DocumentCopy, Plus, Position } from '@element-plus/icons-vue';

import { ACTIVITY_LIMITS, ASSET_NAME_PATTERN, IMAGE_MIMES, imageSrc, type EditableAsset } from '../model/activity.types';

const assets = defineModel<EditableAsset[]>({ required: true });

const emit = defineEmits<{
  upload: [files: File[]];
  insert: [reference: string];
}>();

const input = ref<HTMLInputElement>();

const full = computed(() => assets.value.length >= ACTIVITY_LIMITS.assets);

const duplicates = computed(() => {
  const seen = new Map<string, number>();
  for (const a of assets.value) seen.set(a.name, (seen.get(a.name) ?? 0) + 1);
  return new Set([...seen].filter(([, n]) => n > 1).map(([name]) => name));
});

function nameError(a: EditableAsset): string | null {
  if (!ASSET_NAME_PATTERN.test(a.name)) return '只能用小写字母、数字和 -';
  if (duplicates.value.has(a.name)) return '名字重复';
  return null;
}

function onChosen(e: Event): void {
  const el = e.target as HTMLInputElement;
  const files = Array.from(el.files ?? []);
  el.value = '';
  if (files.length) emit('upload', files);
}

async function copyRef(a: EditableAsset): Promise<void> {
  try {
    await navigator.clipboard.writeText(`asset:${a.name}`);
    ElMessage.success(`已复制 asset:${a.name}`);
  } catch {
    ElMessage.warning('复制失败，请手动输入');
  }
}

function remove(index: number): void {
  assets.value.splice(index, 1);
}
</script>

<template>
  <div class="assets">
    <div class="assets__head">
      <span class="assets__title">素材库 <em>{{ assets.length }}/{{ ACTIVITY_LIMITS.assets }}</em></span>
      <el-button
        size="small"
        :icon="Plus"
        :disabled="full"
        @click="input?.click()"
      >
        上传素材
      </el-button>
      <input
        ref="input"
        type="file"
        multiple
        :accept="IMAGE_MIMES.join(',')"
        hidden
        @change="onChosen"
      >
    </div>

    <div
      v-if="assets.length"
      class="assets__grid"
    >
      <div
        v-for="(a, i) in assets"
        :key="a.uid"
        class="asset"
      >
        <div
          v-loading="a.uploading"
          class="asset__thumb"
        >
          <img
            v-if="a.url"
            :src="imageSrc(a.url)!"
            alt=""
          >
        </div>
        <el-tooltip
          :content="nameError(a) ?? ''"
          :disabled="!nameError(a)"
          placement="top"
        >
          <el-input
            v-model="a.name"
            size="small"
            :maxlength="ACTIVITY_LIMITS.assetName"
            :class="{ 'asset__name--bad': nameError(a) }"
          >
            <template #prefix>
              <span class="asset__prefix">asset:</span>
            </template>
          </el-input>
        </el-tooltip>
        <div class="asset__ops">
          <el-tooltip content="插入">
            <el-button
              size="small"
              text
              :icon="Position"
              :disabled="a.uploading"
              @click="emit('insert', `asset:${a.name}`)"
            />
          </el-tooltip>
          <el-tooltip content="复制引用">
            <el-button
              size="small"
              text
              :icon="DocumentCopy"
              @click="copyRef(a)"
            />
          </el-tooltip>
          <el-tooltip content="删除">
            <el-button
              size="small"
              text
              type="danger"
              :icon="Delete"
              @click="remove(i)"
            />
          </el-tooltip>
        </div>
      </div>
    </div>
    <div
      v-else
      class="assets__empty"
    >
      暂无素材
    </div>
  </div>
</template>

<style scoped>
.assets__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.assets__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.assets__title em {
  margin-left: 4px;
  font-style: normal;
  font-weight: 400;
  color: var(--el-text-color-secondary);
}
.assets__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.asset {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-blank);
}
.asset__thumb {
  display: grid;
  place-items: center;
  aspect-ratio: 4 / 3;
  border-radius: 6px;
  overflow: hidden;
  background:
    conic-gradient(#f2f2f5 25%, #fff 0 50%, #f2f2f5 0 75%, #fff 0) 0 0 / 14px 14px;
}
.asset__thumb img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.asset__prefix {
  font-family: var(--el-font-family-mono, monospace);
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.asset :deep(.el-input__inner) {
  font-family: var(--el-font-family-mono, monospace);
  font-size: 12px;
}
.asset__name--bad :deep(.el-input__wrapper) {
  box-shadow: 0 0 0 1px var(--el-color-danger) inset;
}
.asset__ops {
  display: flex;
  justify-content: flex-end;
}
.asset__ops .el-button + .el-button {
  margin-left: 0;
}
.assets__empty {
  padding: 18px 12px;
  border-radius: 8px;
  border: 1px dashed var(--el-border-color);
  font-size: 12px;
  text-align: center;
  color: var(--el-text-color-secondary);
}
</style>
