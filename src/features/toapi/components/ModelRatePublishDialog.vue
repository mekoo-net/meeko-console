<script setup lang="ts">
/**
 * 发布定价行（同组同模型的旧 active 行自动 superseded）。
 * 表单随 billingType 切换：per_token（入/出 ¥/MTok + 可选缓存/思考）、per_image（¥/张 + size/quality 档位）、
 * per_video（¥/秒 + resolution 档位）。ToApi 没有按次。
 */
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Delete, Plus } from '@element-plus/icons-vue';

import {
  emptyRateDocument,
  ToApiBillingTypeLabel,
  toapiBillingTypeValues,
  type ModelRate,
  type PublishModelRateInput,
  type SupplyGroup,
  type ToApiBillingType,
} from '../model/pricing.types';
import { getToApiPricingPort } from '../services';

const visible = defineModel<boolean>('visible', { required: true });

const props = defineProps<{
  groups: SupplyGroup[];
  /** 编辑（改价）时传入当前 active 行；新建传 null。 */
  source: ModelRate | null;
  /** 新建时预选的分组。 */
  defaultGroupKey?: string;
}>();
const emit = defineEmits<{ (e: 'published', rate: ModelRate): void }>();

const port = getToApiPricingPort();
const submitting = ref(false);

interface TierRow {
  key: string;
  price: number;
}

interface FormState {
  groupKey: string;
  modelId: string;
  billingType: ToApiBillingType;
  displayName: string;
  family: string;
  tags: string;
  input: { perMToken: number; cachedRead: number | null; cachedWrite: number | null };
  output: { perMToken: number; reasoning: number | null };
  image: { pricePerImage: number; tiers: TierRow[] };
  video: { pricePerSecond: number; tiers: TierRow[] };
  effectiveFrom: Date | null;
}

const emptyForm = (): FormState => ({
  groupKey: props.defaultGroupKey ?? props.groups[0]?.key ?? '',
  modelId: '',
  billingType: 'per_token',
  displayName: '',
  family: '',
  tags: '',
  input: { perMToken: 0, cachedRead: null, cachedWrite: null },
  output: { perMToken: 0, reasoning: null },
  image: { pricePerImage: 0, tiers: [] },
  video: { pricePerSecond: 0, tiers: [] },
  effectiveFrom: null,
});

const form = ref<FormState>(emptyForm());
const isRepublish = computed(() => props.source !== null);

function loadFrom(r: ModelRate): FormState {
  return {
    groupKey: r.groupKey,
    modelId: r.modelId,
    billingType: r.billingType,
    displayName: r.meta.displayName,
    family: r.meta.family,
    tags: r.meta.tags.join(', '),
    input: {
      perMToken: r.rate.input.perMToken,
      cachedRead: r.rate.input.cachedRead ?? null,
      cachedWrite: r.rate.input.cachedWrite ?? null,
    },
    output: { perMToken: r.rate.output.perMToken, reasoning: r.rate.output.reasoning ?? null },
    image: { pricePerImage: r.rate.image.pricePerImage, tiers: r.rate.image.tiers.map((t) => ({ ...t })) },
    video: { pricePerSecond: r.rate.video.pricePerSecond, tiers: r.rate.video.tiers.map((t) => ({ ...t })) },
    effectiveFrom: null,
  };
}

watch(visible, (open) => {
  if (open) form.value = props.source ? loadFrom(props.source) : emptyForm();
});

const activeGroups = computed(() => props.groups.filter((g) => g.status !== 'disabled'));
const canSubmit = computed(() => form.value.groupKey && form.value.modelId.trim().length > 0);

function addTier(list: TierRow[], placeholder: string): void {
  list.push({ key: placeholder, price: 0 });
}
function removeTier(list: TierRow[], idx: number): void {
  list.splice(idx, 1);
}

