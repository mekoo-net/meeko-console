<script setup lang="ts">
/**
 * 导入的卡，和客户端角色卡页一样三块：预设（按绑定顺序拼）、描写（客户端代码里叫 worldBook，界面叫描写，
 * 分全局的和角色专属的）、额外描述。每条一行，点开看正文。
 */
import { computed } from 'vue';

import type { ImportedCardContent } from '../../model/content.types';
import { promptItems, worldBookItems } from '../../model/promptEntries';
import PromptEntryList from './PromptEntryList.vue';

const props = defineProps<{ content: ImportedCardContent }>();

const presets = computed(() => promptItems(props.content.presets));
const descriptions = computed(() => worldBookItems(props.content.worldBook));
const extras = computed(() => promptItems(props.content.extraDescriptions));
</script>

<template>
  <h4 class="section-title">
    预设
  </h4>
  <PromptEntryList
    :entries="presets"
    empty="没绑预设"
  />

  <h4 class="section-title section-title--gap">
    描写
  </h4>
  <PromptEntryList
    :entries="descriptions"
    empty="没有描写"
  />

  <h4 class="section-title section-title--gap">
    额外描述
  </h4>
  <PromptEntryList
    :entries="extras"
    empty="没有额外描述"
  />
</template>

<style scoped>
.section-title {
  margin: 6px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}

.section-title--gap {
  margin-top: 16px;
}
</style>
