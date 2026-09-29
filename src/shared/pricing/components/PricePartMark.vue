<script setup lang="ts">
/**
 * 价格格标签。入/出用 ↓↑；缓存跟入出不是同一件事——
 * 写是铅笔（写入缓存），读是打开阅读（从缓存取）。
 * 图像 / 视频档位写在价格格的 caption 槽，这里只画固定尺寸的 icon。
 */
import type { Component } from 'vue';
import {
  Cpu,
  EditPen,
  Download,
  Headset,
  Microphone,
  Picture,
  Reading,
  Ticket,
  Upload,
  VideoCamera,
} from '@element-plus/icons-vue';

import type { PricePartKind } from '../model/priceTable';

interface Props {
  kind: PricePartKind;
  label: string;
}

defineProps<Props>();

const ICON: Readonly<Record<PricePartKind, Component>> = {
  input: Download,
  output: Upload,
  cacheWrite: EditPen,
  cacheRead: Reading,
  audioIn: Headset,
  audioOut: Microphone,
  reasoning: Cpu,
  image: Picture,
  video: VideoCamera,
  call: Ticket,
};
</script>

<template>
  <el-tooltip :content="label" placement="top" :show-after="300">
    <span class="picon" :data-kind="kind">
      <el-icon :size="14"><component :is="ICON[kind]" /></el-icon>
    </span>
  </el-tooltip>
</template>

<style scoped>
.picon {
  display: inline-flex;
  width: 16px;
  height: 16px;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-secondary);
}

.picon[data-kind='input'] {
  color: #16a34a;
}
.picon[data-kind='output'] {
  color: #2563eb;
}
.picon[data-kind='cacheWrite'] {
  color: #d97706;
}
.picon[data-kind='cacheRead'] {
  color: #0891b2;
}
.picon[data-kind='audioIn'],
.picon[data-kind='audioOut'] {
  color: #7c3aed;
}
.picon[data-kind='reasoning'] {
  color: #4f46e5;
}
.picon[data-kind='image'] {
  color: #059669;
}
.picon[data-kind='video'] {
  color: #d97706;
}
.picon[data-kind='call'] {
  color: #e11d48;
}
</style>
