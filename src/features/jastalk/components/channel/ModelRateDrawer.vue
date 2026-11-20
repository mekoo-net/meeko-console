<script setup lang="ts">
/**
 * 一个模型怎么出价（照 Yomi 的模型定价抽屉，两张方式卡片）：
 *
 *  - 跟随渠道：积分 = 牌价（美元）× 渠道倍率 × 100，牌价或倍率一变就跟着变；
 *  - 单独定价：自己填积分价，重算不碰它。
 *
 * 后端没有「这个模型用哪种方式」的开关：价格表里有它单独定的一行就是单独定价，没有就跟渠道。
 * 所以切回跟随渠道 = 删掉那一行（后端当场给它重算）；牌价里没有、或者折不成这个单位的模型跟不了渠道，卡片上说原因。
 */
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';

import {
  categoryPriceSlots,
  followBlock,
  followBlockText,
  multiplierText,
  pricingLabels,
  type PriceSlot,
} from '../../model/channelPricing';
import { notifyCompile } from '../../model/compileFeedback';
import type { Channel, ChannelModel } from '../../model/jastalk.types';
import { unitPer } from '../../model/jastalkFormat';
import { getJastalkAdminPort } from '../../services';
import ListPriceFormula from './ListPriceFormula.vue';

import './drawer.css';

const props = defineProps<{
  modelValue: boolean;
  target: ChannelModel | null;
  channel: Channel | null;
  /** false = 手上没有牌价：每个模型的牌价都是空的，那是没读到，不是牌价里没有它。 */
  listPricesLoaded: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'saved'): void;
}>();

const port = getJastalkAdminPort();

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

type Mode = 'compiled' | 'manual';
const mode = ref<Mode>('compiled');
/** 单独定价填的数。清空了是 null / undefined，保存时拦下。 */
const prices = reactive<Record<PriceSlot['side'], number | null | undefined>>({ input: 0, output: 0 });
const saving = ref(false);

const model = computed(() => props.target?.model ?? null);

/** 为什么跟不了渠道；能跟是 null。 */
const block = computed(() =>
  props.target && props.channel
    ? followBlock({
        multiplier: props.channel.multiplier,
        listPrice: props.target.listPrice,
        listPricesLoaded: props.listPricesLoaded,
      })
    : null,
);

const blockText = computed(() =>
  block.value && props.target ? followBlockText(block.value, props.target.listPrice, props.target.model.unit) : '',
);

const followHint = computed(() => (block.value ? blockText.value : `牌价 ${multiplierText(props.channel?.multiplier ?? null)}`));

const slots = computed(() => (model.value ? categoryPriceSlots[model.value.category] : []));

function reset(): void {
  const target = props.target;
  if (!target) return;
  const manual = target.pricing === 'manual';
  mode.value = manual || block.value ? 'manual' : 'compiled';

  // 单独定价从哪个数起步：已经单独定过的用它自己的；没定过的用跟渠道折出来的（多半只是想在这个数上调一点）；
  // 都没有就用现在生效的（默认价，或者 0）。
  const fromList = manual ? null : target.listPrice;
  prices.input = fromList?.pointsInput ?? target.model.inputPrice;
  prices.output = fromList?.pointsOutput ?? target.model.outputPrice;
  // 这一类用不上的那个数（语音合成的输入价、听写的输出价）不摆出来填：人定过的原样留着，别的记 0，
  // 免得价格表里多出一个没人填过的数。
  if (!manual) {
    const used = new Set(categoryPriceSlots[target.model.category].map((slot) => slot.side));
    if (!used.has('input')) prices.input = 0;
    if (!used.has('output')) prices.output = 0;
  }
}

async function saveManual(target: ChannelModel): Promise<boolean> {
  if (slots.value.some((slot) => prices[slot.side] == null)) {
    ElMessage.error('填写价格');
    return false;
  }
  const r = await port.saveRate({
    vendorKey: target.model.vendorKey,
    modelName: target.model.modelName,
    unit: target.model.unit,
    inputPrice: prices.input ?? 0,
    outputPrice: prices.output ?? 0,
  });
  if (!r.success) {
    ElMessage.error(r.error.message);
    return false;
  }
  ElMessage.success(`${target.model.displayName} 已${pricingLabels.manual}`);
  return true;
}

