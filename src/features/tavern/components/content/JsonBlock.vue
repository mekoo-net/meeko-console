<script setup lang="ts">
/**
 * 存库 JSON 文档的只读展示：缩进好的原文 + 复制。要拿去排查或贴给玩家对照，所以给原样的 JSON，不做表格化。
 */
import { computed } from 'vue';
import { CopyDocument } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

import { jsonText } from '../../model/contentFormat';

const props = defineProps<{ value: unknown }>();

const text = computed(() => jsonText(props.value));

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(text.value);
    ElMessage.success('已复制');
  } catch {
    ElMessage.warning('复制失败，请手动复制');
  }
}
</script>

<template>
  <div class="json-block">
    <el-button
      :icon="CopyDocument"
      link
      size="small"
      class="json-block__copy"
      title="复制 JSON"
      @click="copy"
    />
    <pre class="json-block__text">{{ text }}</pre>
  </div>
</template>

<style scoped>
.json-block {
  position: relative;
  width: 100%;
}

.json-block__text {
  box-sizing: border-box;
  width: 100%;
  max-height: 360px;
  margin: 0;
  padding: 8px 32px 8px 10px;
  overflow: auto;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.55;
  color: var(--el-text-color-regular);
  white-space: pre-wrap;
  word-break: break-all;
}

.json-block__copy {
  position: absolute;
  top: 6px;
  right: 8px;
  padding: 0 2px;
  color: var(--el-text-color-secondary);
}

.json-block__copy:hover {
  color: var(--el-color-primary);
}
</style>
