<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type { FormInstance, FormRules } from 'element-plus';

import type {
  BillingProduct,
  RegisterProductInput,
  UpdateProductInput,
} from '../model/product.types';

const props = defineProps<{
  modelValue: boolean;
  mode: 'create' | 'edit';
  product?: BillingProduct | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  submit: [payload: RegisterProductInput | UpdateProductInput];
}>();

const formRef = ref<FormInstance>();
const form = reactive({
  code: '',
  domain: '',
  displayName: '',
  metadataJson: '',
});

const rules: FormRules = {
  code: [{ required: true, message: '请输入产品代码', trigger: 'blur' }],
  domain: [{ required: true, message: '请输入业务域', trigger: 'blur' }],
  displayName: [{ required: true, message: '请输入展示名称', trigger: 'blur' }],
};

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

watch(
  () => [props.modelValue, props.mode, props.product] as const,
  ([open, mode, product]) => {
    if (!open) return;
    if (mode === 'edit' && product) {
      form.code = product.code;
      form.domain = product.domain;
      form.displayName = product.displayName;
      form.metadataJson = product.metadataJson ?? '';
      return;
    }
    form.code = '';
    form.domain = '';
    form.displayName = '';
    form.metadataJson = '';
  },
  { immediate: true },
);

async function onSubmit(): Promise<void> {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;

  if (props.mode === 'create') {
    emit('submit', {
      code: form.code.trim(),
      domain: form.domain.trim().toLowerCase(),
      displayName: form.displayName.trim(),
      metadataJson: form.metadataJson.trim() || null,
    });
    return;
  }

  emit('submit', {
    displayName: form.displayName.trim(),
    metadataJson: form.metadataJson.trim() || null,
  });
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="mode === 'create' ? '注册计费产品' : '编辑计费产品'"
    width="560px"
    destroy-on-close
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="108px">
      <el-form-item label="产品代码" prop="code">
        <el-input v-model="form.code" :disabled="mode === 'edit'" placeholder="如 demuxai.credit" />
      </el-form-item>
      <el-form-item label="业务域" prop="domain">
        <el-input
          v-model="form.domain"
          :disabled="mode === 'edit'"
          placeholder="如 demuxai（返利归属轴）"
        />
      </el-form-item>
      <el-form-item label="展示名称" prop="displayName">
        <el-input v-model="form.displayName" placeholder="如 DemuxAI" />
      </el-form-item>
      <el-form-item label="元数据 JSON">
        <el-input
          v-model="form.metadataJson"
          type="textarea"
          :rows="3"
          placeholder='可选，如 {"tier":"default"}'
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" @click="onSubmit">保存</el-button>
    </template>
  </el-dialog>
</template>
