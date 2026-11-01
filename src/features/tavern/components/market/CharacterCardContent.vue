<script setup lang="ts">
/**
 * 角色卡商品在卖的那一版：开场白、预设、描写，同客户端角色卡页的叫法；预设和描写按条目，点开看正文。
 */
import { computed } from 'vue';

import type { CharacterCardContent } from '../../model/market.types';
import { presetItems, worldBookItems } from '../../model/promptEntries';
import PromptEntryList from '../content/PromptEntryList.vue';

const props = defineProps<{ content: CharacterCardContent }>();

const presets = computed(() => presetItems(props.content.preset));
const descriptions = computed(() => worldBookItems(props.content.worldBook));
</script>

<template>
  <h4 class="section-title">
    开场白
  </h4>
  <div
    v-for="(greeting, i) in content.character.greetings"
    :key="i"
    class="greeting"
  >
    {{ greeting }}
  </div>
  <span
    v-if="!content.character.greetings.length"
    class="cell-muted"
  >没写开场白</span>

  <h4 class="section-title section-title--gap">
    预设
  </h4>
  <PromptEntryList
    :entries="presets"
    empty="没写预设"
  />

  <h4 class="section-title section-title--gap">
    描写
  </h4>
  <PromptEntryList
    :entries="descriptions"
    empty="没有描写"
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
  margin-top: 18px;
}

.greeting {
  margin-bottom: 6px;
  padding: 8px 10px;
  border-radius: 4px;
  background: var(--el-fill-color-light);
  font-size: 13px;
  white-space: pre-wrap;
}

.cell-muted {
  color: var(--el-text-color-placeholder);
}
</style>
