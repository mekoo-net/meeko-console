<script setup lang="ts">
/**
 * 新建模型：在左栏选中的厂家下建。两种——
 * - 填写价格：这一步定模型名和类型，下一步再填价。类型只在这里问一次：它定了怎么计量，所以填价那一步没有「计费方式」可挑；
 *   已有的行也不换类型（要换就删了重建）。向量化仍是按 token 计，但只收入价，所以单列一类。
 * - 映射模型：一个模型名按这一家里已有的一行出价（目录里是 gemini-3.1-pro-preview，渠道叫 gemini-3.1-pro）。
 *   在这里就建好，没有下一步；名字是渠道里的叫法，原样存（只收成小写），不剥前缀和日期钉。
 */
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';

import { canonicalizeModelKey, compactModelKey, makerLabel, type BillingType } from '@yomi/common';
import ModelKindMark from '@/features/yomi/components/pricing/ModelKindMark.vue';
import type { PriceModelKind } from '@/features/yomi/model/priceTable';

import { failureText } from '../../model/ratecard';
import type { ModelPriceRow, PriceMapping, PriceMappingWriteResult } from '../../model/ratecard.types';
import { getOneApiRatecardPort } from '../../services';

export interface NewPriceModel {
  modelKey: string;
  kind: PriceModelKind;
  billingType: BillingType;
}

const props = defineProps<{
  modelValue: boolean;
  /** 建在哪个厂家下面（左栏选中的那家）。 */
  maker: string;
  /** 这一家有价的行：映射只能指向它们。 */
  models: readonly ModelPriceRow[];
  /** 已有的映射（整张表的）：新建的名字是其中一个时先拦下，说清它现在映射到哪。 */
  mappings: readonly PriceMapping[];
  /** 号池后台有映射这回事才摆「映射模型」。 */
  canMap: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'next', model: NewPriceModel): void;
  (e: 'mapped', result: PriceMappingWriteResult): void;
}>();

const port = getOneApiRatecardPort();

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const TYPE_OPTIONS: readonly {
  value: PriceModelKind;
  billingType: BillingType;
  label: string;
  meter: string;
}[] = [
  { value: 'per_token', billingType: 'per_token', label: '文本 / 对话', meter: '按 token' },
  { value: 'embedding', billingType: 'per_token', label: '向量化', meter: '按输入 token' },
  { value: 'per_image', billingType: 'per_image', label: '生图', meter: '按张' },
  { value: 'per_video', billingType: 'per_video', label: '视频', meter: '按秒' },
  { value: 'per_audio_minute', billingType: 'per_audio_minute', label: '音频转写', meter: '按分钟' },
  { value: 'per_character', billingType: 'per_character', label: '语音合成', meter: '按字符' },
  { value: 'per_credit', billingType: 'per_credit', label: '积分', meter: '按上游积分' },
  { value: 'per_call', billingType: 'per_call', label: '其它', meter: '按次' },
];

const mode = ref<'price' | 'map'>('price');
const nameInput = ref('');
const kind = ref<PriceModelKind>('per_token');
const targetId = ref('');
const checking = ref(false);

const targets = computed(() => [...props.models].sort((a, b) => a.modelKey.localeCompare(b.modelKey)));

/** 这个名字（或它换一种写法）已经是哪个映射的名字。 */
function mappedAs(name: string): PriceMapping | undefined {
  const compact = compactModelKey(name);
  return props.mappings.find((m) => m.modelKey === name || (compact !== '' && compactModelKey(m.modelKey) === compact));
}

async function confirmMapping(): Promise<void> {
  const modelKey = nameInput.value.trim().toLowerCase();
  if (!modelKey) {
    ElMessage.warning('请输入渠道里的模型名，例如 gemini-3.1-pro');
    return;
  }
  const taken = mappedAs(modelKey);
  if (taken) {
    ElMessage.warning(`「${taken.modelKey}」已经映射到 ${taken.targetKey}`);
    return;
  }
  if (!targetId.value) {
    ElMessage.warning('请选择映射到哪个模型');
    return;
  }
  checking.value = true;
  try {
    // 名字已经是一行牌价（换一种写法也算）由号池后台拦：它按归一后的键比，比这边比字符串准
    const r = await port.saveMapping({ modelKey, targetId: targetId.value });
    if (!r.success) {
      ElMessage.error(failureText(r.error));
      return;
    }
    visible.value = false;
    emit('mapped', r.data);
  } finally {
    checking.value = false;
  }
}

