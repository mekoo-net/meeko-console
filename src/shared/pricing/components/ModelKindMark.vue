<script setup lang="ts">
/**
 * 模型类型标记。new-api / sub2api 价格表那一列是色块 icon + 短名（LLM / 向量 / 图像），
 * 不是「按量计费」这种胶囊——计量方式已经写在价格列单位里了。
 */
import type { Component } from 'vue';
import {
  ChatDotRound,
  Coin,
  Grid,
  Headset,
  Medal,
  Microphone,
  Picture,
  VideoCamera,
} from '@element-plus/icons-vue';

import { MODEL_KIND, type PriceModelKind } from '../model/priceTable';

interface Props {
  kind: PriceModelKind;
  /** 只画色块、不跟短名。表格那列默认带名。 */
  iconOnly?: boolean;
}

withDefaults(defineProps<Props>(), { iconOnly: false });

const ICON: Readonly<Record<PriceModelKind, Component>> = {
  per_token: ChatDotRound,
  embedding: Grid,
  per_image: Picture,
  per_video: VideoCamera,
  per_audio_minute: Headset,
  per_character: Microphone,
  per_call: Coin,
  per_credit: Medal,
};
</script>

<template>
  <el-tooltip :content="MODEL_KIND[kind].hint" placement="top" :show-after="400">
    <span class="kind" :data-kind="kind">
      <span class="kind__icon">
        <el-icon :size="14"><component :is="ICON[kind]" /></el-icon>
      </span>
      <span v-if="!iconOnly" class="kind__label">{{ MODEL_KIND[kind].label }}</span>
    </span>
  </el-tooltip>
</template>

<style scoped>
.kind {
  display: inline-grid;
  grid-template-columns: 26px max-content;
  column-gap: 7px;
  align-items: center;
  justify-content: start;
  min-width: 0;
}
.kind__icon {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.kind__label {
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
  line-height: 1;
}

.kind[data-kind='per_token'] .kind__icon {
  color: #4f46e5;
  background: color-mix(in srgb, #4f46e5 14%, transparent);
}
.kind[data-kind='per_token'] .kind__label {
  color: #4f46e5;
}
.kind[data-kind='embedding'] .kind__icon {
  color: #0891b2;
  background: color-mix(in srgb, #0891b2 14%, transparent);
}
.kind[data-kind='embedding'] .kind__label {
  color: #0891b2;
}
.kind[data-kind='per_image'] .kind__icon {
  color: #059669;
  background: color-mix(in srgb, #059669 14%, transparent);
}
.kind[data-kind='per_image'] .kind__label {
  color: #059669;
}
.kind[data-kind='per_video'] .kind__icon {
  color: #d97706;
  background: color-mix(in srgb, #d97706 14%, transparent);
}
.kind[data-kind='per_video'] .kind__label {
  color: #d97706;
}
.kind[data-kind='per_audio_minute'] .kind__icon {
  color: #0284c7;
  background: color-mix(in srgb, #0284c7 14%, transparent);
}
.kind[data-kind='per_audio_minute'] .kind__label {
  color: #0284c7;
}
.kind[data-kind='per_character'] .kind__icon {
  color: #0d9488;
  background: color-mix(in srgb, #0d9488 14%, transparent);
}
.kind[data-kind='per_character'] .kind__label {
  color: #0d9488;
}
.kind[data-kind='per_call'] .kind__icon {
  color: #e11d48;
  background: color-mix(in srgb, #e11d48 14%, transparent);
}
.kind[data-kind='per_call'] .kind__label {
  color: #e11d48;
}
.kind[data-kind='per_credit'] .kind__icon {
  color: #c026d3;
  background: color-mix(in srgb, #c026d3 14%, transparent);
}
.kind[data-kind='per_credit'] .kind__label {
  color: #c026d3;
}
</style>
