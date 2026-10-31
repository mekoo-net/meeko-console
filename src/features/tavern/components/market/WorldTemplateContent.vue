<script setup lang="ts">
/**
 * 世界线商品在卖的那一版：一整套世界模板，按客户端世界设置的叫法分块——时间、叙事、世界书、规则书。
 * 叙事和设定按条目，点开看正文；规则书同世界详情里的变量表和规则表，只是模板没有当前值。
 */
import { computed } from 'vue';

import { TemplateTimeModeLabel, type WorldLineContent } from '../../model/market.types';
import { narrativeItems, worldBookNodeItems } from '../../model/promptEntries';
import PromptEntryList from '../content/PromptEntryList.vue';
import RulebookDocumentView from '../content/RulebookDocumentView.vue';
import { timePace } from '../../model/marketFormat';

const props = defineProps<{ content: WorldLineContent }>();

const narratives = computed(() => narrativeItems(props.content.world.narratives));
const settings = computed(() => worldBookNodeItems(props.content.world.worldBook.nodes));
const time = computed(() => props.content.world.time);
</script>

<template>
  <h4 class="section-title">
    时间
  </h4>
  <el-descriptions
    :column="2"
    border
    size="small"
    class="time"
  >
    <el-descriptions-item label="走法">
      {{ TemplateTimeModeLabel[time.mode] }}
      <span
        v-if="timePace(time)"
        class="sub"
      >{{ timePace(time) }}</span>
    </el-descriptions-item>
    <el-descriptions-item label="故事开始于">
      <span
        v-if="time.storyStart"
        class="mono"
      >{{ time.storyStart.replace('T', ' ') }}</span>
      <span
        v-else
        class="cell-muted"
      >世界的默认起点</span>
    </el-descriptions-item>
  </el-descriptions>

  <h4 class="section-title section-title--gap">
    叙事
    <span class="section-title__count">{{ narratives.length }} 段</span>
  </h4>
  <PromptEntryList
    :entries="narratives"
    empty="没有叙事"
  />

  <h4 class="section-title section-title--gap">
    世界书
    <span class="section-title__count">{{ settings.length }} 条设定</span>
  </h4>
  <PromptEntryList
    :entries="settings"
    empty="没有设定"
  />

  <h4 class="section-title section-title--gap">
    规则书
  </h4>
  <RulebookDocumentView :document="content.world.rulebook" />
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

.section-title__count {
  margin-left: 6px;
  font-size: 12px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
}

.time :deep(.el-descriptions__label) {
  width: 88px;
}

.sub {
  margin-left: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
}

.cell-muted {
  color: var(--el-text-color-placeholder);
}
</style>
