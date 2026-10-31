<script setup lang="ts">
/**
 * 导入的卡，和玩家在客户端里看到的一样分条：人设是按顺序绑的预设，另可挂额外描述；
 * 世界书是作用到这个角色的条目，每条标出是全局的还是指定这个角色的。都点开看正文。
 */
import { computed } from 'vue';

import type { ImportedCardContent } from '../../model/content.types';
import { promptItems, worldBookItems } from '../../model/promptEntries';
import PromptEntryList from './PromptEntryList.vue';

const props = defineProps<{ content: ImportedCardContent }>();

const presets = computed(() => promptItems(props.content.presets));
const extras = computed(() => promptItems(props.content.extraDescriptions));
const worldBook = computed(() => worldBookItems(props.content.worldBook));
</script>

<template>
  <h4 class="section-title">
    预设
  </h4>
  <PromptEntryList
    :entries="presets"
    empty="没绑预设，按名字和简介扮演"
  />

  <template v-if="extras.length">
    <h4 class="section-title section-title--gap">
      额外描述
    </h4>
    <PromptEntryList
      :entries="extras"
      empty=""
    />
  </template>

  <h4 class="section-title section-title--gap">
    世界书
  </h4>
  <PromptEntryList
    :entries="worldBook"
    empty="没有作用到这个角色的条目"
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