function buildPayload(f: FormState): PublishModelRateInput {
  const rate = emptyRateDocument();
  switch (f.billingType) {
    case 'per_image':
      rate.image = { pricePerImage: f.image.pricePerImage, tiers: f.image.tiers.filter((t) => t.key.trim()).map((t) => ({ key: t.key.trim().toLowerCase(), price: t.price })) };
      break;
    case 'per_video':
      rate.video = { pricePerSecond: f.video.pricePerSecond, tiers: f.video.tiers.filter((t) => t.key.trim()).map((t) => ({ key: t.key.trim().toLowerCase(), price: t.price })) };
      break;
    default:
      rate.input = { perMToken: f.input.perMToken, cachedRead: f.input.cachedRead, cachedWrite: f.input.cachedWrite, reasoning: null };
      rate.output = { perMToken: f.output.perMToken, cachedRead: null, cachedWrite: null, reasoning: f.output.reasoning };
      break;
  }
  return {
    groupKey: f.groupKey,
    modelId: f.modelId.trim(),
    billingType: f.billingType,
    rate,
    meta: {
      displayName: f.displayName.trim() || f.modelId.trim(),
      family: f.family.trim().toLowerCase(),
      tags: f.tags.split(/[,，\s]+/).map((t) => t.trim()).filter(Boolean),
    },
    effectiveFromUtc: f.effectiveFrom ? f.effectiveFrom.getTime() : null,
  };
}

