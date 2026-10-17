<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Refresh } from '@element-plus/icons-vue';

import { formatMoney } from '@/shared/lib/money';

import {
  codePrefixOf,
  formatCode,
  randomCodeBody,
  isBatchActive,
  RedemptionPurposeLabel,
  redemptionPurposeValues,
  type PlainCodes,
  type RedemptionBatch,
  type RedemptionPurpose,
} from '../model/redemption.types';
import { getRedemptionPort } from '../services';

const visible = defineModel<boolean>('visible', { required: true });
/** 传入批次即为编辑：面值、卡密格式锁定，数量只增不减，多出的部分保存时自动生成。 */
const props = defineProps<{ batch?: RedemptionBatch | null }>();
const emit = defineEmits<{
  (e: 'created', payload: PlainCodes): void;
  /** `codes` 为本次追加的明文，没有追加时为空数组。 */
  (e: 'updated', payload: PlainCodes): void;
}>();

const port = getRedemptionPort();
const submitting = ref(false);

/** 超过这个面值合计需要二次确认：一批卡就是一笔等额负债，手滑多打一个 0 代价很大。 */
const LARGE_TOTAL = 10_000;

const editing = computed(() => Boolean(props.batch));
/** 已作废 / 冻结的批次只能改资料，不能加卡。 */
const canGrow = computed(() => !props.batch || isBatchActive(props.batch));
const baseQuantity = computed(() => props.batch?.quantity ?? 0);

const emptyForm = () => ({
  name: '',
  salesChannel: '',
  purpose: 'recharge' as RedemptionPurpose,
  faceValue: undefined as number | undefined,
  quantity: 0,
  prefix: 'MK',
  limitMode: 'none' as 'none' | 'limited',
  perAccountLimit: 1,
});

function formOf(b: RedemptionBatch): ReturnType<typeof emptyForm> {
  return {
    name: b.name,
    salesChannel: b.salesChannel ?? '',
    purpose: b.purpose,
    faceValue: b.faceValue,
    quantity: b.quantity,
    prefix: codePrefixOf(b.codePattern),
    limitMode: b.perAccountLimit ? 'limited' : 'none',
    perAccountLimit: b.perAccountLimit ?? 1,
  };
}

const form = ref(emptyForm());

watch(visible, (open) => {
  if (!open) return;
  form.value = props.batch ? formOf(props.batch) : emptyForm();
  shuffleSample();
});

const faceValue = computed(() => form.value.faceValue ?? 0);
/** 新建时是全部张数；编辑时是本次追加的张数。 */
const addCount = computed(() => Math.max(0, form.value.quantity - baseQuantity.value));
const addValue = computed(() => faceValue.value * addCount.value);

const sampleBody = ref('');
function shuffleSample(): void {
  sampleBody.value = randomCodeBody();
}
shuffleSample();
const sample = computed(() => formatCode(form.value.prefix, sampleBody.value));

