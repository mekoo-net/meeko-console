<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';

import type { IssueVouchersResult, VoucherTemplate } from '../model/voucher.types';
import { getVoucherPort } from '../services';

const props = defineProps<{
  modelValue: boolean;
  template?: VoucherTemplate | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  issued: [result: IssueVouchersResult];
}>();

const port = getVoucherPort();
const raw = ref('');
const submitting = ref(false);

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

watch(
  () => props.modelValue,
  (open) => {
    if (open) raw.value = '';
  },
);

function parseUids(): string[] {
  return Array.from(
    new Set(
      raw.value
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter((s) => /^\d+$/.test(s)),
    ),
  );
}

const count = computed(() => parseUids().length);

async function onSubmit(): Promise<void> {
  if (!props.template) return;
  const accountUids = parseUids();
  if (accountUids.length === 0) {
    ElMessage.warning('请输入至少一个有效的账户 UID');
    return;
  }

  submitting.value = true;
  try {
    const r = await port.issue(props.template.id, { accountUids });
    if (r.success) {
      ElMessage.success(`已发放 ${r.data.issuedCount} / ${r.data.requestedCount} 张`);
      emit('issued', r.data);
      visible.value = false;
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    title="下发代金券"
    width="560px"
    destroy-on-close
  >
    <el-alert
      v-if="template"
      :title="`券批次：${template.name}`"
      type="info"
      :closable="false"
      show-icon
      class="mb"
    />
    <el-form label-width="96px">
      <el-form-item label="账户 UID">
        <el-input
          v-model="raw"
          type="textarea"
          :rows="6"
          placeholder="支持换行、逗号、空格分隔，例如：&#10;100001&#10;100002"
        />
      </el-form-item>
      <el-form-item label="">
        <span class="hint">已识别 {{ count }} 个有效 UID（重复自动去重，重复下发幂等不重复）</span>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">
        取消
      </el-button>
      <el-button
        type="primary"
        :loading="submitting"
        :disabled="count === 0"
        @click="onSubmit"
      >
        发放
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.mb {
  margin-bottom: 16px;
}
.hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
