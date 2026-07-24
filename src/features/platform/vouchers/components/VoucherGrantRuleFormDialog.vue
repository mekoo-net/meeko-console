<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';

import type { BillingProduct } from '@/features/platform/products/model/product.types';
import { getProductPort } from '@/features/platform/products/services';

import { getVoucherPort } from '../services';
import {
  GrantConditionKind,
  GrantTriggerEvent,
  VoucherScopeKind,
  VoucherTemplateStatus,
  grantConditionKindLabels,
  grantTriggerEventLabels,
  type CreateVoucherGrantRuleInput,
  type UpdateVoucherGrantRuleInput,
  type VoucherGrantRule,
  type VoucherTemplate,
} from '../model/voucher.types';

const props = defineProps<{
  modelValue: boolean;
  rule?: VoucherGrantRule | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  create: [payload: CreateVoucherGrantRuleInput];
  update: [id: string, payload: UpdateVoucherGrantRuleInput];
}>();

const port = getVoucherPort();
const productPort = getProductPort();
const templates = ref<VoucherTemplate[]>([]);
const products = ref<BillingProduct[]>([]);
const productsLoading = ref(false);

interface FormState {
  name: string;
  triggerEventType: string;
  conditionKind: number;
  thresholdAmount: number | null;
  // false = 全部产品（任意产品的该事件都触发）；true = 仅指定产品的事件触发。
  scopeSpecific: boolean;
  scopeProductCode: string;
  templateIds: string[];
  hasWindow: boolean;
  window: [Date, Date] | null;
  totalQuota: number | null;
  perUserLimit: number | null;
}

function emptyForm(): FormState {
  return {
    name: '',
    triggerEventType: GrantTriggerEvent.AccountRegistered,
    conditionKind: GrantConditionKind.Immediate,
    thresholdAmount: null,
    scopeSpecific: false,
    scopeProductCode: '',
    templateIds: [],
    hasWindow: false,
    window: null,
    totalQuota: null,
    perUserLimit: 1,
  };
}

const form = reactive<FormState>(emptyForm());

const isEdit = computed(() => !!props.rule);
const dialogTitle = computed(() => (isEdit.value ? '编辑发券规则' : '新建发券规则'));

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

const triggerOptions = [
  { value: GrantTriggerEvent.AccountRegistered, label: grantTriggerEventLabels[GrantTriggerEvent.AccountRegistered] },
  { value: GrantTriggerEvent.RechargeSucceeded, label: grantTriggerEventLabels[GrantTriggerEvent.RechargeSucceeded] },
];

// 注册事件无金额可言，只能立即发放；充值事件可按金额达标。
const supportsAmount = computed(() => form.triggerEventType === GrantTriggerEvent.RechargeSucceeded);
const supportsScope = computed(() => form.triggerEventType === GrantTriggerEvent.RechargeSucceeded);

const conditionOptions = computed(() => {
  const opts: Array<{ value: number; label: string }> = [
    { value: GrantConditionKind.Immediate, label: grantConditionKindLabels[GrantConditionKind.Immediate] ?? '' },
  ];
  if (supportsAmount.value)
    opts.push({
      value: GrantConditionKind.EventAmountAtLeast,
      label: grantConditionKindLabels[GrantConditionKind.EventAmountAtLeast] ?? '',
    });
  return opts;
});

const isAmountCondition = computed(() => form.conditionKind === GrantConditionKind.EventAmountAtLeast);

const productLabel = (code: string): string => {
  const p = products.value.find((x) => x.code === code);
  return p ? `${p.displayName || p.code}` : code;
};

const scopeText = computed(() => {
  if (!supportsScope.value) return '';
  return form.scopeSpecific && form.scopeProductCode
    ? `仅「${productLabel(form.scopeProductCode)}」产品的事件触发`
    : '任意产品的该事件都触发';
});

