<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type { FormInstance, FormRules } from 'element-plus';

import type { BillingProduct } from '@/features/products/model/product.types';
import { getProductPort } from '@/features/products/services';

import {
  VoucherApplyMode,
  VoucherCategory,
  VoucherDeductKind,
  VoucherScopeKind,
  VoucherValidityKind,
  voucherCategoryLabels,
  voucherCategoryOf,
  type CreateVoucherTemplateInput,
  type UpdateVoucherTemplateInput,
  type VoucherRule,
  type VoucherTemplate,
  type VoucherValidity,
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
  category: VoucherCategory;
  name: string;
  deductKind: number;
  applyMode: number;
  faceValue: number;
  thresholdAmount: number;
  discountRate: number;
  scopeKind: number;
  scopeProductCodes: string[];
  validityKind: number;
  validRange: [Date, Date] | null;
  validDays: number;
  stackable: boolean;
  totalQuota: number | null;
  perUserLimit: number | null;
}

function emptyForm(): FormState {
  return {
    category: VoucherCategory.Credit,
    name: '',
    deductKind: VoucherDeductKind.NoThreshold,
    applyMode: VoucherApplyMode.FirstPaymentOnly,
    faceValue: 5,
    thresholdAmount: 0,
    discountRate: 90,
    scopeKind: VoucherScopeKind.AllProducts,
    scopeProductCodes: [],
    validityKind: VoucherValidityKind.RelativeDays,
    validRange: null,
    validDays: 30,
    stackable: false,
    totalQuota: null,
    perUserLimit: 1,
  };
}

const form = reactive<FormState>(emptyForm());

const productPort = getProductPort();
const products = ref<BillingProduct[]>([]);
const productsLoading = ref(false);

async function loadProducts(): Promise<void> {
  if (products.value.length || productsLoading.value) return;
  productsLoading.value = true;
  try {
    const r = await productPort.list();
    if (r.success) products.value = r.data;
  } finally {
    productsLoading.value = false;
  }
}

const isEdit = computed(() => !!props.template);
const dialogTitle = computed(() => {
  if (isEdit.value) {
    return form.category === VoucherCategory.Credit ? '编辑代金券' : '编辑优惠券';
  }
  return form.category === VoucherCategory.Credit ? '创建代金券' : '创建优惠券';
});

const categoryOptions = [
  { label: voucherCategoryLabels[VoucherCategory.Credit], value: VoucherCategory.Credit },
  { label: voucherCategoryLabels[VoucherCategory.Coupon], value: VoucherCategory.Coupon },
];

const couponDeductOptions = [
  { label: '满减', value: VoucherDeductKind.FullReduction },
  { label: '折扣', value: VoucherDeductKind.Discount },
];
const applyOptions = [
  { label: '单次', value: VoucherApplyMode.FirstPaymentOnly },
  { label: '循环', value: VoucherApplyMode.EveryRenewal },
];
const scopeOptions = [
  { label: '全部产品', value: VoucherScopeKind.AllProducts },
  { label: '指定产品', value: VoucherScopeKind.SpecificProducts },
];
const validityOptions = [
  { label: '领取后 N 天', value: VoucherValidityKind.RelativeDays },
  { label: '固定区间', value: VoucherValidityKind.Absolute },
];

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
    void loadProducts();
    Object.assign(form, emptyForm());
    if (template) {
      form.name = template.name;
      form.applyMode = template.applyMode;
      form.category = voucherCategoryOf(template.rule.kind);

      const rule = template.rule;
      form.deductKind = rule.kind;
      if (rule.kind === VoucherDeductKind.Discount) {
        form.faceValue = rule.capValue;
        form.thresholdAmount = rule.thresholdAmount;
        form.discountRate = rule.discountRate * 100;
      } else if (rule.kind === VoucherDeductKind.FullReduction) {
        form.faceValue = rule.faceValue;
        form.thresholdAmount = rule.thresholdAmount;
      } else {
        form.faceValue = rule.faceValue;
      }

      form.scopeKind = template.scopeKind;
      form.scopeProductCodes = [...template.scopeProductCodes];

      const validity = template.validity;
      form.validityKind = validity.kind;
      if (validity.kind === VoucherValidityKind.Absolute) {
        form.validRange = [new Date(validity.fromUtc), new Date(validity.toUtc)];
      } else {
        form.validDays = validity.days;
      }

      form.stackable = template.stackable;
      form.totalQuota = template.totalQuota ?? null;
      form.perUserLimit = template.perUserLimit ?? null;
    }
  },
  { immediate: true },
);

