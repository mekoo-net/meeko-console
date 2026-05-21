<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { FormInstance, FormRules } from 'element-plus';

import type { CreateProviderGroupInput } from '../model/catalog.types';

interface Props {
  modelValue: boolean;
  loading: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'submit', payload: CreateProviderGroupInput): void;
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

interface FormState {
  queueGroup: string;
  displayName: string;
  notes: string;
}

const form = ref<FormState>({ queueGroup: '', displayName: '', notes: '' });
const formRef = ref<FormInstance | null>(null);

const rules: FormRules<FormState> = {
  queueGroup: [
    { required: true, message: '请填写 QueueGroup', trigger: 'blur' },
    {
      pattern: /^[a-z][a-z0-9_-]{1,62}$/,
      message: '小写字母开头，仅 a-z、0-9、_、-',
      trigger: 'blur',
    },
  ],
  displayName: [{ required: true, message: '请填写展示名', trigger: 'blur' }],
};

watch(
  () => props.modelValue,
  (open) => {
    if (open) form.value = { queueGroup: '', displayName: '', notes: '' };
  },
);

function onSubmit(): void {
  formRef.value?.validate((valid) => {
    if (!valid) return;
    emit('submit', {
      queueGroup: form.value.queueGroup.trim().toLowerCase(),
      displayName: form.value.displayName.trim(),
      notes: form.value.notes.trim() || null,
    });
  });
}
</script>

<template>
  <el-dialog v-model="visible" title="新建供应商组" width="480px" destroy-on-close>
    <el-form ref="formRef" :model="form" :rules="rules" label-width="110px" @submit.prevent>
      <el-form-item label="QueueGroup" prop="queueGroup">
        <el-input
          v-model="form.queueGroup"
          placeholder="如 my-proxy，对应 NATS gateway.chat.{group}"
          class="mono"
        />
        <div class="field-hint">与 Provider 进程 kiro.yaml 中 Nats.QueueGroup 一致</div>
      </el-form-item>
      <el-form-item label="展示名" prop="displayName">
        <el-input v-model="form.displayName" placeholder="运营可见名称" />
      </el-form-item>
      <el-form-item label="备注">
        <el-input v-model="form.notes" type="textarea" :rows="2" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="loading" @click="onSubmit">创建</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.field-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}
.mono :deep(input) {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}
</style>
