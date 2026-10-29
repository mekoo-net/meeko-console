<script setup lang="ts">
/**
 * 一份 RateBody 的录入表单。价格表锁死计量方式；模型定价自定义时
 * LLM 可改按量 / 按次，生图只能改档位，不能跨产品换计量——积分除外，
 * 它是上游报的结算点数、不绑模态，各类模型都能改挂（见 allowedManualBillingTypes）。
 *
 * cachedRead / cachedWrite 留空 = 按 input 价计。
 */
import { computed, ref, watch } from 'vue';
import { ArrowRight, Delete, Plus } from '@element-plus/icons-vue';

import {
  BillingTypeLabel,
  PRICE_CURRENCY,
  type BillingType,
  type ModelCapabilities,
  type PerImageTier,
  type PerVideoTier,
  type RateBody,
} from '@yomi/common';
import {
  allowedManualBillingTypes,
  resolvePriceModelKind,
} from '../model/priceTable';
import PriceField from './pricing/PriceField.vue';

export type RateDraft = RateBody;

interface Props {
  /** 父层打开时为 true，用来回填。 */
  active: boolean;
  subjectKey: string;
  initial: RateDraft | null;
  billingType?: BillingType;
  capabilities?: ModelCapabilities | null;
  /** 价格表上的计量；有的话自定义只能在同类里换（LLM 按量/按次）。 */
  catalogBillingType?: BillingType | null;
  /** 模型定价自定义：同类计量可切换。价格表不要开。 */
  allowBillingType?: boolean;
  /** 价格表美元；自定义有效价人民币。 */
  currency?: string;
}

const props = withDefaults(defineProps<Props>(), {
  billingType: 'per_token',
  capabilities: null,
  catalogBillingType: null,
  allowBillingType: false,
  currency: PRICE_CURRENCY,
});

const moneySymbol = computed(() => (props.currency.toUpperCase() === 'USD' ? '$' : '¥'));

type Money = number | null;

interface FormState {
  billingType: BillingType;
  inputPerM: Money;
  outputPerM: Money;
  cachedRead: Money;
  cachedWrite: Money;
  inputAudio: Money;
  outputAudio: Money;
  reasoning: Money;
  pricePerCall: Money;
  pricePerCredit: Money;
  imageTiers: PerImageTier[];
  videoTiers: PerVideoTier[];
  videoMinSeconds: Money;
  videoMaxSeconds: Money;
  pricePerMinute: Money;
  pricePerKChar: Money;
}

const emptyForm = (billingType: BillingType): FormState => ({
  billingType,
  inputPerM: null,
  outputPerM: null,
  cachedRead: null,
  cachedWrite: null,
  inputAudio: null,
  outputAudio: null,
  reasoning: null,
  pricePerCall: null,
  pricePerCredit: null,
  imageTiers: [{ size: '1024x1024', quality: 'standard', pricePerImage: 0 }],
  videoTiers: [{ resolution: '1080p', pricePerSecond: 0 }],
  videoMinSeconds: null,
  videoMaxSeconds: null,
  pricePerMinute: null,
  pricePerKChar: null,
});

const form = ref<FormState>(emptyForm('per_token'));
const extrasOpen = ref(false);

function loadRateIntoForm(p: RateDraft): FormState {
  const f = emptyForm(p.billingType);

  switch (p.billingType) {
    case 'per_token':
      f.inputPerM = p.rate.input.perMToken;
      f.outputPerM = p.rate.output.perMToken;
      f.cachedRead = p.rate.input.cachedRead ?? null;
      f.cachedWrite = p.rate.input.cachedWrite ?? null;
      f.inputAudio = p.rate.input.audio ?? null;
      f.outputAudio = p.rate.output.audio ?? null;
      f.reasoning = p.rate.output.reasoning ?? null;
      break;
    case 'per_call':
      f.pricePerCall = p.rate.pricePerCall;
      break;
    case 'per_credit':
      f.pricePerCredit = p.rate.pricePerCredit;
      break;
    case 'per_image':
      f.imageTiers = p.rate.tiers.map((t) => ({ ...t }));
      break;
    case 'per_video':
      f.videoTiers = p.rate.tiers.map((t) => ({ ...t }));
      f.videoMinSeconds = p.rate.minSeconds ?? null;
      f.videoMaxSeconds = p.rate.maxSeconds ?? null;
      break;
    case 'per_audio_minute':
      f.pricePerMinute = p.rate.pricePerMinute;
      break;
    case 'per_character':
      f.pricePerKChar = p.rate.pricePerKChar;
      break;
  }
  return f;
}

