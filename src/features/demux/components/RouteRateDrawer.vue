<script setup lang="ts">
/**
 * 模型定价：一条别名怎么出价。
 *
 *  - 渠道定价：有效价(CNY) = 价格表(USD) × 渠道倍率。
 *  - 自定义：自己填有效价，计量必须跟模型同类（LLM 按量/按次，生图只能档位）。
 */
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';

import type { ModelPrice, Rate, RateBody, RoutePricingMode } from '@demux/common';
import type { BillingType } from '@demux/common';
import { MODEL_PRICE_CURRENCY, PRICE_CURRENCY } from '@demux/common';
import { formatMultiplier } from '../model/rateSummary';
import {
  allowedManualBillingTypes,
  isEmbeddingPrice,
  rateBodyDisplay,
  resolvePriceModelKind,
} from '../model/priceTable';
import { scaleRateBody } from '../model/rateScale';
import { getDemuxPricingPort, getDemuxRatePort } from '../services';
import { notifyCompile } from './pricing/compileFeedback';
import AliasMap from './AliasMap.vue';
import CompiledPriceCard from './pricing/CompiledPriceCard.vue';
import RateBodyForm, { type RateDraft } from './RateBodyForm.vue';

export interface RouteRateTarget {
  routeId: string | null;
  routeKey: string;
  vendorModel: string;
  pricingMode: RoutePricingMode;
  rate: Rate | null;
}

interface Props {
  modelValue: boolean;
  target: RouteRateTarget | null;
  vendorMultiplier: number;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'saved'): void;
}>();

const pricingPort = getDemuxPricingPort();
const ratePort = getDemuxRatePort();

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const mode = ref<RoutePricingMode>('compiled');
const catalog = ref<ModelPrice | null>(null);
const catalogLoading = ref(false);
const catalogMissing = ref(false);
const saving = ref(false);
const formRef = ref<{ buildRateBody: () => RateDraft } | null>(null);

const catalogBody = computed<RateBody | null>(() => {
  const p = catalog.value;
  if (!p) return null;
  return { billingType: p.billingType, rate: p.rate } as RateBody;
});

const previewBody = computed<RateBody | null>(() => {
  const body = catalogBody.value;
  if (!body) return null;
  return scaleRateBody(body, props.vendorMultiplier);
});

const embedding = computed(() =>
  isEmbeddingPrice({
    modelKey: props.target?.vendorModel ?? '',
    capabilities: catalog.value?.capabilities ?? null,
  }),
);

const catalogDisplay = computed(() => {
  const body = catalogBody.value;
  if (!body) return null;
  return rateBodyDisplay(body, embedding.value, catalog.value?.currency ?? MODEL_PRICE_CURRENCY);
});

const compiledDisplay = computed(() => {
  const body = previewBody.value;
  if (!body) return null;
  return rateBodyDisplay(body, embedding.value, PRICE_CURRENCY);
});

const customInitial = computed<RateDraft | null>(() => {
  const r = props.target?.rate;
  if (!r) return previewBody.value;
  return { billingType: r.billingType, rate: r.rate } as RateDraft;
});

const customBillingType = computed<BillingType>(
  () => customInitial.value?.billingType ?? 'per_token',
);

const compiledDisabled = computed(() => catalogMissing.value || !catalog.value);

async function loadCatalog(vendorModel: string): Promise<void> {
  catalogLoading.value = true;
  catalog.value = null;
  catalogMissing.value = false;
  try {
    const r = await pricingPort.getModelPrice(vendorModel);
    if (r.success) {
      catalog.value = r.data;
    } else {
      catalogMissing.value = true;
    }
  } finally {
    catalogLoading.value = false;
  }
}

watch(
  () => [props.modelValue, props.target?.routeKey] as const,
  ([open, key]) => {
    if (!open || !key || !props.target) return;
    const t = props.target;
    const hasCatalogPromise = loadCatalog(t.vendorModel);
    if (t.rate == null) {
      mode.value = 'compiled';
      void hasCatalogPromise.then(() => {
        if (catalogMissing.value) mode.value = 'manual';
      });
      return;
    }
    mode.value = t.pricingMode;
  },
);

function pickMode(next: RoutePricingMode): void {
  if (next === 'compiled' && compiledDisabled.value && !catalogLoading.value) return;
  mode.value = next;
}

