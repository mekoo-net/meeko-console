<script setup lang="ts">
/**
 * 渠道设置：对外名称（slug）和渠道定价放在同一处改。
 * slug 走目录接口；定价走定价接口，改完会重算该渠道下继承渠道定价的别名。
 *
 * 渠道定价先选方式（倍率 / 积分），再填一个值：倍率乘在价格表牌价上，积分单价直接乘上游报的积分。
 * 后端只存一个值，所以切换方式时两种方式各自记着草稿，切回来不用重填；保存的只是当前方式那一个。
 */
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';

import { ProviderGroupLabel } from '@yomi/common';
import type { ProviderGroup, VendorPricingMode } from '../../model/catalog.types';
import { isValidVendorSlug, normalizeVendorSlug } from '../../model/vendorSlug';
import {
  VENDOR_PRICING_MODE_LABEL,
  formatVendorPricing,
  type VendorPricing,
} from '../../model/vendorPricing';
import { getYomiCatalogPort, getYomiPricingPort } from '../../services';
import { notifyCompile } from '../pricing/compileFeedback';
import PriceField from '../pricing/PriceField.vue';

interface Props {
  modelValue: boolean;
  group: ProviderGroup | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'refresh'): void;
}>();

const catalogPort = getYomiCatalogPort();
const pricingPort = getYomiPricingPort();

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const formRef = ref<FormInstance>();
const saving = ref(false);

const form = reactive({
  vendorSlug: '',
  pricingMode: 'multiplier' as VendorPricingMode,
  /** 倍率草稿；渠道本来不是倍率方式时从 1 起步。 */
  multiplier: 1,
  /** 积分单价草稿；渠道本来不是积分方式时留空，逼人填，不拿倍率的数去冒充单价。 */
  creditPrice: null as number | null,
});

const pricingError = ref('');

const modeOptions = (['multiplier', 'credit'] as const).map((value) => ({
  value,
  label: VENDOR_PRICING_MODE_LABEL[value],
}));

/** 当前方式下要保存的值；积分方式没填是 null。 */
const draftValue = computed(() =>
  form.pricingMode === 'credit' ? form.creditPrice : form.multiplier,
);

/** 顶部卡片里的预览，跟着草稿走。 */
const pricingPreview = computed(() =>
  draftValue.value == null
    ? '—'
    : formatVendorPricing({ pricingMode: form.pricingMode, pricingValue: draftValue.value }),
);

const pricingHint = computed(() =>
  form.pricingMode === 'credit'
    ? '继承渠道定价的模型按上游报的积分计费，每积分这个价，不看价格表也不乘倍率；单独定过价的模型不受影响。只对上游会报积分的渠道用：上游不报积分时，这些调用按 0 计费。'
    : '继承渠道定价的模型：有效价 = 价格表牌价 × 这个倍率（× 路由倍率）。单独定过价的模型不受影响。',
);

const groupTitle = computed(() => {
  const g = props.group;
  if (!g) return '';
  return ProviderGroupLabel[g.queueGroup] ?? g.queueGroup;
});

const showQueueGroup = computed(() => {
  const qg = props.group?.queueGroup ?? '';
  return qg.length > 0 && qg !== groupTitle.value;
});

const rules: FormRules = {
  vendorSlug: [
    {
      validator: (_rule, value: string, callback) => {
        const trimmed = (value ?? '').trim();
        if (!trimmed) {
          callback();
          return;
        }
        if (!isValidVendorSlug(trimmed)) {
          callback(new Error('须小写字母开头，仅含 a-z、0-9、_、-，长度 2–63'));
          return;
        }
        callback();
      },
      trigger: 'blur',
    },
  ],
};

function resetForm(): void {
  const g = props.group;
  form.vendorSlug = g?.vendorSlug?.trim() ?? '';
  form.pricingMode = g?.pricingMode ?? 'multiplier';
  form.multiplier = g?.pricingMode === 'multiplier' ? g.pricingValue : 1;
  form.creditPrice = g?.pricingMode === 'credit' ? g.pricingValue : null;
  pricingError.value = '';
  formRef.value?.clearValidate();
}