async function submit(): Promise<void> {
  if (!canSubmit.value) return;
  submitting.value = true;
  try {
    const r = await port.publishRate(buildPayload(form.value));
    if (r.success) {
      ElMessage.success(isRepublish.value ? '新价已生效，旧行已归档' : '定价已发布');
      visible.value = false;
      emit('published', r.data);
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="isRepublish ? `改价 · ${source?.groupKey} / ${source?.modelId}` : '发布定价'"
    width="720px"
    align-center
    append-to-body
    :close-on-click-modal="false"
  >
    <el-form
      label-width="120px"
      label-position="right"
      @submit.prevent="submit"
    >
      <el-form-item
        label="渠道分组"
        required
      >
        <el-select
          v-model="form.groupKey"
          :disabled="isRepublish"
          style="width: 280px"
        >
          <el-option
            v-for="g in activeGroups"
            :key="g.key"
            :label="`${g.name} (${g.key})`"
            :value="g.key"
          />
        </el-select>
      </el-form-item>

      <el-form-item
        label="模型 id"
        required
      >
        <el-input
          v-model="form.modelId"
          :disabled="isRepublish"
          placeholder="网关请求里的 model，如 claude-sonnet-4"
          style="width: 280px"
        />
      </el-form-item>

      <el-form-item label="计量口径">
        <el-radio-group
          v-model="form.billingType"
          :disabled="isRepublish"
        >
          <el-radio
            v-for="b in toapiBillingTypeValues"
            :key="b"
            :value="b"
          >
            {{ ToApiBillingTypeLabel[b] }}
          </el-radio>
        </el-radio-group>
      </el-form-item>

      <template v-if="form.billingType === 'per_token'">
        <el-divider content-position="left">
          输入
        </el-divider>
        <el-form-item label="输入单价">
          <el-input-number
            v-model="form.input.perMToken"
            :min="0"
            :precision="4"
            :step="0.5"
            style="width: 200px"
          />
          <span class="suffix">¥ / MTok</span>
        </el-form-item>
        <el-form-item label="缓存读">
          <el-input-number
            v-model="form.input.cachedRead"
            :min="0"
            :precision="4"
            :step="0.5"
            placeholder="缺省按输入价"
            style="width: 200px"
          />
          <span class="suffix">¥ / MTok，可空</span>
        </el-form-item>
        <el-form-item label="缓存写">
          <el-input-number
            v-model="form.input.cachedWrite"
            :min="0"
            :precision="4"
            :step="0.5"
            placeholder="缺省按输入价"
            style="width: 200px"
          />
          <span class="suffix">¥ / MTok，可空</span>
        </el-form-item>

        <el-divider content-position="left">
          输出
        </el-divider>
        <el-form-item label="输出单价">
          <el-input-number
            v-model="form.output.perMToken"
            :min="0"
            :precision="4"
            :step="0.5"
            style="width: 200px"
          />
          <span class="suffix">¥ / MTok</span>
        </el-form-item>
        <el-form-item label="思考 token">
          <el-input-number
            v-model="form.output.reasoning"
            :min="0"
            :precision="4"
            :step="0.5"
            placeholder="缺省按输出价"
            style="width: 200px"
          />
          <span class="suffix">¥ / MTok，可空</span>
        </el-form-item>
      </template>

      <template v-else-if="form.billingType === 'per_image'">
        <el-form-item label="基础单价">
          <el-input-number
            v-model="form.image.pricePerImage"
            :min="0"
            :precision="4"
            :step="0.1"
            style="width: 200px"
          />
          <span class="suffix">¥ / 张；没命中档位时用</span>
        </el-form-item>
        <el-form-item label="档位价">
          <div class="tier-table">
            <div class="tier-row tier-row--head">
              <span>size/quality</span><span>¥ / 张</span><span />
            </div>
            <div
              v-for="(row, idx) in form.image.tiers"
              :key="idx"
              class="tier-row"
            >
              <el-input
                v-model="row.key"
                size="small"
                placeholder="1024x1024/hd"
              />
              <el-input-number
                v-model="row.price"
                :min="0"
                :precision="4"
                :step="0.1"
                size="small"
              />
              <el-button
                :icon="Delete"
                link
                type="danger"
                @click="removeTier(form.image.tiers, idx)"
              />
            </div>
            <el-button
              :icon="Plus"
              link
              type="primary"
              class="tier-table__add"
              @click="addTier(form.image.tiers, '1024x1024/standard')"
            >
              新增档位
            </el-button>
          </div>
          <div class="form-hint">
            键为 <code>{size}/{quality}</code>，与网关上报的 Image.Size / Quality 小写拼接后精确匹配。
          </div>
        </el-form-item>
      </template>

      <template v-else>
        <el-form-item label="基础单价">
          <el-input-number
            v-model="form.video.pricePerSecond"
            :min="0"
            :precision="4"
            :step="0.1"
            style="width: 200px"
          />
          <span class="suffix">¥ / 秒；没命中档位时用</span>
        </el-form-item>
        <el-form-item label="档位价">
          <div class="tier-table">
            <div class="tier-row tier-row--head">
              <span>resolution</span><span>¥ / 秒</span><span />
            </div>
            <div
              v-for="(row, idx) in form.video.tiers"
              :key="idx"
              class="tier-row"
            >
              <el-input
                v-model="row.key"
                size="small"
                placeholder="1080p"
              />
              <el-input-number
                v-model="row.price"
                :min="0"
                :precision="4"
                :step="0.1"
                size="small"
              />
              <el-button
                :icon="Delete"
                link
                type="danger"
                @click="removeTier(form.video.tiers, idx)"
              />
            </div>
            <el-button
              :icon="Plus"
              link
              type="primary"
              class="tier-table__add"
              @click="addTier(form.video.tiers, '1080p')"
            >
              新增档位
            </el-button>
          </div>
        </el-form-item>
      </template>

      <el-divider content-position="left">
        展示
      </el-divider>
      <el-form-item label="显示名">
        <el-input
          v-model="form.displayName"
          placeholder="缺省用模型 id"
          style="width: 280px"
        />
      </el-form-item>
      <el-form-item label="系列">
        <el-input
          v-model="form.family"
          placeholder="claude / gpt / gemini …"
          style="width: 200px"
        />
      </el-form-item>
      <el-form-item label="标签">
        <el-input
          v-model="form.tags"
          placeholder="逗号分隔"
          style="width: 280px"
        />
      </el-form-item>

      <el-form-item label="生效时间">
        <el-date-picker
          v-model="form.effectiveFrom"
          type="datetime"
          placeholder="不填 = 立即生效"
          clearable
        />
        <div class="form-hint">
          进行中的请求按预扣时钉住的定价行结算，改价不影响它们。
        </div>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">
        取消
      </el-button>
      <el-button
        type="primary"
        :loading="submitting"
        :disabled="!canSubmit"
        @click="submit"
      >
        {{ isRepublish ? '发布新价' : '发布' }}
      </el-button>
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
.form-hint code {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}
.tier-table {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  width: 100%;
  max-width: 520px;
}
.tier-row {
  display: grid;
  grid-template-columns: 1fr 160px 32px;
  gap: 8px;
  align-items: center;
}
.tier-row--head {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  padding: 0 2px;
}
.tier-row :deep(.el-input-number) {
  width: 100%;
}
.tier-table__add {
  align-self: flex-start;
  margin-top: 2px;
}
</style>
