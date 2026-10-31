<script setup lang="ts">
/**
 * 文字消息：服务端已按说话人切好段（场景里一条有好几个人轮流说），每段的心声单独一行。
 */
import type { TextBody } from '../../model/content.types';

defineProps<{ body: TextBody }>();
</script>

<template>
  <div class="msg-body">
    <div
      v-for="(seg, i) in body.segments"
      :key="i"
    >
      <span
        v-if="seg.speaker"
        class="seg__speaker"
      >{{ seg.speaker }}</span>
      <div class="seg__said">
        {{ seg.said }}
      </div>
      <div
        v-if="seg.inner"
        class="seg__inner"
      >
        心声：{{ seg.inner }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.msg-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.seg__speaker {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.seg__said {
  color: var(--el-text-color-regular);
  white-space: pre-wrap;
  word-break: break-word;
}

.seg__inner {
  margin-top: 4px;
  padding: 4px 10px;
  border-left: 2px solid var(--el-border-color);
  font-style: italic;
  color: var(--el-text-color-secondary);
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