async function onSubmit(): Promise<void> {
  if (!props.group) return;
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  const value = draftValue.value;
  if (value == null) {
    pricingError.value = '填写每积分价格';
    return;
  }

  const trimmed = form.vendorSlug.trim();
  const slug = trimmed ? normalizeVendorSlug(trimmed) : null;
  const prevSlug = props.group.vendorSlug?.trim() || null;
  const slugChanged = slug !== prevSlug;
  const next: VendorPricing = { pricingMode: form.pricingMode, pricingValue: value };
  const pricingChanged =
    next.pricingMode !== props.group.pricingMode || next.pricingValue !== props.group.pricingValue;

  if (!slugChanged && !pricingChanged) {
    visible.value = false;
    return;
  }

  saving.value = true;
  try {
    if (slugChanged) {
      const r = await catalogPort.updateVendorSlug(props.group.id, slug);
      if (!r.success) {
        ElMessage.error(r.error.message);
        return;
      }
    }
    if (pricingChanged) {
      const r = await pricingPort.setVendorPricing({
        vendorId: props.group.id,
        mode: next.pricingMode,
        value: next.pricingValue,
        reason: 'console vendor settings',
      });
      if (!r.success) {
        ElMessage.error(r.error.message);
        return;
      }
      notifyCompile(
        `渠道定价已设为${VENDOR_PRICING_MODE_LABEL[next.pricingMode]} ${formatVendorPricing(next)}`,
        r.data,
      );
    } else {
      ElMessage.success(slug ? `渠道名称已设为「${slug}」` : '已清空渠道名称');
    }
    visible.value = false;
    emit('refresh');
  } finally {
    saving.value = false;
  }
}

watch(
  () => [form.pricingMode, form.creditPrice] as const,
  () => {
    pricingError.value = '';
  },
);

watch(
  () => props.modelValue,
  (open) => {
    if (open) resetForm();
  },
);

watch(
  () => props.group?.id,
  () => {
    if (props.modelValue) resetForm();
  },
);
</script>

<template>
  <el-drawer
    v-model="visible"
    size="420px"
    :close-on-click-modal="false"
    destroy-on-close
    header-class="vendor-settings-header"
    body-class="vendor-settings-body"
    footer-class="vendor-settings-footer"
  >
    <template #header>
      <span class="vh-title">渠道设置</span>
    </template>

    <el-form
      v-if="group"
      ref="formRef"
      :model="form"
      :rules="rules"
      label-position="top"
      class="vs-form"
      @submit.prevent
    >
      <div class="vs-id">
        <div class="vs-id__text">
          <span class="vs-id__name">{{ groupTitle }}</span>
          <span v-if="showQueueGroup" class="vs-id__qg">{{ group.queueGroup }}</span>
        </div>
        <span class="vs-id__mult">{{ pricingPreview }}</span>
      </div>

      <el-form-item label="渠道名称" prop="vendorSlug">
        <el-input
          v-model="form.vendorSlug"
          class="vs-slug"
          clearable
          maxlength="63"
        />
      </el-form-item>

      <el-form-item
        label="渠道定价"
        :error="pricingError"
      >
        <div class="vs-pricing">
          <el-segmented
            v-model="form.pricingMode"
            :options="modeOptions"
          />
          <el-input-number
            v-if="form.pricingMode === 'multiplier'"
            v-model="form.multiplier"
            :min="0"
            :max="1000"
            :precision="4"
            :step="0.05"
            controls-position="right"
            class="vs-mult"
          />
          <PriceField
            v-else
            v-model="form.creditPrice"
            label="每积分"
            unit="人民币 · 每 1 上游积分，最多 6 位小数"
            size="lg"
          />
          <p class="vs-note">
            {{ pricingHint }}
          </p>
        </div>
      </el-form-item>
    </el-form>

    <template #footer>
      <div class="vs-foot">
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSubmit">保存</el-button>
      </div>
    </template>
  </el-drawer>
</template>

<style>
.vendor-settings-header {
  margin-bottom: 0 !important;
  padding: 16px 20px 14px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.vendor-settings-body {
  padding: 20px;
}
.vendor-settings-footer {
  padding: 12px 20px 16px;
  border-top: 1px solid var(--el-border-color-lighter);
}
</style>

<style scoped>
.vh-title {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.3;
}

.vs-id {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 22px;
  padding: 14px 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  background: var(--el-fill-color-extra-light);
}
.vs-id__text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.vs-id__name {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
}
.vs-id__qg {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.vs-id__mult {
  flex-shrink: 0;
  font-size: 22px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.04em;
  line-height: 1;
  color: var(--el-text-color-primary);
}

.vs-form :deep(.el-form-item) {
  margin-bottom: 18px;
}
.vs-form :deep(.el-form-item:last-child) {
  margin-bottom: 0;
}
.vs-form :deep(.el-form-item__label) {
  margin-bottom: 6px !important;
  font-weight: 500;
  color: var(--el-text-color-regular);
}

.vs-slug :deep(.el-input__inner) {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 13px;
}

.vs-mult {
  width: 100%;
}
.vs-mult :deep(.el-input__wrapper) {
  width: 100%;
}
.vs-mult :deep(.el-input__inner) {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  letter-spacing: -0.02em;
}
.vs-pricing {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.vs-note {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}

.vs-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
