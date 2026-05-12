<script setup lang="ts">
/**
 * 定价编辑对话框（按 modelId upsert）。
 *
 * 表单结构随 `mode` 变化：
 *  - per_token：input / output 单价 + LV 倍率表
 *  - per_call / per_image / per_minute：单一价
 *
 * `tierMultipliers` 用一组 LV → multiplier 行编辑；删除某 LV = 该 LV 走 1.0。
 */
import { computed, ref, watch } from 'vue';
import { Delete, Plus } from '@element-plus/icons-vue';
import type { FormInstance, FormRules } from 'element-plus';

import { TIER_THRESHOLDS } from '@/features/accounts/model/tierConfig';

import {
  pricingModeValues,
  PricingModeLabel,
  type PricingMode,
} from '../model/enums';
import type { Pricing, UpsertPricingInput } from '../model/pricing.types';
import type { Model } from '../model/model.types';

interface Props {
  modelValue: boolean;
  pricing: Pricing | null;
  model: Model | null;
  loading: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'submit', payload: UpsertPricingInput): void;
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

interface TierRow {
  level: number;
  multiplier: number;
}

interface FormState {
  modelId: string;
  mode: PricingMode;
  inputPricePerKToken: number | null;
  outputPricePerKToken: number | null;
  pricePerCall: number | null;
  pricePerImage: number | null;
  pricePerMinute: number | null;
  multiplier: number;
  currency: string;
  tierRows: TierRow[];
  effectiveFromUtc: string;
}

const emptyForm = (modelId: string): FormState => ({
  modelId,
  mode: 'per_token',
  inputPricePerKToken: 0,
  outputPricePerKToken: 0,
  pricePerCall: null,
  pricePerImage: null,
  pricePerMinute: null,
  multiplier: 1.0,
  currency: 'CNY',
  tierRows: [],
  effectiveFromUtc: new Date().toISOString(),
});

const form = ref<FormState>(emptyForm(''));
const formRef = ref<FormInstance | null>(null);

const rules: FormRules<FormState> = {
  multiplier: [
    { required: true, type: 'number', min: 0.0001, message: '倍率 > 0', trigger: 'blur' },
  ],
  effectiveFromUtc: [{ required: true, message: '请选择生效时间', trigger: 'change' }],
};

watch(
  () => [props.modelValue, props.pricing, props.model] as const,
  ([open, p, m]) => {
    if (!open) return;
    if (p) {
      form.value = {
        modelId: p.modelId,
        mode: p.mode,
        inputPricePerKToken: p.inputPricePerKToken ?? null,
        outputPricePerKToken: p.outputPricePerKToken ?? null,
        pricePerCall: p.pricePerCall ?? null,
        pricePerImage: p.pricePerImage ?? null,
        pricePerMinute: p.pricePerMinute ?? null,
        multiplier: p.multiplier,
        currency: p.currency,
        tierRows: Object.entries(p.tierMultipliers).map(([k, v]) => ({
          level: Number(k),
          multiplier: v,
        })),
        effectiveFromUtc: p.effectiveFromUtc,
      };
    } else if (m) {
      form.value = emptyForm(m.modelId);
    }
  },
  { immediate: true },
);

function addTierRow(): void {
  const used = new Set(form.value.tierRows.map((r) => r.level));
  const next = TIER_THRESHOLDS.find((t) => !used.has(t.level));
  if (!next) return;
  form.value.tierRows.push({ level: next.level, multiplier: 0.9 });
}

function removeTierRow(idx: number): void {
  form.value.tierRows.splice(idx, 1);
}

