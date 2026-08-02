<script setup lang="ts">
/**
 * 定价编辑对话框（按 modelId upsert）。
 *
 * 表单形状随 `billingType` 切换（discriminated union）：
 *  - `per_token`        ：input / output / 可选 cached / reasoning
 *  - `per_call`         ：单次价 / 可选缓存单次价
 *  - `per_image`        ：tiers[]，每行 (size, quality, pricePerImage)
 *  - `per_video`        ：tiers[]，每行 (resolution, pricePerSecond) + min/maxSeconds
 *  - `per_audio_minute` ：pricePerMinute
 *  - `per_character`    ：pricePerKChar
 *
 * `tierMultipliers` 是用户级 LV 折扣，与 `rate.tiers[]` 是两个概念。
 */
import { computed, ref, watch } from 'vue';
import { Delete, Plus } from '@element-plus/icons-vue';
import type { FormInstance, FormRules } from 'element-plus';

import { TIER_THRESHOLDS } from '@/features/platform/accounts/model/tierConfig';

import {
  billingTypeValues,
  BillingTypeLabel,
  type BillingType,
} from '@demux/common';
import type {
  PerImageTier,
  PerVideoTier,
  Rate,
  UpsertRateInput,
} from '@demux/common';
import type { Model } from '@demux/common';

interface Props {
  modelValue: boolean;
  rate: Rate | null;
  model: Model | null;
  loading: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'submit', payload: UpsertRateInput): void;
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

interface MultiplierRow {
  level: number;
  multiplier: number;
}

interface PerTokenForm {
  input: {
    perMToken: number;
    cachedRead: number | null;
    cachedWrite: number | null;
    audio: number | null;
  };
  output: {
    perMToken: number;
    reasoning: number | null;
    audio: number | null;
  };
}

interface PerCallForm {
  pricePerCall: number;
  cachedPricePerCall: number | null;
}

interface PerAudioMinuteForm {
  pricePerMinute: number;
}

interface PerCharacterForm {
  pricePerKChar: number;
}

interface FormState {
  modelId: string;
  billingType: BillingType;
  perToken: PerTokenForm;
  perCall: PerCallForm;
  perImageTiers: PerImageTier[];
  perVideoTiers: PerVideoTier[];
  perVideoMinSeconds: number | null;
  perVideoMaxSeconds: number | null;
  perAudio: PerAudioMinuteForm;
  perCharacter: PerCharacterForm;
  currency: string;
  multiplierRows: MultiplierRow[];
  effectiveFromUtc: number;
}

const emptyPerToken = (): PerTokenForm => ({
  input: {
    perMToken: 0,
    cachedRead: null,
    cachedWrite: null,
    audio: null,
  },
  output: {
    perMToken: 0,
    reasoning: null,
    audio: null,
  },
});

const emptyForm = (modelId: string): FormState => ({
  modelId,
  billingType: 'per_token',
  perToken: emptyPerToken(),
  perCall: { pricePerCall: 0, cachedPricePerCall: null },
  perImageTiers: [{ size: '1024x1024', quality: 'standard', pricePerImage: 0 }],
  perVideoTiers: [{ resolution: '1080p', pricePerSecond: 0 }],
  perVideoMinSeconds: null,
  perVideoMaxSeconds: null,
  perAudio: { pricePerMinute: 0 },
  perCharacter: { pricePerKChar: 0 },
  currency: 'CNY',
  multiplierRows: [],
  effectiveFromUtc: Date.now(),
});

const form = ref<FormState>(emptyForm(''));
const formRef = ref<FormInstance | null>(null);

const rules: FormRules<FormState> = {
  effectiveFromUtc: [{ required: true, message: '请选择生效时间', trigger: 'change' }],
};

function loadRateIntoForm(p: Rate): FormState {
  const base = emptyForm(p.modelId);
  base.billingType = p.billingType;
  base.currency = p.currency;
  base.effectiveFromUtc = p.effectiveFromUtc;
  base.multiplierRows = Object.entries(p.tierMultipliers).map(([k, v]) => ({
    level: Number(k),
    multiplier: v,
  }));

  switch (p.billingType) {
    case 'per_token':
      base.perToken = {
        input: {
          perMToken: p.rate.input.perMToken,
          cachedRead: p.rate.input.cachedRead ?? null,
          cachedWrite: p.rate.input.cachedWrite ?? null,
          audio: p.rate.input.audio ?? null,
        },
        output: {
          perMToken: p.rate.output.perMToken,
          reasoning: p.rate.output.reasoning ?? null,
          audio: p.rate.output.audio ?? null,
        },
      };
      break;
    case 'per_call':
      base.perCall = {
        pricePerCall: p.rate.pricePerCall,
        cachedPricePerCall: p.rate.cachedPricePerCall ?? null,
      };
      break;
    case 'per_image':
      base.perImageTiers = p.rate.tiers.map((t) => ({ ...t }));
      break;
    case 'per_video':
      base.perVideoTiers = p.rate.tiers.map((t) => ({ ...t }));
      base.perVideoMinSeconds = p.rate.minSeconds ?? null;
      base.perVideoMaxSeconds = p.rate.maxSeconds ?? null;
      break;
    case 'per_audio_minute':
      base.perAudio = { pricePerMinute: p.rate.pricePerMinute };
      break;
    case 'per_character':
      base.perCharacter = { pricePerKChar: p.rate.pricePerKChar };
      break;
  }
  return base;
}