const ruleText = computed(() => {
  const trigger = grantTriggerEventLabels[form.triggerEventType] ?? form.triggerEventType;
  const count = form.templateIds.length;
  const scope =
    supportsScope.value && form.scopeSpecific && form.scopeProductCode
      ? `「${productLabel(form.scopeProductCode)}」`
      : '';
  const cond = isAmountCondition.value
    ? `当${scope}单笔金额 ≥ ${form.thresholdAmount ?? '—'} 时`
    : scope
      ? `命中${scope}事件即`
      : '命中即';
  const per = form.perUserLimit ? `（每账户最多 ${form.perUserLimit} 次）` : '（不限次数）';
  return count > 0
    ? `「${trigger}」${cond}向账户发放 ${count} 张券${per}`
    : `「${trigger}」${cond}向账户发放配置的券${per}`;
});

const editingItems = computed(() => props.rule?.items ?? []);

/** 券模板自身的适用产品范围（发出的券也受领域限制），用于在选券时给管理员可见提示。 */
function templateScopeLabel(t: VoucherTemplate): string {
  if (t.scopeKind !== VoucherScopeKind.SpecificProducts || t.scopeProductCodes.length === 0)
    return '全部产品';
  return t.scopeProductCodes.map((c) => productLabel(c)).join('、');
}

async function loadTemplates(): Promise<void> {
  const r = await port.listTemplates({ page: 1, pageSize: 100, includeArchived: false });
  if (r.success)
    templates.value = r.data.items.filter((t) => t.status === VoucherTemplateStatus.Active);
}

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

watch(
  () => [props.modelValue, props.rule] as const,
  ([open, rule]) => {
    if (!open) return;
    void loadTemplates();
    void loadProducts();
    Object.assign(form, emptyForm());
    if (rule) {
      form.name = rule.name;
      form.triggerEventType = rule.triggerEventType;
      form.conditionKind = rule.conditionKind;
      form.thresholdAmount = rule.thresholdAmount ?? null;
      form.scopeProductCode = rule.scopeProductCode ?? '';
      form.scopeSpecific = !!rule.scopeProductCode;
      form.templateIds = rule.items.map((i) => i.templateId);
      form.totalQuota = rule.totalQuota ?? null;
      form.perUserLimit = rule.perUserLimit ?? null;
      if (rule.startAtUtc && rule.endAtUtc) {
        form.hasWindow = true;
        form.window = [new Date(rule.startAtUtc), new Date(rule.endAtUtc)];
      }
    }
  },
  { immediate: true },
);

// 触发事件切换时收敛条件：不支持金额的事件强制回到「立即发放」、不支持范围的清空产品限定。
watch(
  () => form.triggerEventType,
  () => {
    if (!supportsAmount.value) {
      form.conditionKind = GrantConditionKind.Immediate;
      form.thresholdAmount = null;
    }
    if (!supportsScope.value) {
      form.scopeSpecific = false;
      form.scopeProductCode = '';
    }
  },
);

function windowFields(): { startAtUtc: number | null; endAtUtc: number | null } {
  if (form.hasWindow && form.window) {
    return {
      startAtUtc: form.window[0]?.getTime() ?? null,
      endAtUtc: form.window[1]?.getTime() ?? null,
    };
  }
  return { startAtUtc: null, endAtUtc: null };
}

function scopeField(): string | null {
  return supportsScope.value && form.scopeSpecific && form.scopeProductCode.trim()
    ? form.scopeProductCode.trim()
    : null;
}

function thresholdField(): number | null {
  return isAmountCondition.value ? form.thresholdAmount : null;
}