async function onSubmit(): Promise<void> {
  const t = props.target;
  if (!t) return;

  if (mode.value === 'compiled') {
    if (!t.routeId) {
      ElMessage.error('这条别名没有路由主键，无法切到渠道定价');
      return;
    }
    if (catalogMissing.value || !catalog.value) {
      ElMessage.error('价格表没有这条上游模型');
      return;
    }
    saving.value = true;
    try {
      const r = await pricingPort.setRoutePricing({
        routeId: t.routeId,
        mode: 'compiled',
        multiplier: null,
      });
      if (!r.success) {
        ElMessage.error(r.error.message);
        return;
      }
      notifyCompile(`${t.routeKey} 已按渠道定价重算`, r.data);
      visible.value = false;
      emit('saved');
    } finally {
      saving.value = false;
    }
    return;
  }

  const body = formRef.value?.buildRateBody();
  if (!body) return;
  const allowed = allowedManualBillingTypes(
    resolvePriceModelKind({
      modelKey: t.vendorModel,
      catalogBillingType: catalog.value?.billingType ?? null,
      capabilities: catalog.value?.capabilities ?? null,
    }),
  );
  if (!allowed.includes(body.billingType)) {
    ElMessage.error('计费方式必须和这种模型相符');
    return;
  }
  saving.value = true;
  try {
    const r = await ratePort.upsert({ modelId: t.routeKey, ...body });
    if (!r.success) {
      ElMessage.error(r.error.message);
      return;
    }
    ElMessage.success(`${t.routeKey} 已设为自定义`);
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
    size="600px"
    :close-on-click-modal="false"
    destroy-on-close
    header-class="route-rate-header"
    body-class="route-rate-body"
    footer-class="route-rate-footer"
  >
    <template #header>
      <div class="rr-head">
        <span class="rr-head__noun">定价</span>
        <AliasMap
          v-if="target"
          class="rr-head__alias"
          :alias="target.routeKey"
          :target="target.vendorModel"
        />
      </div>
    </template>

    <div v-if="target" class="rr">
      <div class="rr-modes">
        <button
          type="button"
          class="rr-mode"
          :class="{ 'rr-mode--on': mode === 'compiled' }"
          :disabled="!catalogLoading && compiledDisabled"
          @click="pickMode('compiled')"
        >
          <span class="rr-mode__name">渠道定价</span>
          <span class="rr-mode__hint">价格表 {{ formatMultiplier(vendorMultiplier) }}</span>
        </button>
        <button
          type="button"
          class="rr-mode"
          :class="{ 'rr-mode--on': mode === 'manual' }"
          @click="pickMode('manual')"
        >
          <span class="rr-mode__name">自定义</span>
          <span class="rr-mode__hint">自己填有效价</span>
        </button>
      </div>

      <div v-show="mode === 'compiled'" v-loading="catalogLoading" class="rr-compiled">
        <CompiledPriceCard
          v-if="compiledDisplay && catalogDisplay"
          :catalog="catalogDisplay"
          :effective="compiledDisplay"
          :multiplier="vendorMultiplier"
        />
        <p v-else-if="catalogMissing" class="rr-miss">
          价格表没有「{{ target.vendorModel }}」，只能自定义。
        </p>
      </div>

      <RateBodyForm
        v-show="mode === 'manual'"
        ref="formRef"
        :active="visible && mode === 'manual'"
        :subject-key="target.vendorModel"
        :initial="customInitial"
        :billing-type="customBillingType"
        :capabilities="catalog?.capabilities ?? null"
        :catalog-billing-type="catalog?.billingType ?? null"
        allow-billing-type
      />
    </div>

    <template #footer>
      <div class="rr-foot">
        <el-button @click="visible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="saving"
          :disabled="mode === 'compiled' && compiledDisabled"
          @click="onSubmit"
        >
          保存
        </el-button>
      </div>
    </template>
  </el-drawer>
</template>

<style>
.route-rate-header {
  margin-bottom: 0 !important;
  padding: 16px 20px 14px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.route-rate-body {
  padding: 20px;
}
.route-rate-footer {
  padding: 12px 20px 16px;
  border-top: 1px solid var(--el-border-color-lighter);
}
</style>

<style scoped>
.rr-head {
  min-width: 0;
  padding-right: 28px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.rr-head__noun {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.3;
}
.rr-head__alias {
  min-width: 0;
}
.rr {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.rr-modes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.rr-mode {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 12px 14px;
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
  background: var(--el-bg-color);
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.15s,
    background 0.15s;
}
.rr-mode:hover:not(:disabled) {
  border-color: var(--el-border-color-darker);
}
.rr-mode--on {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.rr-mode:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.rr-mode__name {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.rr-mode--on .rr-mode__name {
  color: var(--el-color-primary);
}
.rr-mode__hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.35;
}
.rr-compiled {
  min-height: 160px;
}
.rr-miss {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}
.rr-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
