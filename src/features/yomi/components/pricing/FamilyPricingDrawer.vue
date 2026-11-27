<script setup lang="ts">
/**
 * 定一个模型家族在这个渠道里的分组定价：先选方式（倍率 / 按次 / 积分），再填一个值。
 * 和别名定价、渠道设置一样从右边拉出来，页面上的别名列表还看得见。
 *
 * 后端只存一个值，所以切换方式时三种方式各自记着草稿，切回来不用重填；保存的只是当前方式那一个。
 */
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';

import {
  FamilyPricingModeLabel,
  familyPricingModeValues,
  modelFamilyLabel,
  type FamilyPricingMode,
  type VendorFamilyPricing,
} from '@yomi/common';
import { formatFamilyPricing } from '../../model/familyPricing';
import { getYomiPricingPort } from '../../services';
import { notifyCompile } from './compileFeedback';
import MakerMark from './MakerMark.vue';
import PriceField from './PriceField.vue';

interface Props {
  modelValue: boolean;
  /** 渠道（vendor）主键。 */
  vendorId: string | null;
  /** 渠道显示名，只用来写在家族名下面。 */
  vendorTitle: string;
  family: VendorFamilyPricing | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'saved'): void;
}>();

const pricingPort = getYomiPricingPort();

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const mode = ref<FamilyPricingMode>('multiplier');

/**
 * 每种方式各自的草稿。倍率从 1 起步（原价）；按次价和积分单价没有一个说得过去的缺省，留空逼人填，
 * 不拿倍率的数去冒充单价。el-input-number 清空后是 undefined，PriceField 清空后是 null。
 */
const drafts = reactive<{
  multiplier: number | undefined;
  per_call: number | null;
  credit: number | null;
}>({ multiplier: 1, per_call: null, credit: null });

const saving = ref(false);
const error = ref('');

const modeOptions = familyPricingModeValues.map((value) => ({
  value,
  label: FamilyPricingModeLabel[value],
}));

const label = computed(() => modelFamilyLabel(props.family?.family));

/** 当前方式下要保存的值；没填是 null。 */
const draftValue = computed<number | null>(() => {
  const v = drafts[mode.value];
  return v == null || !Number.isFinite(v) ? null : v;
});

/** 身份卡右边的大字，跟着草稿走；还没填是「—」。 */
const preview = computed(() =>
  draftValue.value == null ? '—' : formatFamilyPricing({ mode: mode.value, value: draftValue.value }),
);

const MODE_NOTE: Readonly<Record<FamilyPricingMode, string>> = {
  multiplier: '有效价 = 价格表牌价 × 这个倍率，按 token 等用量计费。',
  per_call: '每次调用收这个价，不看价格表，也不看用了多少 token。',
  credit:
    '按上游报的积分计费，每积分这个价，不看价格表。只对上游会报积分的模型用：上游不报积分时，这些调用按 0 计费。',
};

const EMPTY_HINT: Readonly<Record<FamilyPricingMode, string>> = {
  multiplier: '填写分组倍率',
  per_call: '填写每次调用的价格',
  credit: '填写每积分价格',
};

function reset(): void {
  const f = props.family;
  if (!f) return;
  mode.value = f.mode;
  drafts.multiplier = f.mode === 'multiplier' ? f.value : 1;
  drafts.per_call = f.mode === 'per_call' ? f.value : null;
  drafts.credit = f.mode === 'credit' ? f.value : null;
  error.value = '';
}

watch(
  () => [props.modelValue, props.family?.family] as const,
  ([open]) => {
    if (open) reset();
  },
);

watch([mode, draftValue], () => {
  error.value = '';
});

async function onSubmit(): Promise<void> {
  const f = props.family;
  if (!f || !props.vendorId) return;
  // 没填不能当 0 存：那是把这一组悄悄改成免费。
  const value = draftValue.value;
  if (value == null) {
    error.value = EMPTY_HINT[mode.value];
    return;
  }
  if (mode.value === f.mode && value === f.value) {
    visible.value = false;
    return;
  }
  saving.value = true;
  try {
    const r = await pricingPort.setFamilyPricing({
      vendorId: props.vendorId,
      family: f.family,
      mode: mode.value,
      value,
      reason: 'console family pricing',
    });
    if (!r.success) {
      ElMessage.error(r.error.message);
      return;
    }
    notifyCompile(
      `${label.value} 分组定价已设为 ${formatFamilyPricing({ mode: mode.value, value })}`,
      r.data,
    );
    visible.value = false;
    emit('saved');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <el-drawer
    v-model="visible"
    size="420px"
    :close-on-click-modal="false"
    destroy-on-close
    header-class="family-pricing-header"
    body-class="family-pricing-body"
    footer-class="family-pricing-footer"
  >
    <template #header>
      <span class="fp-title">分组定价</span>
    </template>

    <div v-if="family" class="fp">
      <div class="fp-id">
        <div class="fp-id__who">
          <MakerMark :maker="family.family" />
          <div class="fp-id__text">
            <span class="fp-id__name">{{ label }}</span>
            <span class="fp-id__vendor">{{ vendorTitle }}</span>
          </div>
        </div>
        <span class="fp-id__value">{{ preview }}</span>
      </div>

      <section class="fp-field">
        <span class="fp-field__label">定价方式</span>
        <el-segmented v-model="mode" :options="modeOptions" block />
      </section>

      <section class="fp-field">
        <!-- 按次 / 积分的输入框自己带「每次」「每积分」的标签，外面再写一个就重了。 -->
        <span v-if="mode === 'multiplier'" class="fp-field__label">倍率</span>
        <el-input-number
          v-if="mode === 'multiplier'"
          v-model="drafts.multiplier"
          :min="0"
          :max="1000"
          :precision="4"
          :step="0.05"
          controls-position="right"
          class="fp-input"
          @keyup.enter="onSubmit"
        />
        <PriceField
          v-else-if="mode === 'per_call'"
          v-model="drafts.per_call"
          label="每次"
          unit="人民币 · 每次调用，最多 6 位小数"
          size="lg"
        />
        <PriceField
          v-else
          v-model="drafts.credit"
          label="每积分"
          unit="人民币 · 每 1 上游积分，最多 6 位小数"
          size="lg"
        />
        <p v-if="error" class="fp-error">{{ error }}</p>
        <p class="fp-note">{{ MODE_NOTE[mode] }}</p>
      </section>

    </div>

    <template #footer>
      <div class="fp-foot">
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSubmit">保存</el-button>
      </div>
    </template>
  </el-drawer>
</template>

<style>
.family-pricing-header {
  margin-bottom: 0 !important;
  padding: 16px 20px 14px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.family-pricing-body {
  padding: 20px;
}
.family-pricing-footer {
  padding: 12px 20px 16px;
  border-top: 1px solid var(--el-border-color-lighter);
}
</style>

<style scoped>
.fp-title {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.3;
}
.fp {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.fp-id {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  background: var(--el-fill-color-extra-light);
}
.fp-id__who {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.fp-id__text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.fp-id__name {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
}
.fp-id__vendor {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.fp-id__value {
  flex-shrink: 0;
  font-size: 20px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.03em;
  line-height: 1;
  color: var(--el-text-color-primary);
}
.fp-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.fp-field__label {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-regular);
}
.fp-input {
  width: 100%;
}
.fp-input :deep(.el-input__inner) {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  letter-spacing: -0.02em;
}
.fp-error {
  margin: 0;
  font-size: 12px;
  color: var(--el-color-danger);
}
.fp-note {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}
.fp-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