watch(
  () => [props.modelValue, props.rate, props.model] as const,
  ([open, p, m]) => {
    if (!open) return;
    if (p) {
      form.value = loadRateIntoForm(p);
    } else if (m) {
      form.value = emptyForm(m.modelId);
    }
  },
  { immediate: true },
);

// ---------- tierMultipliers (用户 LV 折扣) ----------
function addMultiplierRow(): void {
  const used = new Set(form.value.multiplierRows.map((r) => r.level));
  const next = TIER_THRESHOLDS.find((t) => !used.has(t.level));
  if (!next) return;
  form.value.multiplierRows.push({ level: next.level, multiplier: 0.9 });
}

function removeMultiplierRow(idx: number): void {
  form.value.multiplierRows.splice(idx, 1);
}

// ---------- per_image tiers ----------
function addImageTier(): void {
  form.value.perImageTiers.push({ size: '1024x1024', quality: 'standard', pricePerImage: 0 });
}

function removeImageTier(idx: number): void {
  if (form.value.perImageTiers.length <= 1) return;
  form.value.perImageTiers.splice(idx, 1);
}

// ---------- per_video tiers ----------
function addVideoTier(): void {
  form.value.perVideoTiers.push({ resolution: '1080p', pricePerSecond: 0 });
}

function removeVideoTier(idx: number): void {
  if (form.value.perVideoTiers.length <= 1) return;
  form.value.perVideoTiers.splice(idx, 1);
}

function buildRatePayload(f: FormState): UpsertRateInput['rate'] {
  switch (f.billingType) {
    case 'per_token': {
      const pt: PerTokenForm = f.perToken;
      return {
        input: {
          perMToken: pt.input.perMToken ?? 0,
          ...(pt.input.cachedRead != null ? { cachedRead: pt.input.cachedRead } : {}),
          ...(pt.input.cachedWrite != null ? { cachedWrite: pt.input.cachedWrite } : {}),
          ...(pt.input.audio != null ? { audio: pt.input.audio } : {}),
        },
        output: {
          perMToken: pt.output.perMToken ?? 0,
          ...(pt.output.reasoning != null ? { reasoning: pt.output.reasoning } : {}),
          ...(pt.output.audio != null ? { audio: pt.output.audio } : {}),
        },
      };
    }
    case 'per_call': {
      const pc: PerCallForm = f.perCall;
      return {
        pricePerCall: pc.pricePerCall ?? 0,
        ...(pc.cachedPricePerCall != null ? { cachedPricePerCall: pc.cachedPricePerCall } : {}),
      };
    }
    case 'per_image':
      return { tiers: f.perImageTiers.map((t) => ({ ...t })) };
    case 'per_video':
      return {
        tiers: f.perVideoTiers.map((t) => ({ ...t })),
        ...(f.perVideoMinSeconds != null ? { minSeconds: f.perVideoMinSeconds } : {}),
        ...(f.perVideoMaxSeconds != null ? { maxSeconds: f.perVideoMaxSeconds } : {}),
      };
    case 'per_audio_minute':
      return { pricePerMinute: f.perAudio.pricePerMinute ?? 0 };
    case 'per_character':
      return { pricePerKChar: f.perCharacter.pricePerKChar ?? 0 };
  }
}