async function confirm(): Promise<void> {
  if (checking.value) return;
  if (mode.value === 'map') {
    await confirmMapping();
    return;
  }
  // 号池后台录入时会把名字收成干净名（剥渠道前缀和日期钉）；这里先收一遍，下一步标题上写的就是存进去的那个键
  const modelKey = canonicalizeModelKey(nameInput.value);
  if (!modelKey) {
    ElMessage.warning('请输入厂家发布的模型名，例如 claude-opus-5');
    return;
  }
  // 名字现在按另一行出价：号池后台不让它再有自己的价（各产品会说不清按哪一行），先在这里说清
  const taken = mappedAs(modelKey);
  if (taken) {
    ElMessage.warning(`「${taken.modelKey}」已经映射到 ${taken.targetKey}，要单独定价先删掉映射`);
    return;
  }
  checking.value = true;
  try {
    // 不带行号的录入「键在表里就改」：不先查一下，填了一个表里已有的名字（或它的另一种写法）就会把那一行的价悄悄盖掉。
    // 查重问后端——它按归一后的键找，比这边比字符串准。
    const existing = await port.find(modelKey);
    if (!existing.success) {
      ElMessage.error(failureText(existing.error));
      return;
    }
    if (existing.data) {
      ElMessage.warning(`「${existing.data.modelKey}」已经在表里了（${makerLabel(existing.data.maker)}）`);
      return;
    }
  } finally {
    checking.value = false;
  }
  const picked = TYPE_OPTIONS.find((o) => o.value === kind.value)!;
  visible.value = false;
  emit('next', { modelKey, kind: picked.value, billingType: picked.billingType });
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    mode.value = 'price';
    nameInput.value = '';
    kind.value = 'per_token';
    targetId.value = '';
    checking.value = false;
  },
);
</script>

<template>
  <el-dialog
    v-model="visible"
    width="420px"
    :close-on-click-modal="false"
  >
    <template #header>
      <div class="create-head">
        <span class="create-head__noun">新建模型</span>
        <span class="create-head__maker">{{ makerLabel(maker) }}</span>
      </div>
    </template>
    <el-radio-group
      v-if="canMap"
      v-model="mode"
      class="create-mode"
    >
      <el-radio-button value="price">
        填写价格
      </el-radio-button>
      <el-radio-button value="map">
        映射模型
      </el-radio-button>
    </el-radio-group>
    <el-input
      v-model="nameInput"
      :placeholder="mode === 'map' ? '渠道里的叫法，例如 gemini-3.1-pro' : 'gpt-5.2 / claude-sonnet-4-6'"
      clearable
      autofocus
      @keyup.enter="confirm"
    />
    <el-select
      v-if="mode === 'map'"
      v-model="targetId"
      class="create-target"
      placeholder="映射到"
      filterable
    >
      <el-option
        v-for="m in targets"
        :key="m.id"
        :label="m.modelKey"
        :value="m.id"
      />
    </el-select>
    <div
      v-else
      class="create-types"
    >
      <button
        v-for="opt in TYPE_OPTIONS"
        :key="opt.value"
        type="button"
        class="type-card"
        :class="{ 'type-card--active': kind === opt.value }"
        @click="kind = opt.value"
      >
        <span class="type-card__mark">
          <ModelKindMark
            :kind="opt.value"
            icon-only
          />
        </span>
        <span class="type-card__name">{{ opt.label }}</span>
        <span class="type-card__meter">{{ opt.meter }}</span>
      </button>
    </div>
    <template #footer>
      <el-button @click="visible = false">
        取消
      </el-button>
      <el-button
        type="primary"
        :loading="checking"
        @click="confirm"
      >
        {{ mode === 'map' ? '创建' : '下一步' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.create-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.create-head__noun {
  font-size: 16px;
  font-weight: 600;
}
.create-head__maker {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.create-mode {
  margin-bottom: 12px;
}
.create-target {
  width: 100%;
  margin-top: 12px;
}
.create-types {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 12px;
}
.type-card {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr);
  grid-template-rows: auto auto;
  column-gap: 8px;
  row-gap: 1px;
  align-items: center;
  padding: 9px 10px;
  border: 1px solid var(--el-border-color);
  border-radius: 9px;
  background: var(--el-bg-color);
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.15s,
    background 0.15s;
}
.type-card:hover {
  border-color: var(--el-border-color-darker);
}
.type-card--active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.type-card__mark {
  grid-row: 1 / 3;
  display: flex;
}
.type-card__name {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}
.type-card--active .type-card__name {
  color: var(--el-color-primary);
}
.type-card__meter {
  font-size: 11.5px;
  color: var(--el-text-color-secondary);
}
</style>