// 大类切换：余额型锁定无门槛；优惠型默认满减。
watch(
  () => form.category,
  (category) => {
    if (isEdit.value) return;
    if (category === VoucherCategory.Credit) {
      form.deductKind = VoucherDeductKind.NoThreshold;
    } else if (form.deductKind === VoucherDeductKind.NoThreshold) {
      form.deductKind = VoucherDeductKind.FullReduction;
    }
  },
);

// 抵扣周期仅折扣券有意义；无门槛/满减用一次即绑定账单，强制单次。
watch(
  () => form.deductKind,
  (kind) => {
    if (kind !== VoucherDeductKind.Discount) {
      form.applyMode = VoucherApplyMode.FirstPaymentOnly;
    }
  },
);

function scopeCodes(): string[] {
  return form.scopeKind === VoucherScopeKind.SpecificProducts ? [...form.scopeProductCodes] : [];
}

function buildRule(): VoucherRule {
  if (form.deductKind === VoucherDeductKind.Discount) {
    return {
      kind: VoucherDeductKind.Discount,
      discountRate: form.discountRate / 100,
      capValue: form.faceValue,
      thresholdAmount: form.thresholdAmount,
    };
  }
  if (form.deductKind === VoucherDeductKind.FullReduction) {
    return { kind: VoucherDeductKind.FullReduction, faceValue: form.faceValue, thresholdAmount: form.thresholdAmount };
  }
  return { kind: VoucherDeductKind.NoThreshold, faceValue: form.faceValue };
}

function buildValidity(): VoucherValidity {
  if (form.validityKind === VoucherValidityKind.Absolute) {
    return {
      kind: VoucherValidityKind.Absolute,
      fromUtc: form.validRange?.[0]?.getTime() ?? 0,
      toUtc: form.validRange?.[1]?.getTime() ?? 0,
    };
  }
  return { kind: VoucherValidityKind.RelativeDays, days: form.validDays };
}