async function saveFollow(target: ChannelModel): Promise<boolean> {
  // 本来就跟着渠道：没有要改的
  if (target.pricing === 'compiled') return true;

  if (target.pricing === 'manual') {
    // 单独定价的模型一定带着它那一行价格的编号；没有就是手上这份详情和后端对不上了，不猜着去删别的行
    if (target.rateId === null) {
      ElMessage.error('没找到它单独定的那一行价格，刷新后再试');
      return false;
    }
    const r = await port.deleteRate(target.rateId);
    if (!r.success) {
      ElMessage.error(r.error.message);
      return false;
    }
    ElMessage.success(`${target.model.displayName} 已${pricingLabels.compiled}`);
    return true;
  }

  // 落在默认价上、或者还没有价：价格表里缺它跟渠道算出来的那一行，把这个渠道重算一遍补上
  const r = await port.compileRates(target.model.vendorKey);
  if (!r.success) {
    ElMessage.error(r.error.message);
    return false;
  }
  notifyCompile(`${target.model.displayName} 已${pricingLabels.compiled}`, r.data);
  return true;
}

async function submit(): Promise<void> {
  const target = props.target;
  if (!target || (mode.value === 'compiled' && block.value)) return;
  saving.value = true;
  try {
    const done = mode.value === 'manual' ? await saveManual(target) : await saveFollow(target);
    if (!done) return;
    visible.value = false;
    emit('saved');
  } finally {
    saving.value = false;
  }
}

watch(
  () => [props.modelValue, props.target?.model.id] as const,
  ([open]) => {
    if (open) reset();
  },
);
</script>

<template>
  <el-drawer
    v-model="visible"
    size="560px"
    :close-on-click-modal="false"
    destroy-on-close
    header-class="jastalk-drawer-header"
    body-class="jastalk-drawer-body"
    footer-class="jastalk-drawer-footer"
  >
    <template #header>
      <div class="mr-head">
        <span class="mr-head__noun">定价</span>
        <span
          v-if="model"
          class="mr-head__model"
        >
          {{ model.displayName }}
          <span class="mr-head__key">{{ model.modelName }}</span>
        </span>
      </div>
    </template>

    <div
      v-if="target && model && channel"
      class="mr"
    >
      <div class="mr-modes">
        <button
          type="button"
          class="mr-mode"
          :class="{ 'mr-mode--on': mode === 'compiled' }"
          :disabled="block !== null"
          @click="mode = 'compiled'"
        >
          <span class="mr-mode__name">{{ pricingLabels.compiled }}</span>
          <span class="mr-mode__hint">{{ followHint }}</span>
        </button>
        <button
          type="button"
          class="mr-mode"
          :class="{ 'mr-mode--on': mode === 'manual' }"
          @click="mode = 'manual'"
        >
          <span class="mr-mode__name">{{ pricingLabels.manual }}</span>
          <span class="mr-mode__hint">自己填积分价</span>
        </button>
      </div>

      <ListPriceFormula
        v-if="mode === 'compiled' && target.listPrice && channel.multiplier !== null"
        :category="model.category"
        :list-price="target.listPrice"
        :multiplier="channel.multiplier"
      />

      <div
        v-if="mode === 'manual'"
        class="mr-manual"
      >
        <div
          v-for="slot in slots"
          :key="slot.side"
          class="mr-field"
        >
          <span class="mr-field__label">{{ slot.label }}</span>
          <el-input-number
            v-model="prices[slot.side]"
            :min="0"
            :precision="model.unit === 'token' ? 2 : 4"
            :step="model.unit === 'token' ? 100 : model.unit === 'image' ? 1 : 0.01"
            controls-position="right"
            class="mr-field__input"
          />
          <span class="mr-field__unit">积分 {{ unitPer[model.unit] }}</span>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="mr-foot">
        <el-button @click="visible = false">
          取消
        </el-button>
        <el-button
          type="primary"
          :loading="saving"
          :disabled="mode === 'compiled' && block !== null"
          @click="submit"
        >
          保存
        </el-button>
      </div>
    </template>
  </el-drawer>
</template>

<style scoped>
.mr-head {
  min-width: 0;
  padding-right: 28px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.mr-head__noun {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.3;
}

.mr-head__model {
  font-size: 13px;
  color: var(--el-text-color-regular);
  overflow-wrap: anywhere;
}

.mr-head__key {
  margin-left: 6px;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.mr {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.mr-modes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.mr-mode {
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

.mr-mode:hover:not(:disabled) {
  border-color: var(--el-border-color-darker);
}

.mr-mode--on {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

/* 不能选的那张不整体压淡：上面写着为什么不能选，得看得清 */
.mr-mode:disabled {
  cursor: not-allowed;
  background: var(--el-fill-color-light);
}

.mr-mode:disabled .mr-mode__name {
  color: var(--el-text-color-placeholder);
}

.mr-mode__name {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.mr-mode--on .mr-mode__name {
  color: var(--el-color-primary);
}

.mr-mode__hint {
  font-size: 12px;
  line-height: 1.35;
  color: var(--el-text-color-secondary);
}

.mr-manual {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.mr-field {
  display: grid;
  grid-template-columns: 56px 200px 1fr;
  align-items: center;
  gap: 10px;
}

.mr-field__label {
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.mr-field__input {
  width: 100%;
}

.mr-field__unit {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.mr-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
