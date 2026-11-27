<script setup lang="ts">
/**
 * 模型定价：一条别名怎么出价。三选一：
 *
 *  - 继承分组：跟别名所在模型家族的分组定价走，分组一改就跟着变。分组是倍率就是 价格表(USD) × 分组倍率 = 有效价(CNY)；
 *    分组是按次 / 积分就直接用分组那个价，不看价格表——所以价格表里没有这条模型也能选。
 *  - 独立倍率：有效价 = 价格表 × 这条自己的倍率，顶掉分组的定价（不叠乘），分组再怎么改都不动。
 *  - 自定义：自己填有效价，计量必须跟模型同类（LLM 按量/按次，生图只能档位）。
 *
 * 渠道自己不管价格，这里没有「跟渠道走」这一项。
 */
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';

import type { ModelPrice, Rate, RateBody, RoutePricingMode, VendorFamilyPricing } from '@yomi/common';
import type { BillingType } from '@yomi/common';
import { MODEL_PRICE_CURRENCY, PRICE_CURRENCY, modelFamilyLabel } from '@yomi/common';
import { formatMultiplier } from '../model/rateSummary';
import {
  FAMILY_PRICING_UNIT,
  ROUTE_PRICING_CHOICE_LABEL,
  familyPricingOf,
  familyReadsPriceTable,
  formatFamilyPricing,
  formatUnitPrice,
  routePricingChoice,
  type RoutePricingChoice,
} from '../model/familyPricing';
import {
  allowedManualBillingTypes,
  isEmbeddingPrice,
  rateBodyDisplay,
  resolvePriceModelKind,
} from '../model/priceTable';
import { scaleRateBody } from '../model/rateScale';
import { getYomiPricingPort, getYomiRatePort } from '../services';
import { notifyCompile } from './pricing/compileFeedback';
import AliasMap from './AliasMap.vue';
import CompiledPriceCard from './pricing/CompiledPriceCard.vue';
import RateBodyForm, { type RateDraft } from './RateBodyForm.vue';

export interface RouteRateTarget {
  routeId: string | null;
  routeKey: string;
  vendorModel: string;
  pricingMode: RoutePricingMode;
  /** 这条现在存着的独立倍率；null = 继承家族分组。 */
  priceMultiplier: number | null;
  /** 所在模型家族的键（后端判的）。 */
  family: string;
  rate: Rate | null;
}

interface Props {
  modelValue: boolean;
  target: RouteRateTarget | null;
  /** 渠道的家族分组；别名继承的分组定价从这里按 `target.family` 取，取不到按默认的倍率 1 算。 */
  families: readonly VendorFamilyPricing[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'saved'): void;
}>();

const pricingPort = getYomiPricingPort();
const ratePort = getYomiRatePort();

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const choice = ref<RoutePricingChoice>('family');
/** 独立倍率草稿。el-input-number 清空后是 undefined。 */
const ownMultiplier = ref<number | undefined>(1);
const catalog = ref<ModelPrice | null>(null);
const catalogLoading = ref(false);
const catalogMissing = ref(false);
const saving = ref(false);
const formRef = ref<{ buildRateBody: () => RateDraft } | null>(null);

const familyName = computed(() => modelFamilyLabel(props.target?.family));

/** 别名所在家族的分组定价。 */
const familyPricing = computed(() => familyPricingOf(props.families, props.target?.family ?? ''));

/** 分组是按次 / 积分时，继承它的别名直接用的那个价；分组是倍率时为 null（那要对着牌价算）。 */
const familyFlatBody = computed<RateBody | null>(() => {
  const f = familyPricing.value;
  if (f.mode === 'per_call') return { billingType: 'per_call', rate: { pricePerCall: f.value } };
  if (f.mode === 'credit') return { billingType: 'per_credit', rate: { pricePerCredit: f.value } };
  return null;
});

const FLAT_NOTE = {
  per_call: '每次调用收这个价，不看价格表，也不看用了多少 token；改分组定价时这条一起变。',
  credit: '按上游报的积分计费，单价跟分组走；改分组定价时这条一起变。',
} as const;

