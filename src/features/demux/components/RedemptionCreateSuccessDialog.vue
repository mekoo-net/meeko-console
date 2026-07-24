<script setup lang="ts">
import { computed } from 'vue';
import { ElMessage } from 'element-plus';
import { CopyDocument, Download } from '@element-plus/icons-vue';

const visible = defineModel<boolean>('visible', { required: true });

const emit = defineEmits<{ (e: 'closed'): void }>();

const props = defineProps<{
  keys: string[];
  batchName?: string;
}>();

const title = computed(() =>
  props.keys.length > 1 ? `已生成 ${props.keys.length} 个激活码` : '激活码已发布',
);

async function copyAll(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.keys.join('\n'));
    ElMessage.success('已复制全部激活码');
  } catch {
    ElMessage.error('复制失败');
  }
}

function downloadTxt(): void {
  const body = props.keys.join('\n');
  const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(props.batchName || 'redemption').replace(/\s+/g, '-')}-keys.txt`;
  a.click();
  URL.revokeObjectURL(url);
  ElMessage.success('已开始下载');
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="title"
    width="520px"
    align-center
    append-to-body
    class="redemption-success-dialog"
    :close-on-click-modal="false"
    @closed="emit('closed')"
  >
    <el-alert
      type="warning"
      :closable="false"
      show-icon
      title="请立即保存激活码"
      description="关闭本窗口后，列表仅显示脱敏 Key。请复制或下载完整明文后再关闭。"
      class="success-alert"
    />

    <ul class="keys-list">
      <li v-for="(k, idx) in keys" :key="`${idx}-${k}`" class="keys-list__item">
        <code>{{ k }}</code>
      </li>
    </ul>

    <template #footer>
      <el-button :icon="Download" @click="downloadTxt">下载 .txt</el-button>
      <el-button type="primary" :icon="CopyDocument" @click="copyAll">复制全部</el-button>
      <el-button @click="visible = false">我已保存</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.success-alert {
  margin-bottom: 16px;
}
.keys-list {
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 280px;
  overflow: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: #f8fafc;
}
.keys-list__item {
  padding: 10px 14px;
  border-bottom: 1px solid var(--el-border-color-extra-light);
}
.keys-list__item:last-child {
  border-bottom: none;
}
.keys-list__item code {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 13px;
  word-break: break-all;
  color: #0f172a;
}
</style>