async function onSubmit(): Promise<void> {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  const f = form.value;
  const tierMultipliers: Record<string, number> = {};
  for (const row of f.multiplierRows) {
    if (row.multiplier > 0 && row.multiplier !== 1) {
      tierMultipliers[String(row.level)] = row.multiplier;
    }
  }
  const payload = {
    modelId: f.modelId,
    billingType: f.billingType,
    rate: buildRatePayload(f),
    currency: f.currency,
    tierMultipliers,
    effectiveFromUtc: f.effectiveFromUtc,
  } as UpsertRateInput;
  emit('submit', payload);
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="rate ? `编辑定价 · ${rate.modelId}` : `新建定价 · ${model?.modelId ?? ''}`"
    width="720px"
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

      <el-form-item label="计费类型">
        <el-radio-group v-model="form.billingType">
          <el-radio v-for="m in billingTypeValues" :key="m" :value="m">
            {{ BillingTypeLabel[m] }}
          </el-radio>
        </el-radio-group>
      </el-form-item>

      <!-- ============ per_token ============ -->
      <template v-if="form.billingType === 'per_token'">
        <el-divider content-position="left">Input（输入 token）</el-divider>
        <el-form-item label="主输入单价">
          <el-input-number
            v-model="form.perToken.input.perMToken"
            :min="0"
            :precision="4"
            :step="0.5"
            style="width: 200px"
          />
          <span class="suffix">{{ form.currency }} / 1M input tokens</span>
        </el-form-item>
        <el-form-item label="cached 读">
          <el-input-number
            v-model="form.perToken.input.cachedRead"
            :min="0"
            :precision="4"
            :step="0.5"
            placeholder="可空"
            style="width: 200px"
          />
          <span class="suffix">命中 cache 的输入折扣价（{{ form.currency }} / 1M，可空）</span>
        </el-form-item>
        <el-form-item label="cache 写">
          <el-input-number
            v-model="form.perToken.input.cachedWrite"
            :min="0"
            :precision="4"
            :step="0.5"
            placeholder="可空"
            style="width: 200px"
          />
          <span class="suffix">cache 写入单价（{{ form.currency }} / 1M，可空）</span>
        </el-form-item>
        <el-form-item label="输入音频">
          <el-input-number
            v-model="form.perToken.input.audio"
            :min="0"
            :precision="4"
            :step="5"
            placeholder="可空"
            style="width: 200px"
          />
          <span class="suffix">GPT-4o-audio 输入音频 token（约 base × 16，可空）</span>
        </el-form-item>

        <el-divider content-position="left">Output（输出 token）</el-divider>
        <el-form-item label="主输出单价">
          <el-input-number
            v-model="form.perToken.output.perMToken"
            :min="0"
            :precision="4"
            :step="0.5"
            style="width: 200px"
          />
          <span class="suffix">{{ form.currency }} / 1M output tokens</span>
        </el-form-item>
        <el-form-item label="reasoning">
          <el-input-number
            v-model="form.perToken.output.reasoning"
            :min="0"
            :precision="4"
            :step="0.5"
            placeholder="可空"
            style="width: 200px"
          />
          <span class="suffix">o1 / extended thinking / Gemini thoughts 单价（可空）</span>
        </el-form-item>
        <el-form-item label="输出音频">
          <el-input-number
            v-model="form.perToken.output.audio"
            :min="0"
            :precision="4"
            :step="5"
            placeholder="可空"
            style="width: 200px"
          />
          <span class="suffix">GPT-4o-audio 输出音频 token（约 base × 8，可空）</span>
        </el-form-item>
      </template>

      <!-- ============ per_call ============ -->
      <template v-if="form.billingType === 'per_call'">
        <el-form-item label="单次价">
          <el-input-number
            v-model="form.perCall.pricePerCall"
            :min="0"
            :precision="4"
            :step="0.001"
            style="width: 200px"
          />
          <span class="suffix">{{ form.currency }} / 次</span>
        </el-form-item>
        <el-form-item label="命中缓存单次价">
          <el-input-number
            v-model="form.perCall.cachedPricePerCall"
            :min="0"
            :precision="4"
            :step="0.001"
            placeholder="可空"
            style="width: 200px"
          />
          <span class="suffix">如 moderation 命中缓存的折扣价（可空）</span>
        </el-form-item>
      </template>

      <!-- ============ per_image ============ -->
      <template v-if="form.billingType === 'per_image'">
        <el-form-item label="档位 (size × quality)">
          <div class="tier-table">
            <div class="tier-row tier-row--head">
              <span class="col-size">size</span>
              <span class="col-quality">quality</span>
              <span class="col-price">{{ form.currency }} / 张</span>
              <span class="col-op"></span>
            </div>
            <div
              v-for="(row, idx) in form.perImageTiers"
              :key="idx"
              class="tier-row"
            >
              <el-input
                v-model="row.size"
                class="col-size"
                placeholder="1024x1024"
                size="small"
              />
              <el-input
                v-model="row.quality"
                class="col-quality"
                placeholder="standard / hd / draft"
                size="small"
              />
              <el-input-number
                v-model="row.pricePerImage"
                :min="0"
                :precision="4"
                :step="0.01"
                class="col-price"
                size="small"
              />
              <el-button
                :icon="Delete"
                link
                type="danger"
                class="col-op"
                :disabled="form.perImageTiers.length <= 1"
                @click="removeImageTier(idx)"
              />
            </div>
            <el-button
              :icon="Plus"
              link
              type="primary"
              class="tier-table__add"
              @click="addImageTier"
            >
              新增档位
            </el-button>
          </div>
          <div class="form-hint">
            档位主键是 (size, quality)；不允许重复。请求带的 size / quality 必须命中。
          </div>
        </el-form-item>
      </template>

      <!-- ============ per_video ============ -->
      <template v-if="form.billingType === 'per_video'">
        <el-form-item label="档位 (resolution)">
          <div class="tier-table">
            <div class="tier-row tier-row--head">
              <span class="col-resolution">resolution</span>
              <span class="col-price">{{ form.currency }} / 秒</span>
              <span class="col-op"></span>
            </div>
            <div
              v-for="(row, idx) in form.perVideoTiers"
              :key="idx"
              class="tier-row"
            >
              <el-input
                v-model="row.resolution"
                class="col-resolution"
                placeholder="720p / 1080p / 4k"
                size="small"
              />
              <el-input-number
                v-model="row.pricePerSecond"
                :min="0"
                :precision="4"
                :step="0.01"
                class="col-price"
                size="small"
              />
              <el-button
                :icon="Delete"
                link
                type="danger"
                class="col-op"
                :disabled="form.perVideoTiers.length <= 1"
                @click="removeVideoTier(idx)"
              />
            </div>
            <el-button
              :icon="Plus"
              link
              type="primary"
              class="tier-table__add"
              @click="addVideoTier"
            >
              新增档位
            </el-button>
          </div>
        </el-form-item>
        <el-form-item label="时长限制">
          <el-input-number
            v-model="form.perVideoMinSeconds"
            :min="0"
            :precision="0"
            :step="1"
            placeholder="最小秒"
            style="width: 140px"
          />
          <span class="range-sep">–</span>
          <el-input-number
            v-model="form.perVideoMaxSeconds"
            :min="0"
            :precision="0"
            :step="1"
            placeholder="最大秒"
            style="width: 140px"
          />
          <span class="suffix">可空。BFF 用于按秒计费的入参合法性校验。</span>
        </el-form-item>
      </template>

      <!-- ============ per_audio_minute ============ -->
      <el-form-item v-if="form.billingType === 'per_audio_minute'" label="分钟价">
        <el-input-number
          v-model="form.perAudio.pricePerMinute"
          :min="0"
          :precision="4"
          :step="0.01"
          style="width: 200px"
        />
        <span class="suffix">{{ form.currency }} / 分钟（音频时长）</span>
      </el-form-item>

      <!-- ============ per_character ============ -->
      <el-form-item v-if="form.billingType === 'per_character'" label="千字符价">
        <el-input-number
          v-model="form.perCharacter.pricePerKChar"
          :min="0"
          :precision="4"
          :step="0.001"
          style="width: 200px"
        />
        <span class="suffix">{{ form.currency }} / 1K 字符（TTS 文本长度）</span>
      </el-form-item>

      <el-form-item label="LV 倍率">
        <div class="tier-rows">
          <div v-for="(row, idx) in form.multiplierRows" :key="idx" class="tier-row tier-row--lv">
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
            <el-button :icon="Delete" link type="danger" @click="removeMultiplierRow(idx)" />
          </div>
          <el-button
            :icon="Plus"
            link
            type="primary"
            class="tier-rows__add"
            :disabled="form.multiplierRows.length >= TIER_THRESHOLDS.length"
            @click="addMultiplierRow"
          >
            新增 LV 倍率
          </el-button>
        </div>
        <div class="form-hint">
          未列出的 LV 走 1.0；最终扣费 = 基价 × LV 倍率。
        </div>
      </el-form-item>

      <el-form-item label="生效时间">
        <el-date-picker
          :model-value="form.effectiveFromUtc ? new Date(form.effectiveFromUtc) : null"
          type="datetime"
          placeholder="选择生效时间"
          @update:model-value="(d: Date | null) => { form.effectiveFromUtc = d ? d.getTime() : Date.now(); }"
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
.range-sep {
  margin: 0 8px;
  color: var(--el-text-color-secondary);
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
.tier-row--lv {
  display: flex;
  align-items: center;
  gap: 10px;
}
.tier-rows__add {
  align-self: flex-start;
}

/* per_image / per_video 档位表 */
.tier-table {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  max-width: 560px;
}
.tier-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 32px;
  gap: 8px;
  align-items: center;
}
.tier-row--head {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  padding: 0 2px;
}
.col-resolution {
  grid-column: span 2;
}
.tier-row .col-price :deep(.el-input-number) {
  width: 100%;
}
.tier-table__add {
  align-self: flex-start;
  margin-top: 2px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
