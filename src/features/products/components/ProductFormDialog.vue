<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type { FormInstance, FormRules } from 'element-plus';

import type {
  BillingModeCode,
  BillingProduct,
  RegisterProductInput,
  SubscriptionPeriodCode,
  UpdateProductInput,
} from '../model/product.types';
import { billingModeOptions, periodOptions } from '../model/product.types';

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
  billingMode: 'payg_call' as BillingModeCode,
  unitPrice: 0,
  unit: 'credit',
  period: null as SubscriptionPeriodCode | null,
  metadataJson: '',
});

const rules: FormRules = {
  code: [{ required: true, message: '请输入产品代码', trigger: 'blur' }],
  domain: [{ required: true, message: '请输入业务域', trigger: 'blur' }],
  displayName: [{ required: true, message: '请输入展示名称', trigger: 'blur' }],
  unit: [{ required: true, message: '请输入计量单位', trigger: 'blur' }],
};

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

const showPeriod = computed(() => form.billingMode === 'subscription');

watch(
  () => [props.modelValue, props.mode, props.product] as const,
  ([open, mode, product]) => {
    if (!open) return;
    if (mode === 'edit' && product) {
      form.code = product.code;
      form.domain = product.domain;
      form.displayName = product.displayName;
      form.billingMode = product.billingMode;
      form.unitPrice = product.unitPrice;
      form.unit = product.unit;
      form.period = product.period ?? null;
      form.metadataJson = product.metadataJson ?? '';
      return;
    }
    form.code = '';
    form.domain = '';
    form.displayName = '';
    form.billingMode = 'payg_call';
    form.unitPrice = 0;
    form.unit = 'credit';
    form.period = null;
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
      billingMode: form.billingMode,
      unitPrice: form.unitPrice,
      unit: form.unit.trim(),
      period: showPeriod.value ? form.period : null,
      metadataJson: form.metadataJson.trim() || null,
    });
    return;
  }

  emit('submit', {
    displayName: form.displayName.trim(),
    unitPrice: form.unitPrice,
    unit: form.unit.trim(),
    period: showPeriod.value ? form.period : null,
    clearPeriod: !showPeriod.value,
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
      <el-form-item label="计费模式">
        <el-select v-model="form.billingMode" :disabled="mode === 'edit'" style="width: 100%">
          <el-option
            v-for="opt in billingModeOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="单价">
        <el-input-number v-model="form.unitPrice" :min="0" :precision="6" style="width: 100%" />
      </el-form-item>
      <el-form-item label="计量单位" prop="unit">
        <el-input v-model="form.unit" placeholder="如 credit / hour / seat" />
      </el-form-item>
      <el-form-item v-if="showPeriod" label="订阅周期">
        <el-select v-model="form.period" clearable placeholder="选择周期" style="width: 100%">
          <el-option
            v-for="opt in periodOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
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