interface ChoiceOption {
  value: RoutePricingChoice;
  name: string;
  hint: string;
}

const options = computed<ChoiceOption[]>(() => [
  {
    value: 'family',
    name: ROUTE_PRICING_CHOICE_LABEL.family,
    hint: `${familyName.value} 分组 ${formatFamilyPricing(familyPricing.value)}`,
  },
  { value: 'own', name: ROUTE_PRICING_CHOICE_LABEL.own, hint: '价格表 × 这条自己的倍率' },
  { value: 'manual', name: ROUTE_PRICING_CHOICE_LABEL.manual, hint: '自己填有效价' },
]);

const catalogBody = computed<RateBody | null>(() => {
  const p = catalog.value;
  if (!p) return null;
  return { billingType: p.billingType, rate: p.rate } as RateBody;
});

/** 牌价 × 倍率那张预览用的倍率：选了独立倍率就是草稿里那个数，否则是分组倍率。 */
const previewMultiplier = computed(() =>
  choice.value === 'own' ? (ownMultiplier.value ?? 0) : familyPricing.value.value,
);

const previewBody = computed<RateBody | null>(() => {
  const body = catalogBody.value;
  if (!body) return null;
  return scaleRateBody(body, previewMultiplier.value);
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

/** 「继承分组」这一栏现在该摆哪种预览：分组的那一个价，还是牌价 × 倍率的算式。 */
const showFlat = computed(() => choice.value === 'family' && familyFlatBody.value != null);

const customInitial = computed<RateDraft | null>(() => {
  const r = props.target?.rate;
  if (r) return { billingType: r.billingType, rate: r.rate } as RateDraft;
  // 还没定过价的别名，自定义从「继承分组会得到的那个价」起步：多半是想在它上面调一点。
  // 不跟着上面「独立倍率」的草稿跳。
  if (familyFlatBody.value) return familyFlatBody.value as RateDraft;
  return catalogBody.value ? scaleRateBody(catalogBody.value, familyPricing.value.value) : null;
});

const customBillingType = computed<BillingType>(
  () => customInitial.value?.billingType ?? 'per_token',
);

/** 手上没有这条模型的牌价：按牌价出价的选项（独立倍率、继承倍率分组）都选不了。 */
const noListPrice = computed(() => catalogMissing.value || !catalog.value);

function isDisabled(v: RoutePricingChoice): boolean {
  if (v === 'manual') return false;
  if (v === 'family') return familyReadsPriceTable(familyPricing.value) && noListPrice.value;
  return noListPrice.value;
}

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
    // 没设过独立倍率的，从分组倍率起步（分组不是倍率就从原价 1 起步）：多半是想在它上面调一点。
    ownMultiplier.value =
      t.priceMultiplier ?? (familyPricing.value.mode === 'multiplier' ? familyPricing.value.value : 1);
    const hasCatalogPromise = loadCatalog(t.vendorModel);
    if (t.rate == null) {
      choice.value = 'family';
      void hasCatalogPromise.then(() => {
        if (isDisabled('family')) choice.value = 'manual';
      });
      return;
    }
    choice.value = routePricingChoice(t.pricingMode, t.priceMultiplier);
  },
);

function pick(next: RoutePricingChoice): void {
  if (isDisabled(next) && !catalogLoading.value) return;
  choice.value = next;
}

/** 继承分组 / 独立倍率：都是让后端重算这一条。 */
async function saveCompiled(t: RouteRateTarget, multiplier: number | null, done: string): Promise<void> {
  if (!t.routeId) {
    ElMessage.error('这条别名没有路由主键，无法切到继承定价');
    return;
  }
  if (isDisabled(choice.value)) {
    ElMessage.error('价格表没有这条上游模型');
    return;
  }
  saving.value = true;
  try {
    const r = await pricingPort.setRoutePricing({ routeId: t.routeId, mode: 'compiled', multiplier });
    if (!r.success) {
      ElMessage.error(r.error.message);
      return;
    }
    notifyCompile(done, r.data);
    visible.value = false;
    emit('saved');
  } finally {
    saving.value = false;
  }
}

