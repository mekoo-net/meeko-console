<script setup lang="ts">
/**
 * 等宽显示的 id + 复制按钮。traceId / 会话 / 账单号都要拿去别处查，手选很容易选不全。
 */
import { CopyDocument } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

const props = withDefaults(
  defineProps<{
    value: string | number | null | undefined;
    /** 复制成功提示里的名字。 */
    label?: string;
    /** 列表里只露一段，完整值放 title。 */
    display?: string;
  }>(),
  { label: '', display: undefined },
);

async function copy(): Promise<void> {
  if (props.value == null || props.value === '') return;
  try {
    await navigator.clipboard.writeText(String(props.value));
    ElMessage.success(props.label ? `${props.label} 已复制` : '已复制');
  } catch {
    ElMessage.warning('复制失败，请手动复制');
  }
}
</script>

<template>
  <span
    v-if="value != null && value !== ''"
    class="copyable-id"
  >
    <span
      class="copyable-id__text"
      :title="String(value)"
    >{{ display ?? value }}</span>
    <el-button
      :icon="CopyDocument"
      link
      size="small"
      class="copyable-id__btn"
      :title="label ? `复制 ${label}` : '复制'"
      @click.stop="copy"
    />
  </span>
  <span
    v-else
    class="copyable-id copyable-id--empty"
  >—</span>
</template>

<style scoped>
.copyable-id {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
  max-width: 100%;
}

.copyable-id__text {
  overflow: hidden;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.copyable-id__btn {
  flex-shrink: 0;
  padding: 0 2px;
  color: var(--el-text-color-secondary);
}

.copyable-id__btn:hover {
  color: var(--el-color-primary);
}

.copyable-id--empty {
  color: var(--el-text-color-placeholder);
}
</style>
