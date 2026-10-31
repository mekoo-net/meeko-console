<script setup lang="ts">
/**
 * 世界设定：叙事预设、管线模型、补全参数，都是玩家端存的 JSON，原样看。
 * 预设里的 `systemPrompt` 是一大段正文，先按原文排一份，下面再给整份 JSON。
 */
import type { WorldSettings } from '../../model/content.types';
import JsonBlock from './JsonBlock.vue';

defineProps<{ settings: WorldSettings }>();
</script>

<template>
  <div class="pane">
    <h4 class="section-title">
      叙事预设
    </h4>
    <div
      v-if="settings.preset.systemPrompt?.trim()"
      class="text-block"
    >
      {{ settings.preset.systemPrompt }}
    </div>
    <JsonBlock :value="settings.preset" />

    <el-divider />

    <h4 class="section-title">
      模型
    </h4>
    <JsonBlock
      v-if="settings.pipelineModels != null"
      :value="settings.pipelineModels"
    />
    <span
      v-else
      class="cell-muted"
    >未设置</span>

    <el-divider />

    <h4 class="section-title">
      补全参数
    </h4>
    <JsonBlock
      v-if="settings.completion != null"
      :value="settings.completion"
    />
    <span
      v-else
      class="cell-muted"
    >未设置</span>
  </div>
</template>

<style scoped>
.pane {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  font-size: 13px;
  line-height: 1.6;
}

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
