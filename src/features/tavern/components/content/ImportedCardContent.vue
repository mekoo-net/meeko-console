<script setup lang="ts">
/**
 * 导入的卡：人设和角色世界书是玩家自己写的 JSON，原样给；`systemPrompt` 是一大段正文，单独按原文排一份方便读。
 */
import type { ImportedCardContent } from '../../model/content.types';
import JsonBlock from './JsonBlock.vue';

defineProps<{ content: ImportedCardContent }>();
</script>

<template>
  <h4 class="section-title">
    人设
  </h4>
  <div
    v-if="content.preset.systemPrompt?.trim()"
    class="text-block"
  >
    {{ content.preset.systemPrompt }}
  </div>
  <JsonBlock :value="content.preset" />

  <el-divider />

  <h4 class="section-title">
    角色世界书
  </h4>
  <JsonBlock
    v-if="content.worldBook.length"
    :value="content.worldBook"
  />
  <span
    v-else
    class="cell-muted"
  >无</span>
</template>

<style scoped>
.section-title {
  margin: 6px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}

.text-block {
  margin-bottom: 8px;
  padding: 8px 10px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  font-size: 12.5px;
  color: var(--el-text-color-regular);
  white-space: pre-wrap;
  word-break: break-word;
}

.cell-muted {
  color: var(--el-text-color-placeholder);
}
</style>