function onSubmit(): void {
  if (!form.name.trim()) {
    ElMessage.warning('请输入规则名称');
    return;
  }
  if (isAmountCondition.value && !(form.thresholdAmount && form.thresholdAmount > 0)) {
    ElMessage.warning('请输入大于 0 的金额阈值');
    return;
  }
  if (supportsScope.value && form.scopeSpecific && !form.scopeProductCode) {
    ElMessage.warning('请选择限定的产品');
    return;
  }
  const win = windowFields();
  if (isEdit.value && props.rule) {
    emit('update', props.rule.id, {
      name: form.name.trim(),
      thresholdAmount: thresholdField(),
      scopeProductCode: scopeField(),
      ...win,
      totalQuota: form.totalQuota,
      perUserLimit: form.perUserLimit,
    });
    return;
  }
  if (form.templateIds.length === 0) {
    ElMessage.warning('请至少选择一张要发放的券');
    return;
  }
  emit('create', {
    name: form.name.trim(),
    triggerEventType: form.triggerEventType,
    conditionKind: form.conditionKind,
    templateIds: [...form.templateIds],
    thresholdAmount: thresholdField(),
    scopeProductCode: scopeField(),
    ...win,
    totalQuota: form.totalQuota,
    perUserLimit: form.perUserLimit,
  });
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="dialogTitle"
    width="560px"
    destroy-on-close
  >
    <el-form label-width="100px">
      <el-form-item label="规则名称">
        <el-input
          v-model="form.name"
          maxlength="64"
          placeholder="如：新人注册礼包 / 充值满 100 送券"
        />
      </el-form-item>

      <el-form-item label="触发事件">
        <el-select
          v-model="form.triggerEventType"
          :disabled="isEdit"
          style="width: 100%"
        >
          <el-option
            v-for="o in triggerOptions"
            :key="o.value"
            :label="o.label"
            :value="o.value"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="触发条件">
        <el-radio-group
          v-model="form.conditionKind"
          :disabled="isEdit"
        >
          <el-radio
            v-for="o in conditionOptions"
            :key="o.value"
            :value="o.value"
          >
            {{ o.label }}
          </el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item
        v-if="isAmountCondition"
        label="金额阈值"
      >
        <el-input-number
          v-model="form.thresholdAmount"
          :min="0.01"
          :step="50"
          :precision="2"
          controls-position="right"
        />
        <span class="hint">事件金额 ≥ 此值才发放</span>
      </el-form-item>

      <el-form-item
        v-if="supportsScope"
        label="业务范围"
      >
        <el-radio-group v-model="form.scopeSpecific">
          <el-radio :value="false">
            全部产品
          </el-radio>
          <el-radio :value="true">
            指定产品
          </el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item
        v-if="supportsScope && form.scopeSpecific"
        label="限定产品"
      >
        <el-select
          v-model="form.scopeProductCode"
          filterable
          :loading="productsLoading"
          placeholder="选择触发该规则的计费产品"
          style="width: 100%"
        >
          <el-option
            v-for="p in products"
            :key="p.code"
            :label="`${p.displayName || p.code}（${p.code}）`"
            :value="p.code"
          />
        </el-select>
        <span class="hint">{{ scopeText }}</span>
      </el-form-item>

      <el-form-item label="发放券">
        <el-select
          v-if="!isEdit"
          v-model="form.templateIds"
          placeholder="选择命中后发放的券（可多选，全部发放）"
          multiple
          filterable
          style="width: 100%"
        >
          <el-option
            v-for="t in templates"
            :key="t.id"
            :label="`${t.name}（${t.code}）· 适用 ${templateScopeLabel(t)}`"
            :value="t.id"
          >
            <span>{{ t.name }}（{{ t.code }}）</span>
            <span class="opt-scope">适用 {{ templateScopeLabel(t) }}</span>
          </el-option>
        </el-select>
        <div
          v-else
          class="ro-items"
        >
          <el-tag
            v-for="it in editingItems"
            :key="it.templateId"
            size="small"
            effect="plain"
          >
            {{ it.templateName ?? it.templateId }}（{{ it.templateCode }}）
          </el-tag>
        </div>
      </el-form-item>

      <el-form-item label="发放规则">
        <span class="rule-text">{{ ruleText }}</span>
      </el-form-item>

      <el-form-item label="生效期">
        <el-switch v-model="form.hasWindow" />
        <el-date-picker
          v-if="form.hasWindow"
          v-model="form.window"
          type="datetimerange"
          range-separator="至"
          start-placeholder="开始"
          end-placeholder="结束"
          style="margin-left: 12px"
        />
        <span
          v-else
          class="hint"
        >不限定则长期生效</span>
      </el-form-item>

      <el-form-item label="发放总量">
        <el-input-number
          v-model="form.totalQuota"
          :min="1"
          :step="100"
          :precision="0"
          controls-position="right"
        />
        <span class="hint">本规则最多发放数量，留空不限</span>
      </el-form-item>

      <el-form-item label="每账户限">
        <el-input-number
          v-model="form.perUserLimit"
          :min="1"
          :step="1"
          :precision="0"
          controls-position="right"
        />
        <span class="hint">每账户最多触发发放次数，留空不限</span>
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
.rule-text {
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.opt-scope {
  float: right;
  margin-left: 16px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.ro-items {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