const modelKind = computed(() =>
  resolvePriceModelKind({
    modelKey: props.subjectKey,
    catalogBillingType: props.catalogBillingType,
    capabilities: props.capabilities,
  }),
);

const allowedTypes = computed(() => allowedManualBillingTypes(modelKind.value));

const isEmbedding = computed(() => modelKind.value === 'embedding');

const showReasoning = computed(
  () =>
    !isEmbedding.value && (props.capabilities?.reasoning !== false || form.value.reasoning != null),
);
const showAudio = computed(
  () =>
    !isEmbedding.value &&
    (props.capabilities?.audio !== false ||
      form.value.inputAudio != null ||
      form.value.outputAudio != null),
);

const extraCount = computed(() => {
  const f = form.value;
  return [f.inputAudio, f.outputAudio, f.reasoning].filter((v) => v != null).length;
});

watch(
  () =>
    [props.active, props.initial, props.subjectKey, props.catalogBillingType, props.capabilities] as const,
  ([open, p]) => {
    if (!open) return;
    const allowed = allowedTypes.value;
    const fallback = allowed[0] ?? props.billingType;
    if (p && allowed.includes(p.billingType)) {
      form.value = loadRateIntoForm(p);
    } else if (allowed.includes(props.billingType)) {
      form.value = emptyForm(props.billingType);
    } else {
      form.value = emptyForm(fallback);
    }
    extrasOpen.value = extraCount.value > 0;
  },
  { immediate: true },
);

function addImageTier(): void {
  form.value.imageTiers.push({ size: '1024x1024', quality: 'standard', pricePerImage: 0 });
}

function removeImageTier(idx: number): void {
  if (form.value.imageTiers.length <= 1) return;
  form.value.imageTiers.splice(idx, 1);
}

function addVideoTier(): void {
  form.value.videoTiers.push({ resolution: '1080p', pricePerSecond: 0 });
}

function removeVideoTier(idx: number): void {
  if (form.value.videoTiers.length <= 1) return;
  form.value.videoTiers.splice(idx, 1);
}

const num = (v: Money): number => v ?? 0;
const opt = <K extends string>(key: K, v: Money): Partial<Record<K, number>> =>
  v == null ? {} : ({ [key]: v } as Record<K, number>);

function buildRateBody(): RateBody {
  const f = form.value;
  switch (f.billingType) {
    case 'per_token':
      if (isEmbedding.value) {
        return {
          billingType: 'per_token',
          rate: { input: { perMToken: num(f.inputPerM) }, output: { perMToken: 0 } },
        };
      }
      return {
        billingType: 'per_token',
        rate: {
          input: {
            perMToken: num(f.inputPerM),
            ...opt('cachedRead', f.cachedRead),
            ...opt('cachedWrite', f.cachedWrite),
            ...opt('audio', f.inputAudio),
          },
          output: {
            perMToken: num(f.outputPerM),
            ...opt('reasoning', f.reasoning),
            ...opt('audio', f.outputAudio),
          },
        },
      };
    case 'per_call':
      return {
        billingType: 'per_call',
        rate: { pricePerCall: num(f.pricePerCall) },
      };
    case 'per_credit':
      return { billingType: 'per_credit', rate: { pricePerCredit: num(f.pricePerCredit) } };
    case 'per_image':
      return { billingType: 'per_image', rate: { tiers: f.imageTiers.map((t) => ({ ...t })) } };
    case 'per_video':
      return {
        billingType: 'per_video',
        rate: {
          tiers: f.videoTiers.map((t) => ({ ...t })),
          ...opt('minSeconds', f.videoMinSeconds),
          ...opt('maxSeconds', f.videoMaxSeconds),
        },
      };
    case 'per_audio_minute':
      return { billingType: 'per_audio_minute', rate: { pricePerMinute: num(f.pricePerMinute) } };
    case 'per_character':
      return { billingType: 'per_character', rate: { pricePerKChar: num(f.pricePerKChar) } };
  }
}

