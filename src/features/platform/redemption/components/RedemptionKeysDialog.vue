<script setup lang="ts">
import { computed } from 'vue';
import { ElMessage } from 'element-plus';
import { CopyDocument, Download } from '@element-plus/icons-vue';

const visible = defineModel<boolean>('visible', { required: true });
const emit = defineEmits<{ (e: 'closed'): void }>();
const props = defineProps<{ keys: string[]; batchName?: string }>();

const title = computed(() => (props.keys.length > 1 ? `已生成 ${props.keys.length} 个兑换码` : '兑换码已发布'));

async function copyAll(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.keys.join('\n'));
    ElMessage.success('已复制全部');
  } catch {
    ElMessage.error('复制失败');
  }
}

function downloadTxt(): void {
  const blob = new Blob([props.keys.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(props.batchName || 'redemption').replace(/\s+/g, '-')}-keys.txt`;
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="title"
    width="520px"
    align-center
    append-to-body
    :close-on-click-modal="false"
    @closed="emit('closed')"
  >
    <el-alert
      type="warning"
      :closable="false"
      show-icon
      title="请立即保存"
      description="关闭后列表只显示脱敏 Key，完整明文不再提供。"
      class="alert"
    />
    <ul class="keys">
      <li
        v-for="(k, idx) in keys"
        :key="`${idx}-${k}`"
      >
        <code>{{ k }}</code>
      </li>
    </ul>
    <template #footer>
      <el-button
        :icon="Download"
        @click="downloadTxt"
      >
        下载 .txt
      </el-button>
      <el-button
        type="primary"
        :icon="CopyDocument"
        @click="copyAll"
      >
        复制全部
      </el-button>
      <el-button @click="visible = false">
        我已保存
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.alert {
  margin-bottom: 16px;
}
.keys {
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 280px;
  overflow: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: #f8fafc;
}
.keys li {
  padding: 10px 14px;
  border-bottom: 1px solid var(--el-border-color-extra-light);
}
.keys li:last-child {
  border-bottom: none;
}
.keys code {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 13px;
  word-break: break-all;
}
</style>