function onPrefixInput(v: string): void {
  form.value.prefix = v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

function validate(): string | null {
  const f = form.value;
  if (!f.name.trim()) return '请填写批次名称';
  if (!(faceValue.value > 0)) return '请填写面值';
  if (!editing.value && !(f.quantity >= 1)) return '请填写数量';
  if (f.quantity < baseQuantity.value) return `数量不能少于 ${baseQuantity.value}`;
  if (f.prefix && f.prefix.length < 2) return '前缀至少 2 位，或留空';
  return null;
}

async function confirmLarge(): Promise<boolean> {
  if (addValue.value < LARGE_TOTAL) return true;
  try {
    await ElMessageBox.confirm(
      `${addCount.value} 张 × ${formatMoney(faceValue.value, { currency: 'CNY' })} = ${formatMoney(addValue.value, { currency: 'CNY' })}`,
      editing.value ? '确认追加' : '确认创建',
      { type: 'warning', confirmButtonText: '确认', cancelButtonText: '取消' },
    );
    return true;
  } catch {
    return false;
  }
}

async function submit(): Promise<void> {
  const err = validate();
  if (err) {
    ElMessage.warning(err);
    return;
  }
  if (!(await confirmLarge())) return;

  submitting.value = true;
  try {
    const f = form.value;
    const common = {
      name: f.name.trim(),
      salesChannel: f.salesChannel.trim() || null,
      quantity: Math.floor(f.quantity),
      perAccountLimit: f.limitMode === 'limited' ? Math.floor(f.perAccountLimit) : null,
    };
    const r = props.batch
      ? await port.updateBatch(props.batch.id, common)
      : await port.createBatch({ ...common, purpose: f.purpose, faceValue: faceValue.value, prefix: f.prefix });
    if (!r.success) {
      ElMessage.error(r.error.message);
      return;
    }
    visible.value = false;
    if (props.batch) emit('updated', r.data);
    else emit('created', r.data);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <el-drawer
    v-model="visible"
    :title="editing ? '编辑批次' : '创建批次'"
    size="600px"
    append-to-body
    :close-on-click-modal="false"
  >
    <template
      v-if="batch"
      #header
    >
      <div class="head">
        <span class="head__title">编辑批次</span>
        <code class="head__id">{{ batch.id }}</code>
      </div>
    </template>

    <el-form
      label-position="top"
      class="form"
      @submit.prevent="submit"
    >
      <section class="group">
        <h4 class="group__title">
          基本信息
        </h4>
        <el-form-item
          label="批次名称"
          required
        >
          <el-input
            v-model="form.name"
            maxlength="64"
            show-word-limit
          />
        </el-form-item>
        <el-form-item label="渠道">
          <el-input
            v-model="form.salesChannel"
            maxlength="64"
          />
        </el-form-item>
        <el-form-item
          label="形式"
          required
        >
          <el-select
            v-model="form.purpose"
            :disabled="editing"
            style="width: 100%"
          >
            <el-option
              v-for="p in redemptionPurposeValues"
              :key="p"
              :label="RedemptionPurposeLabel[p]"
              :value="p"
            />
          </el-select>
        </el-form-item>
      </section>

      <section class="group">
        <h4 class="group__title">
          面值与数量
        </h4>
        <div class="row">
          <el-form-item
            label="面值（元）"
            required
          >
            <el-input-number
              v-model="form.faceValue"
              :min="0.01"
              :max="99999"
              :precision="2"
              :controls="false"
              :disabled="editing"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item
            label="数量（张）"
            required
          >
            <el-input-number
              v-model="form.quantity"
              :min="baseQuantity"
              :value-on-clear="baseQuantity"
              :max="baseQuantity + 10000"
              :step="1"
              step-strictly
              :disabled="!canGrow"
              controls-position="right"
              style="width: 100%"
            />
          </el-form-item>
        </div>
        <div
          v-if="editing && batch"
          class="tally"
        >
          <div class="tally__cell">
            <span class="tally__label">原数量</span>
            <span class="tally__value">{{ batch.quantity }}</span>
          </div>
          <div class="tally__cell">
            <span class="tally__label">已兑换</span>
            <span class="tally__value">{{ batch.redeemedCount }}</span>
          </div>
          <div class="tally__cell tally__cell--accent">
            <span class="tally__label">追加</span>
            <span class="tally__value">+{{ addCount }}</span>
          </div>
        </div>
      </section>

      <section class="group">
        <h4 class="group__title">
          卡密格式
        </h4>
        <div class="row row--code">
          <el-form-item label="前缀">
            <el-input
              :model-value="form.prefix"
              maxlength="6"
              :disabled="editing"
              @update:model-value="onPrefixInput"
            />
          </el-form-item>
          <el-form-item label="示例">
            <div class="sample">
              <code class="sample__code">{{ sample }}</code>
              <el-button
                link
                :icon="Refresh"
                @click="shuffleSample"
              />
            </div>
          </el-form-item>
        </div>
      </section>

      <section class="group">
        <h4 class="group__title">
          兑换限制
        </h4>
        <el-form-item label="限兑">
          <el-radio-group v-model="form.limitMode">
            <el-radio value="none">
              不限
            </el-radio>
            <el-radio value="limited">
              限制
            </el-radio>
          </el-radio-group>
          <el-input-number
            v-if="form.limitMode === 'limited'"
            v-model="form.perAccountLimit"
            :min="1"
            :max="1000"
            controls-position="right"
            style="width: 120px; margin-left: 12px"
          />
          <span
            v-if="form.limitMode === 'limited'"
            class="unit"
          >张</span>
        </el-form-item>
      </section>
    </el-form>

    <template #footer>
      <div
        v-if="!editing || addCount > 0"
        class="summary"
      >
        <span>{{ editing ? '+' : '' }}{{ addCount.toLocaleString() }} 张 × {{ formatMoney(faceValue, { currency: 'CNY' }) }}</span>
        <span class="summary__total">= {{ formatMoney(addValue, { currency: 'CNY' }) }}</span>
      </div>
      <div class="foot">
        <el-button @click="visible = false">
          取消
        </el-button>
        <el-button
          type="primary"
          :loading="submitting"
          @click="submit"
        >
          {{ editing ? '保存' : '创建' }}
        </el-button>
      </div>
    </template>
  </el-drawer>
</template>

<style scoped>
.head {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.head__title {
  font-size: 16px;
  color: var(--el-text-color-primary);
}
.head__id {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.form :deep(.el-form-item) {
  margin-bottom: 14px;
}
.group {
  padding-bottom: 6px;
  margin-bottom: 14px;
  border-bottom: 1px dashed var(--el-border-color-lighter);
}
.group:last-child {
  border-bottom: none;
  margin-bottom: 0;
}
.group__title {
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.row > .el-form-item {
  min-width: 0;
}
/* 前缀最多 6 位，示例是带前缀的整串卡密：示例那栏要宽。 */
.row--code {
  grid-template-columns: 120px 1fr;
}
.unit {
  margin-left: 8px;
  color: var(--el-text-color-regular);
}
.tally {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}
.tally__cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: var(--el-fill-color-lighter);
}
.tally__cell--accent {
  border-color: var(--el-color-primary-light-7);
  background: var(--el-color-primary-light-9);
}
.tally__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.tally__value {
  font-size: 18px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-primary);
}
.tally__cell--accent .tally__value {
  color: var(--el-color-primary);
}
.sample {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  height: 32px;
  padding: 0 8px 0 12px;
  box-sizing: border-box;
  border-radius: 4px;
  background: var(--el-fill-color-light);
}
.sample__code {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: var(--el-text-color-primary);
}
.summary {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 10px 14px;
  margin-bottom: 12px;
  border-radius: 8px;
  background: linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%);
  border: 1px solid var(--el-color-primary-light-8);
  font-size: 14px;
  color: var(--el-text-color-regular);
  font-variant-numeric: tabular-nums;
}
.summary__total {
  font-size: 18px;
  font-weight: 700;
  color: var(--el-color-primary);
}
.foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
</style>