async function onSubmit(): Promise<void> {
  const t = props.target;
  if (!t) return;

  if (choice.value === 'family') {
    await saveCompiled(t, null, `${t.routeKey} 已继承 ${familyName.value} 分组定价`);
    return;
  }

  if (choice.value === 'own') {
    // 清空的输入框不能当 0 存：那是把这条悄悄改成免费。
    const own = ownMultiplier.value;
    if (own == null || !Number.isFinite(own)) {
      ElMessage.error('填写独立倍率');
      return;
    }
    await saveCompiled(t, own, `${t.routeKey} 独立倍率已设为 ${formatMultiplier(own)}`);
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
    ElMessage.success(`${t.routeKey} 已设为${ROUTE_PRICING_CHOICE_LABEL.manual}`);
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
          v-for="opt in options"
          :key="opt.value"
          type="button"
          class="rr-mode"
          :class="{ 'rr-mode--on': choice === opt.value }"
          :disabled="!catalogLoading && isDisabled(opt.value)"
          @click="pick(opt.value)"
        >
          <span class="rr-mode__name">{{ opt.name }}</span>
          <span class="rr-mode__hint">{{ opt.hint }}</span>
        </button>
      </div>

      <!-- 分组按次 / 按积分：没有「牌价 × 倍率」可展示，只有分组那一个价。 -->
      <div v-if="showFlat" class="rr-compiled">
        <div class="rr-flat">
          <span class="rr-flat__price">{{ formatUnitPrice(familyPricing.value) }}</span>
          <span class="rr-flat__unit">/ {{ FAMILY_PRICING_UNIT[familyPricing.mode] }}</span>
          <p class="rr-flat__note">
            {{ familyPricing.mode === 'credit' ? FLAT_NOTE.credit : FLAT_NOTE.per_call }}
          </p>
        </div>
      </div>
      <div
        v-else
        v-show="choice !== 'manual'"
        v-loading="catalogLoading"
        class="rr-compiled"
      >
        <div v-if="choice === 'own' && !noListPrice" class="rr-own">
          <el-input-number
            v-model="ownMultiplier"
            :min="0"
            :max="1000"
            :precision="4"
            :step="0.05"
            controls-position="right"
            class="rr-own__input"
          />
          <p class="rr-own__note">
            这条按「价格表 × 这个倍率」出价，不跟 {{ familyName }} 分组的定价；分组以后再怎么改，这条都不跟着变。
          </p>
        </div>
        <CompiledPriceCard
          v-if="compiledDisplay && catalogDisplay"
          :catalog="catalogDisplay"
          :effective="compiledDisplay"
          :multiplier="previewMultiplier"
          :multiplier-label="choice === 'own' ? '独立倍率' : `${familyName} 分组倍率`"
        />
        <p v-else-if="catalogMissing" class="rr-miss">
          价格表没有「{{ target.vendorModel }}」，{{ familyFlatBody ? '不能设独立倍率' : '只能自定义' }}。
        </p>
      </div>

      <RateBodyForm
        v-show="choice === 'manual'"
        ref="formRef"
        :active="visible && choice === 'manual'"
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
          :disabled="isDisabled(choice)"
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
  grid-template-columns: 1fr 1fr 1fr;
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
.rr-own {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}
.rr-own__input {
  width: 100%;
}
.rr-own__input :deep(.el-input__inner) {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  letter-spacing: -0.02em;
}
.rr-own__note {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}
.rr-miss {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}
.rr-flat {
  padding: 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  background: var(--el-fill-color-extra-light);
}
.rr-flat__price {
  font-size: 22px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  color: var(--el-text-color-primary);
}
.rr-flat__unit {
  margin-left: 4px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.rr-flat__note {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}
.rr-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
