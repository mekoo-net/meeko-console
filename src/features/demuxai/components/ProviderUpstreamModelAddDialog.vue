<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { FormInstance, FormRules } from 'element-plus';

import type { CreateUpstreamModelInput } from '../model/catalog.types';

interface Props {
  modelValue: boolean;
  queueGroup: string;
  displayName: string;
  loading: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'submit', payload: CreateUpstreamModelInput): void;
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

interface FormState {
  upstreamModelId: string;
  label: string;
}

const form = ref<FormState>({ upstreamModelId: '', label: '' });
const formRef = ref<FormInstance | null>(null);

const rules: FormRules<FormState> = {
  upstreamModelId: [{ required: true, message: '请填写上游模型 ID', trigger: 'blur' }],
};

watch(
  () => props.modelValue,
  (open) => {
    if (open) form.value = { upstreamModelId: '', label: '' };
  },
);

function onSubmit(): void {
  formRef.value?.validate((valid) => {
    if (!valid) return;
    emit('submit', {
      queueGroup: props.queueGroup,
      upstreamModelId: form.value.upstreamModelId.trim(),
      label: form.value.label.trim() || undefined,
    });
  });
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="`添加上游模型 · ${displayName}`"
    width="480px"
    destroy-on-close
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="100px" @submit.prevent>
      <el-form-item label="QueueGroup">
        <span class="mono">{{ queueGroup }}</span>
      </el-form-item>
      <el-form-item label="模型 ID" prop="upstreamModelId">
        <el-input
          v-model="form.upstreamModelId"
          placeholder="上游 HTTP body 的 model 字段"
          class="mono"
        />
      </el-form-item>
      <el-form-item label="展示标签">
        <el-input v-model="form.label" placeholder="可选，默认同模型 ID" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="loading" @click="onSubmit">添加</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 13px;
}
</style>