async function onSubmit(): Promise<void> {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;

  const validity = buildValidity();

  if (isEdit.value && props.template) {
    const payload: UpdateVoucherTemplateInput = {
      name: form.name.trim(),
      scopeKind: form.scopeKind,
      scopeProductCodes: scopeCodes(),
      validity,
      stackable: form.stackable,
      totalQuota: form.totalQuota,
      perUserLimit: form.perUserLimit,
    };
    emit('update', props.template.id, payload);
    return;
  }

  const payload: CreateVoucherTemplateInput = {
    name: form.name.trim(),
    applyMode: form.applyMode,
    rule: buildRule(),
    scopeKind: form.scopeKind,
    scopeProductCodes: scopeCodes(),
    validity,
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
    width="640px"
    destroy-on-close
    class="voucher-form-dialog"
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="92px"
      label-position="right"
    >
      <el-divider content-position="left">
        基本信息
      </el-divider>
      <el-form-item
        label="券大类"
      >
        <el-segmented
          v-model="form.category"
          :options="categoryOptions"
          :disabled="isEdit"
        />
      </el-form-item>
      <el-form-item
        label="券名称"
        prop="name"
      >
        <el-input
          v-model="form.name"
          placeholder="如：新用户无门槛 5 元券"
        />
      </el-form-item>

      <el-divider content-position="left">
        抵扣规则
      </el-divider>
      <el-form-item
        v-if="form.category === VoucherCategory.Coupon"
        label="优惠类型"
      >
        <el-segmented
          v-model="form.deductKind"
          :options="couponDeductOptions"
          :disabled="isEdit"
        />
      </el-form-item>
      <el-form-item
        v-else
        label="抵扣类型"
      >
        <el-tag type="primary" effect="plain">无门槛（余额自动抵扣）</el-tag>
      </el-form-item>

      <el-form-item
        v-if="form.deductKind === VoucherDeductKind.Discount"
        label="抵扣周期"
      >
        <el-segmented
          v-model="form.applyMode"
          :options="applyOptions"
          :disabled="isEdit"
        />
      </el-form-item>

      <el-form-item
        v-if="form.deductKind !== VoucherDeductKind.Discount"
        :label="form.deductKind === VoucherDeductKind.NoThreshold ? '面额' : '减免'"
      >
        <el-input-number
          v-model="form.faceValue"
          :min="0.01"
          :step="1"
          :precision="2"
          :disabled="isEdit"
        />
        <span class="unit">元</span>
      </el-form-item>

      <el-form-item
        v-else
        label="券额上限"
      >
        <el-input-number
          v-model="form.faceValue"
          :min="0.01"
          :step="1"
          :precision="2"
          :disabled="isEdit"
        />
        <span class="unit">元</span>
      </el-form-item>

      <el-form-item
        v-if="form.deductKind === VoucherDeductKind.Discount"
        label="折扣"
      >
        <el-input-number
          v-model="form.discountRate"
          :min="1"
          :max="99"
          :step="1"
          :precision="0"
          :disabled="isEdit"
        />
        <span class="unit">%</span>
      </el-form-item>

      <el-form-item
        v-if="form.deductKind !== VoucherDeductKind.NoThreshold"
        label="使用门槛"
      >
        <el-input-number
          v-model="form.thresholdAmount"
          :min="0"
          :step="10"
          :precision="2"
          :disabled="isEdit"
        />
        <span class="unit">元</span>
      </el-form-item>

      <el-form-item
        v-if="form.deductKind !== VoucherDeductKind.NoThreshold"
        label="可叠加"
      >
        <el-switch v-model="form.stackable" />
      </el-form-item>

      <el-divider content-position="left">
        适用范围
      </el-divider>
      <el-form-item label="范围">
        <el-segmented
          v-model="form.scopeKind"
          :options="scopeOptions"
        />
      </el-form-item>

      <el-form-item
        v-if="form.scopeKind === VoucherScopeKind.SpecificProducts"
        label="适用产品"
      >
        <el-select
          v-model="form.scopeProductCodes"
          multiple
          filterable
          :loading="productsLoading"
          placeholder="选择适用的计费产品"
          style="width: 100%"
        >
          <el-option
            v-for="p in products"
            :key="p.code"
            :label="`${p.displayName || p.code}（${p.code}）`"
            :value="p.code"
          />
        </el-select>
      </el-form-item>

      <el-divider content-position="left">
        有效期
      </el-divider>
      <el-form-item label="类型">
        <el-segmented
          v-model="form.validityKind"
          :options="validityOptions"
        />
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
        <span class="unit">天</span>
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
          style="width: 100%"
        />
      </el-form-item>

      <el-divider content-position="left">
        发放与限制
      </el-divider>
      <el-form-item label="发放总量">
        <el-input-number
          v-model="form.totalQuota"
          :min="1"
          :step="100"
          :precision="0"
          placeholder="不限"
        />
        <span class="unit">张</span>
      </el-form-item>

      <el-form-item label="每用户限领">
        <el-input-number
          v-model="form.perUserLimit"
          :min="1"
          :step="1"
          :precision="0"
        />
        <span class="unit">张</span>
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
.voucher-form-dialog :deep(.el-divider--horizontal) {
  margin: 4px 0 18px;
}
.voucher-form-dialog :deep(.el-divider__text) {
  font-weight: 600;
  font-size: 13px;
  color: var(--el-color-primary);
}
.unit {
  margin-left: 10px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
</style>
