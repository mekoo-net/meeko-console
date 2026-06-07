<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type { FormInstance, FormRules } from 'element-plus';

import type { BillingProduct, UpdateProductInput } from '../model/product.types';

const props = defineProps<{
  modelValue: boolean;
  product?: BillingProduct | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  submit: [payload: UpdateProductInput];
}>();

const formRef = ref<FormInstance>();
const form = reactive({
  code: '',
  displayName: '',
  metadataJson: '',
});

const rules: FormRules = {
  displayName: [{ required: true, message: '请输入展示名称', trigger: 'blur' }],
};

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

watch(
  () => [props.modelValue, props.product] as const,
  ([open, product]) => {
    if (!open || !product) return;
    form.code = product.code;
    form.displayName = product.displayName;
    form.metadataJson = product.metadataJson ?? '';
  },
  { immediate: true },
);

async function onSubmit(): Promise<void> {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;

  emit('submit', {
    displayName: form.displayName.trim(),
    metadataJson: form.metadataJson.trim() || null,
  });
}
</script>

<template>
  <el-dialog v-model="visible" title="编辑计费产品" width="560px" destroy-on-close>
    <el-form ref="formRef" :model="form" :rules="rules" label-width="108px">
      <el-form-item label="产品代码">
        <el-input v-model="form.code" disabled />
      </el-form-item>
      <el-form-item label="展示名称" prop="displayName">
        <el-input v-model="form.displayName" placeholder="平台展示名称" />
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