async function onSubmit(): Promise<void> {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  const f = form.value;
  const tierMultipliers: Record<string, number> = {};
  for (const row of f.tierRows) {
    if (row.multiplier > 0 && row.multiplier !== 1) {
      tierMultipliers[String(row.level)] = row.multiplier;
    }
  }
  const payload: UpsertPricingInput = {
    modelId: f.modelId,
    mode: f.mode,
    inputPricePerKToken: f.mode === 'per_token' ? f.inputPricePerKToken ?? 0 : null,
    outputPricePerKToken: f.mode === 'per_token' ? f.outputPricePerKToken ?? 0 : null,
    pricePerCall: f.mode === 'per_call' ? f.pricePerCall ?? 0 : null,
    pricePerImage: f.mode === 'per_image' ? f.pricePerImage ?? 0 : null,
    pricePerMinute: f.mode === 'per_minute' ? f.pricePerMinute ?? 0 : null,
    multiplier: f.multiplier,
    currency: f.currency,
    tierMultipliers,
    effectiveFromUtc: f.effectiveFromUtc,
  };
  emit('submit', payload);
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="pricing ? `编辑定价 · ${pricing.modelId}` : `新建定价 · ${model?.modelId ?? ''}`"
    width="640px"
    :close-on-click-modal="false"
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="124px"
      label-position="right"
      @submit.prevent
    >
      <el-form-item label="modelId">
        <el-input v-model="form.modelId" disabled />
      </el-form-item>

      <el-form-item label="计费模式">
        <el-radio-group v-model="form.mode">
          <el-radio v-for="m in pricingModeValues" :key="m" :value="m">
            {{ PricingModeLabel[m] }}
          </el-radio>
        </el-radio-group>
      </el-form-item>

      <template v-if="form.mode === 'per_token'">
        <el-form-item label="输入单价">
          <el-input-number
            v-model="form.inputPricePerKToken"
            :min="0"
            :precision="4"
            :step="0.001"
            style="width: 200px"
          />
          <span class="suffix">CNY / 1K tokens</span>
        </el-form-item>
        <el-form-item label="输出单价">
          <el-input-number
            v-model="form.outputPricePerKToken"
            :min="0"
            :precision="4"
            :step="0.001"
            style="width: 200px"
          />
          <span class="suffix">CNY / 1K tokens</span>
        </el-form-item>
      </template>

      <el-form-item v-if="form.mode === 'per_call'" label="单次价">
        <el-input-number
          v-model="form.pricePerCall"
          :min="0"
          :precision="4"
          :step="0.001"
          style="width: 200px"
        />
        <span class="suffix">CNY / 次</span>
      </el-form-item>

      <el-form-item v-if="form.mode === 'per_image'" label="单张价">
        <el-input-number
          v-model="form.pricePerImage"
          :min="0"
          :precision="4"
          :step="0.01"
          style="width: 200px"
        />
        <span class="suffix">CNY / 张</span>
      </el-form-item>

      <el-form-item v-if="form.mode === 'per_minute'" label="分钟价">
        <el-input-number
          v-model="form.pricePerMinute"
          :min="0"
          :precision="4"
          :step="0.01"
          style="width: 200px"
        />
        <span class="suffix">CNY / 分钟</span>
      </el-form-item>

      <el-form-item label="全局倍率" prop="multiplier">
        <el-input-number
          v-model="form.multiplier"
          :min="0.01"
          :max="100"
          :precision="2"
          :step="0.05"
          style="width: 180px"
        />
        <span class="suffix">应用于所有 LV 之上的统一调价</span>
      </el-form-item>

      <el-form-item label="LV 倍率">
        <div class="tier-rows">
          <div v-for="(row, idx) in form.tierRows" :key="idx" class="tier-row">
            <el-select v-model="row.level" style="width: 140px">
              <el-option
                v-for="t in TIER_THRESHOLDS"
                :key="t.level"
                :label="t.name"
                :value="t.level"
              />
            </el-select>
            <el-input-number
              v-model="row.multiplier"
              :min="0.01"
              :max="10"
              :precision="2"
              :step="0.05"
              style="width: 140px"
            />
            <el-button :icon="Delete" link type="danger" @click="removeTierRow(idx)" />
          </div>
          <el-button
            :icon="Plus"
            link
            type="primary"
            class="tier-row__add"
            :disabled="form.tierRows.length >= TIER_THRESHOLDS.length"
            @click="addTierRow"
          >
            新增 LV 倍率
          </el-button>
        </div>
        <div class="form-hint">未列出的 LV 走 1.0；最终扣费 = 基价 × tokens × 全局倍率 × LV 倍率。</div>
      </el-form-item>

      <el-form-item label="生效时间">
        <el-date-picker
          v-model="form.effectiveFromUtc"
          type="datetime"
          value-format="YYYY-MM-DDTHH:mm:ss[Z]"
          placeholder="选择生效时间"
        />
        <div class="form-hint">未来时间 = 预生效，BFF 调度按"最近一条已生效"计费。</div>
      </el-form-item>
    </el-form>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" :loading="loading" @click="onSubmit">保存</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.suffix {
  margin-left: 10px;
  color: var(--el-text-color-secondary);
  font-size: 12.5px;
}
.form-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}
.tier-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tier-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.tier-row__add {
  align-self: flex-start;
}
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