defineExpose({ buildRateBody });
</script>

<template>
  <div class="rate-body">
    <div v-if="allowBillingType && allowedTypes.length > 1" class="type-row">
      <span class="type-row__label">计费方式</span>
      <el-select v-model="form.billingType" style="width: 100%">
        <el-option
          v-for="t in allowedTypes"
          :key="t"
          :label="BillingTypeLabel[t]"
          :value="t"
        />
      </el-select>
    </div>

    <template v-if="form.billingType === 'per_token' && isEmbedding">
      <div class="main-grid main-grid--one">
        <PriceField :currency-symbol="moneySymbol" v-model="form.inputPerM" label="向量" unit="每 1M tokens" placeholder="0" size="lg" />
      </div>
    </template>
    <template v-else-if="form.billingType === 'per_token'">
      <div class="io-grid">
        <div class="io-col">
          <span class="io-col__h">入 / 写</span>
          <PriceField :currency-symbol="moneySymbol" v-model="form.inputPerM" label="入" unit="每 1M tokens" placeholder="0" size="lg" />
          <PriceField :currency-symbol="moneySymbol" v-model="form.cachedWrite" label="写" unit="每 1M tokens" placeholder="同入价" />
        </div>
        <div class="io-col">
          <span class="io-col__h">出 / 读</span>
          <PriceField :currency-symbol="moneySymbol" v-model="form.outputPerM" label="出" unit="每 1M tokens" placeholder="0" size="lg" />
          <PriceField :currency-symbol="moneySymbol" v-model="form.cachedRead" label="读" unit="每 1M tokens" placeholder="同入价" />
        </div>
      </div>

      <div
        v-if="showReasoning || showAudio"
        class="extras"
        :class="{ 'extras--open': extrasOpen }"
      >
        <button type="button" class="extras__toggle" @click="extrasOpen = !extrasOpen">
          <el-icon class="extras__chevron"><ArrowRight /></el-icon>
          <span>音频与推理</span>
          <span v-if="extraCount > 0 && !extrasOpen" class="extras__badge">{{ extraCount }}</span>
        </button>
        <div v-show="extrasOpen" class="extras__grid">
          <template v-if="showAudio">
            <PriceField :currency-symbol="moneySymbol" v-model="form.inputAudio" label="音频入" unit="每 1M" placeholder="不计" />
            <PriceField :currency-symbol="moneySymbol" v-model="form.outputAudio" label="音频出" unit="每 1M" placeholder="不计" />
          </template>
          <PriceField :currency-symbol="moneySymbol"
            v-if="showReasoning"
            v-model="form.reasoning"
            label="reasoning"
            unit="每 1M"
            placeholder="同出价"
          />
        </div>
      </div>
    </template>

    <template v-else-if="form.billingType === 'per_call'">
      <div class="main-grid main-grid--one">
        <PriceField :currency-symbol="moneySymbol" v-model="form.pricePerCall" label="单次调用" unit="每次请求" placeholder="0" size="lg" />
      </div>
    </template>

    <div
      v-else-if="form.billingType === 'per_credit'"
      class="main-grid main-grid--one"
    >
      <PriceField
        v-model="form.pricePerCredit"
        :currency-symbol="moneySymbol"
        label="每积分"
        unit="每 1 积分"
        placeholder="0"
        size="lg"
      />
    </div>

    <div v-else-if="form.billingType === 'per_audio_minute'" class="main-grid main-grid--one">
      <PriceField :currency-symbol="moneySymbol" v-model="form.pricePerMinute" label="音频时长" unit="每分钟" placeholder="0" size="lg" />
    </div>

    <div v-else-if="form.billingType === 'per_character'" class="main-grid main-grid--one">
      <PriceField :currency-symbol="moneySymbol" v-model="form.pricePerKChar" label="文本长度" unit="每 1K 字符" placeholder="0" size="lg" />
    </div>

    <template v-else-if="form.billingType === 'per_image'">
      <div class="tiers">
        <div class="tiers__head">
          <span>size</span>
          <span>quality</span>
          <span class="tiers__price-col">{{ moneySymbol }} / 张</span>
          <span></span>
        </div>
        <div v-for="(row, idx) in form.imageTiers" :key="idx" class="tiers__row">
          <el-input v-model="row.size" placeholder="1024x1024" />
          <el-input v-model="row.quality" placeholder="standard / hd" />
          <el-input-number
            v-model="row.pricePerImage"
            :min="0"
            :precision="4"
            :step="0.01"
            :controls="false"
            class="tiers__price"
          />
          <el-button
            :icon="Delete"
            link
            type="danger"
            :disabled="form.imageTiers.length <= 1"
            @click="removeImageTier(idx)"
          />
        </div>
        <el-button :icon="Plus" link type="primary" class="tiers__add" @click="addImageTier">
          新增档位
        </el-button>
      </div>
    </template>

    <template v-else>
      <div class="tiers tiers--video">
        <div class="tiers__head">
          <span>resolution</span>
          <span class="tiers__price-col">{{ moneySymbol }} / 秒</span>
          <span></span>
        </div>
        <div v-for="(row, idx) in form.videoTiers" :key="idx" class="tiers__row">
          <el-input v-model="row.resolution" placeholder="720p / 1080p / 4k" />
          <el-input-number
            v-model="row.pricePerSecond"
            :min="0"
            :precision="4"
            :step="0.01"
            :controls="false"
            class="tiers__price"
          />
          <el-button
            :icon="Delete"
            link
            type="danger"
            :disabled="form.videoTiers.length <= 1"
            @click="removeVideoTier(idx)"
          />
        </div>
        <el-button :icon="Plus" link type="primary" class="tiers__add" @click="addVideoTier">
          新增档位
        </el-button>
      </div>
      <div class="seconds-row">
        <span class="seconds-row__label">时长限制</span>
        <el-input-number
          v-model="form.videoMinSeconds"
          :min="0"
          :precision="0"
          :controls="false"
          placeholder="最小"
          class="seconds-row__num"
        />
        <span class="seconds-row__sep">–</span>
        <el-input-number
          v-model="form.videoMaxSeconds"
          :min="0"
          :precision="0"
          :controls="false"
          placeholder="最大"
          class="seconds-row__num"
        />
        <span class="seconds-row__unit">秒，可留空</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.rate-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.type-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.type-row__label {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-regular);
}
.main-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.main-grid--one {
  grid-template-columns: minmax(0, 260px);
}
.io-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.io-col {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.io-col__h {
  font-size: 12px;
  font-weight: 500;
  color: var(--el-text-color-secondary);
}
.extras {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  padding: 4px;
}
.extras--open {
  padding-bottom: 12px;
}
.extras__toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  font-size: 13px;
  color: var(--el-text-color-regular);
  cursor: pointer;
}
.extras__toggle:hover {
  background: var(--el-fill-color-light);
}
.extras__chevron {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  transition: transform 0.18s;
}
.extras--open .extras__chevron {
  transform: rotate(90deg);
}
.extras__badge {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-size: 11px;
  line-height: 18px;
  text-align: center;
}
.extras__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 6px 10px 0;
}
.extras__grid--flat {
  padding: 0;
  grid-template-columns: minmax(0, 260px);
}
.tiers {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
}
.tiers__head,
.tiers__row {
  display: grid;
  grid-template-columns: 1fr 1fr 120px 28px;
  gap: 8px;
  align-items: center;
}
.tiers--video .tiers__head,
.tiers--video .tiers__row {
  grid-template-columns: 1fr 120px 28px;
}
.tiers__head {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.tiers__price-col {
  text-align: right;
}
.tiers__price {
  width: 100%;
}
.tiers__price :deep(.el-input__inner) {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.tiers__add {
  align-self: flex-start;
}
.seconds-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.seconds-row__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.seconds-row__num {
  width: 92px;
}
.seconds-row__sep,
.seconds-row__unit {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
