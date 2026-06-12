<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type { FormInstance, FormRules } from 'element-plus';

import {
  VoucherDeductKind,
  VoucherScopeKind,
  VoucherValidityKind,
  type CreateVoucherTemplateInput,
  type UpdateVoucherTemplateInput,
  type VoucherTemplate,
} from '../model/voucher.types';

const props = defineProps<{
  modelValue: boolean;
  template?: VoucherTemplate | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  create: [payload: CreateVoucherTemplateInput];
  update: [id: string, payload: UpdateVoucherTemplateInput];
}>();

const formRef = ref<FormInstance>();

interface FormState {
  name: string;
  deductKind: number;
  faceValue: number;
  thresholdAmount: number;
  discountRate: number;
  scopeKind: number;
  scopeProductCodes: string;
  validityKind: number;
  validRange: [Date, Date] | null;
  validDays: number;
  stackable: boolean;
  totalQuota: number | null;
  perUserLimit: number | null;
}

function emptyForm(): FormState {
  return {
    name: '',
    deductKind: VoucherDeductKind.NoThreshold,
    faceValue: 5,
    thresholdAmount: 0,
    discountRate: 90,
    scopeKind: VoucherScopeKind.AllProducts,
    scopeProductCodes: '',
    validityKind: VoucherValidityKind.RelativeDays,
    validRange: null,
    validDays: 30,
    stackable: false,
    totalQuota: null,
    perUserLimit: 1,
  };
}

const form = reactive<FormState>(emptyForm());

const isEdit = computed(() => !!props.template);
const dialogTitle = computed(() => (isEdit.value ? '编辑券批次' : '新建券批次'));

const rules: FormRules = {
  name: [{ required: true, message: '请输入券名称', trigger: 'blur' }],
};

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

watch(
  () => [props.modelValue, props.template] as const,
  ([open, template]) => {
    if (!open) return;
    Object.assign(form, emptyForm());
    if (template) {
      form.name = template.name;
      form.deductKind = template.deductKind;
      form.faceValue = template.faceValue;
      form.thresholdAmount = template.thresholdAmount;
      form.discountRate = template.discountRate != null ? template.discountRate * 100 : 90;
      form.scopeKind = template.scopeKind;
      form.scopeProductCodes = template.scopeProductCodes.join(', ');
      form.validityKind = template.validityKind;
      form.validRange =
        template.validFromUtc && template.validToUtc
          ? [new Date(template.validFromUtc), new Date(template.validToUtc)]
          : null;
      form.validDays = template.validDays ?? 30;
      form.stackable = template.stackable;
      form.totalQuota = template.totalQuota ?? null;
      form.perUserLimit = template.perUserLimit ?? null;
    }
  },
  { immediate: true },
);

function scopeCodes(): string[] {
  return form.scopeKind === VoucherScopeKind.SpecificProducts
    ? form.scopeProductCodes
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
}

function validityFields(): { validFromUtc: string | null; validToUtc: string | null; validDays: number | null } {
  if (form.validityKind === VoucherValidityKind.Absolute) {
    return {
      validFromUtc: form.validRange?.[0] ? form.validRange[0].toISOString() : null,
      validToUtc: form.validRange?.[1] ? form.validRange[1].toISOString() : null,
      validDays: null,
    };
  }
  return { validFromUtc: null, validToUtc: null, validDays: form.validDays };
}

async function onSubmit(): Promise<void> {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;

  const validity = validityFields();

  if (isEdit.value && props.template) {
    const payload: UpdateVoucherTemplateInput = {
      name: form.name.trim(),
      scopeKind: form.scopeKind,
      scopeProductCodes: scopeCodes(),
      validityKind: form.validityKind,
      ...validity,
      stackable: form.stackable,
      totalQuota: form.totalQuota,
      perUserLimit: form.perUserLimit,
    };
    emit('update', props.template.id, payload);
    return;
  }

  const payload: CreateVoucherTemplateInput = {
    name: form.name.trim(),
    deductKind: form.deductKind,
    faceValue: form.faceValue,
    thresholdAmount: form.deductKind === VoucherDeductKind.NoThreshold ? 0 : form.thresholdAmount,
    discountRate: form.deductKind === VoucherDeductKind.Discount ? form.discountRate / 100 : null,
    scopeKind: form.scopeKind,
    scopeProductCodes: scopeCodes(),
    validityKind: form.validityKind,
    ...validity,
    stackable: form.stackable,
    totalQuota: form.totalQuota,
    perUserLimit: form.perUserLimit,
  };
  emit('create', payload);
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="dialogTitle"
    width="620px"
    destroy-on-close
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="120px"
    >
      <el-form-item
        label="券名称"
        prop="name"
      >
        <el-input
          v-model="form.name"
          placeholder="如：新用户无门槛 5 元券"
        />
      </el-form-item>

      <el-form-item label="抵扣类型">
        <el-radio-group
          v-model="form.deductKind"
          :disabled="isEdit"
        >
          <el-radio-button :value="VoucherDeductKind.NoThreshold">
            无门槛
          </el-radio-button>
          <el-radio-button :value="VoucherDeductKind.FullReduction">
            满减
          </el-radio-button>
          <el-radio-button :value="VoucherDeductKind.Discount">
            折扣
          </el-radio-button>
        </el-radio-group>
      </el-form-item>

      <el-form-item
        v-if="form.deductKind !== VoucherDeductKind.Discount"
        :label="form.deductKind === VoucherDeductKind.NoThreshold ? '面额(元)' : '减免(元)'"
      >
        <el-input-number
          v-model="form.faceValue"
          :min="0.01"
          :step="1"
          :precision="2"
          :disabled="isEdit"
        />
      </el-form-item>

      <el-form-item
        v-else
        label="券额上限(元)"
      >
        <el-input-number
          v-model="form.faceValue"
          :min="0.01"
          :step="1"
          :precision="2"
          :disabled="isEdit"
        />
      </el-form-item>

      <el-form-item
        v-if="form.deductKind === VoucherDeductKind.Discount"
        label="折扣(%)"
      >
        <el-input-number
          v-model="form.discountRate"
          :min="1"
          :max="99"
          :step="1"
          :precision="0"
          :disabled="isEdit"
        />
        <span class="hint">例如 90 表示打 9 折（立减 10%）</span>
      </el-form-item>

      <el-form-item
        v-if="form.deductKind !== VoucherDeductKind.NoThreshold"
        label="使用门槛(元)"
      >
        <el-input-number
          v-model="form.thresholdAmount"
          :min="0"
          :step="10"
          :precision="2"
          :disabled="isEdit"
        />
        <span class="hint">账单达到门槛才可使用</span>
      </el-form-item>

      <el-form-item label="适用范围">
        <el-radio-group v-model="form.scopeKind">
          <el-radio-button :value="VoucherScopeKind.AllProducts">
            全部产品
          </el-radio-button>
          <el-radio-button :value="VoucherScopeKind.SpecificProducts">
            指定产品
          </el-radio-button>
        </el-radio-group>
      </el-form-item>

      <el-form-item
        v-if="form.scopeKind === VoucherScopeKind.SpecificProducts"
        label="ProductCode"
      >
        <el-input
          v-model="form.scopeProductCodes"
          placeholder="逗号分隔，如 demux, voice"
        />
      </el-form-item>

      <el-form-item label="有效期类型">
        <el-radio-group v-model="form.validityKind">
          <el-radio-button :value="VoucherValidityKind.RelativeDays">
            领取后 N 天
          </el-radio-button>
          <el-radio-button :value="VoucherValidityKind.Absolute">
            固定区间
          </el-radio-button>
        </el-radio-group>
      </el-form-item>

      <el-form-item
        v-if="form.validityKind === VoucherValidityKind.RelativeDays"
        label="有效天数"
      >
        <el-input-number
          v-model="form.validDays"
          :min="1"
          :step="1"
          :precision="0"
        />
      </el-form-item>

      <el-form-item
        v-else
        label="有效区间"
      >
        <el-date-picker
          v-model="form.validRange"
          type="datetimerange"
          range-separator="至"
          start-placeholder="开始"
          end-placeholder="结束"
        />
      </el-form-item>

      <el-form-item label="可叠加">
        <el-switch v-model="form.stackable" />
        <span class="hint">关闭时该券只能单独使用</span>
      </el-form-item>

      <el-form-item label="发放总量">
        <el-input-number
          v-model="form.totalQuota"
          :min="1"
          :step="100"
          :precision="0"
        />
        <span class="hint">留空表示不限量</span>
      </el-form-item>

      <el-form-item label="每用户限领">
        <el-input-number
          v-model="form.perUserLimit"
          :min="1"
          :step="1"
          :precision="0"
        />
        <span class="hint">留空表示不限</span>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">
        取消
      </el-button>
      <el-button
        type="primary"
        @click="onSubmit"
      >
        保存
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.hint {
  margin-left: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
