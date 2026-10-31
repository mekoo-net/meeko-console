<script setup lang="ts">
/**
 * Tavern 计费配置：单位基线、输出权重、模型倍率与自主倍率，整行原子保存。
 *
 *  - 保存带读到的 version，别人先改过就会被拒；此时只给「重新加载」，不提供覆盖
 *  - 倍率表按裸模型名匹配（不带渠道前缀、大小写不敏感），同一模型走不同渠道共用一个倍率
 *  - 「在用，按默认倍率」列出近 30 天有调用却没单独定价的模型：它们最容易被忽略
 *  - 页面上的价格预览只针对还没保存的改动；已保存价目下的金额都以服务端为准
 */
import { computed, h, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Delete, Plus, Refresh } from '@element-plus/icons-vue';

import PageHeader from '@/shared/ui/PageHeader.vue';
import { formatDateTime } from '@/shared/lib/date';
import type { AppError } from '@/shared/api/httpTypes';

import {
  MeteringUnitLabel,
  MeteringUnitSuffix,
  PRICING_MAX,
  type MeteringPricing,
  type MeteringUnit,
  type PricingModel,
  type PricingRules,
} from '../model/meteringPricing.types';
import { formatCny } from '../model/meteringFormat';
import {
  describePricingChanges,
  duplicateModelNames,
  inUseWithoutMultiplier,
  perMillionFromPerToken,
  perTokenFromPerMillion,
  previewModelPrice,
  quoteUsage,
} from '../model/pricingPreview';
import { getTavernPricingPort } from '../services';

const port = getTavernPricingPort();
const loading = ref(false);
const saving = ref(false);
const saved = ref<MeteringPricing | null>(null);

// 输入框清空时 el-input-number 给 null；草稿如实保留，保存前拦下，不悄悄当成 0。
interface BaselineDraft {
  unit: MeteringUnit;
  price: number | null;
}

interface MultiplierDraft {
  key: number;
  modelName: string;
  multiplier: number | null;
}

interface Draft {
  baselines: BaselineDraft[];
  multipliers: MultiplierDraft[];
  defaultModelMultiplier: number | null;
  completionWeight: number | null;
  proactiveRateMultiplier: number | null;
}

const draft = reactive<Draft>({
  baselines: [],
  multipliers: [],
  defaultModelMultiplier: null,
  completionWeight: null,
  proactiveRateMultiplier: null,
});

let rowKey = 0;

function applySaved(next: MeteringPricing): void {
  const { rules } = next;
  saved.value = next;
  draft.baselines = rules.baselines.map((b) => ({ ...b }));
  draft.multipliers = rules.modelMultipliers.map((m) => ({ key: ++rowKey, ...m }));
  draft.defaultModelMultiplier = rules.defaultModelMultiplier;
  draft.completionWeight = rules.completionWeight;
  draft.proactiveRateMultiplier = rules.proactiveRateMultiplier;
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    const r = await port.get();
    if (r.success) applySaved(r.data);
    else ElMessage.error(r.error.message);
  } finally {
    loading.value = false;
  }
}

function reset(): void {
  if (saved.value) applySaved(saved.value);
}

// ─── 草稿 → 规则 ─────────────────────────────────────────

/** 预览用：空着的数按 0 算，空模型行不参与。 */
const draftRules = computed<PricingRules>(() => ({
  baselines: draft.baselines.map((b) => ({ unit: b.unit, price: b.price ?? 0 })),
  modelMultipliers: draft.multipliers
    .filter((m) => m.modelName.trim())
    .map((m) => ({ modelName: m.modelName.trim(), multiplier: m.multiplier ?? 0 })),
  defaultModelMultiplier: draft.defaultModelMultiplier ?? 0,
  completionWeight: draft.completionWeight ?? 0,
  proactiveRateMultiplier: draft.proactiveRateMultiplier ?? 0,
}));

const changes = computed(() => (saved.value ? describePricingChanges(saved.value.rules, draftRules.value) : []));

const hasBlankRow = computed(() => draft.multipliers.some((m) => !m.modelName.trim()));

const isDirty = computed(() => changes.value.length > 0 || hasBlankRow.value);

/** 倍率与权重要大于 0：为 0 就是那部分白送，服务端同样会拒。 */
function isFactor(value: number | null): boolean {
  return value != null && value > 0 && value <= PRICING_MAX;
}

const problems = computed<string[]>(() => {
  const list: string[] = [];
  for (const b of draft.baselines) {
    if (b.price == null || b.price > PRICING_MAX) list.push(`请填写有效的${MeteringUnitLabel[b.unit]}基线`);
  }
  if (!isFactor(draft.completionWeight)) list.push('输出权重必须大于 0');
  if (!isFactor(draft.defaultModelMultiplier)) list.push('默认模型倍率必须大于 0');
  if (!isFactor(draft.proactiveRateMultiplier)) list.push('自主倍率必须大于 0');
  if (hasBlankRow.value) list.push('模型倍率表里有没选模型的行');
  for (const m of draft.multipliers) {
    if (m.modelName.trim() && !isFactor(m.multiplier)) list.push(`${m.modelName.trim()} 的倍率必须大于 0`);
  }
  const dupes = duplicateModelNames(draftRules.value.modelMultipliers);
  if (dupes.length) list.push(`模型倍率重复（不分大小写）：${dupes.join('、')}`);
  return list;
});

// ─── Token 基线（两种单位同一个值） ──────────────────────

const tokenRow = computed(() => draft.baselines.find((b) => b.unit === 'token') ?? null);

const tokenPerToken = computed<number | null>({
  get: () => tokenRow.value?.price ?? null,
  set: (value) => {
    if (tokenRow.value) tokenRow.value.price = value;
  },
});

const tokenPerMillion = computed<number | null>({
  get: () => {
    const price = tokenRow.value?.price;
    return price == null ? null : perMillionFromPerToken(price);
  },
  set: (value) => {
    if (tokenRow.value) tokenRow.value.price = value == null ? null : perTokenFromPerMillion(value);
  },
});

const otherBaselines = computed(() => draft.baselines.filter((b) => b.unit !== 'token'));

// ─── 模型 ────────────────────────────────────────────────

const models = computed<PricingModel[]>(() => saved.value?.models ?? []);

const modelInfo = computed(() => new Map(models.value.map((m) => [m.modelName.toLowerCase(), m])));

function infoOf(name: string): PricingModel | undefined {
  return modelInfo.value.get(name.trim().toLowerCase());
}

function isTaken(name: string, row: MultiplierDraft): boolean {
  const key = name.trim().toLowerCase();
  return draft.multipliers.some((m) => m !== row && m.modelName.trim().toLowerCase() === key);
}

function addRow(modelName = ''): void {
  draft.multipliers.push({ key: ++rowKey, modelName, multiplier: draft.defaultModelMultiplier ?? 1 });
}

function removeRow(row: MultiplierDraft): void {
  draft.multipliers = draft.multipliers.filter((m) => m !== row);
}

const unpriced = computed(() => inUseWithoutMultiplier(models.value, draftRules.value.modelMultipliers));

const defaultPreview = computed(() => previewModelPrice(draftRules.value, draftRules.value.defaultModelMultiplier));

function rowPreview(row: MultiplierDraft) {
  return previewModelPrice(draftRules.value, row.multiplier ?? 0);
}

/** 拿用得最多的模型举一次调用的例子，公式里的每个数都是页面上正在编辑的值。 */
const example = computed(() => {
  const modelName = models.value.find((m) => m.calls30d > 0)?.modelName ?? 'claude-opus-5.5';
  const promptTokens = 12_000;
  const completionTokens = 800;
  const quote = quoteUsage(draftRules.value, {
    unit: 'token',
    modelName,
    vendorKey: null,
    kind: 'chat',
    promptTokens,
    completionTokens,
  });
  return { modelName, promptTokens, completionTokens, ...quote };
});

// ─── 保存 ────────────────────────────────────────────────

/** 服务端把版本冲突放在信封失败消息里（「定价已被修改，请刷新后再保存。」）。 */
function isVersionConflict(error: AppError): boolean {
  return error.code === 'conflict' || error.message.includes('已被修改');
}

async function offerReload(message: string): Promise<void> {
  try {
    await ElMessageBox.confirm(`${message}重新加载会丢掉这里还没保存的修改。`, '定价已被修改', {
      confirmButtonText: '重新加载',
      cancelButtonText: '先不加载',
      type: 'warning',
    });
  } catch {
    return;
  }
  await load();
}

async function save(): Promise<void> {
  const current = saved.value;
  if (!current || !isDirty.value || saving.value) return;
  if (problems.value.length > 0) {
    ElMessage.warning(problems.value[0]!);
    return;
  }

  try {
    await ElMessageBox.confirm(
      h('div', [
        h('p', { style: 'margin: 0 0 8px' }, '保存后 30 秒内对新回合生效，已扣的不追溯：'),
        h(
          'ul',
          { style: 'margin: 0; padding-left: 18px; line-height: 1.8' },
          changes.value.map((line) => h('li', line)),
        ),
      ]),
      '确认保存计费配置',
      { confirmButtonText: '保存', cancelButtonText: '再看看', type: 'warning' },
    );
  } catch {
    return;
  }

  saving.value = true;
  try {
    const r = await port.update({ rules: draftRules.value, version: current.version });
    if (r.success) {
      applySaved(r.data);
      ElMessage.success('已保存');
    } else if (isVersionConflict(r.error)) {
      void offerReload(r.error.message);
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div
    v-loading="loading"
    class="pricing"
    :class="{ 'pricing--dirty': isDirty }"
  >
    <PageHeader
      title="计费配置"
      description="向用户扣费的价目：保存后 30 秒内对新回合生效，无需重启；已扣费的回合不追溯。"
    >
      <template #actions>
        <el-button
          :icon="Refresh"
          :disabled="loading || saving"
          @click="load"
        >
          刷新
        </el-button>
      </template>
    </PageHeader>

    <section class="formula">
      <p class="formula__main">
        金额 = (输入 + 输出 × 输出权重) × 模型倍率 × token 基线；自主唤醒回合再 × 自主倍率
      </p>
      <p class="formula__sub">
        图片 / 语音 / 视频按张数、秒数 × 模型倍率 × 对应基线。一个回合含多次调用时逐条累加。
      </p>
      <p
        v-if="saved"
        class="formula__example"
      >
        例：{{ example.modelName }} 一次调用输入 {{ example.promptTokens.toLocaleString() }}、输出
        {{ example.completionTokens.toLocaleString() }} →
        ({{ example.promptTokens.toLocaleString() }} + {{ example.completionTokens.toLocaleString() }} ×
        {{ draftRules.completionWeight }}) × {{ example.multiplier }} × ¥{{ example.baseline }} =
        <strong>{{ formatCny(example.amount) }}</strong>
      </p>
    </section>

    <section
      v-if="saved"
      class="card"
    >
      <header class="card__head">
        <h2 class="card__title">
          基线单价
        </h2>
        <p class="card__sub">
          模型倍率为 1 时每个计量单位的价格（CNY）
        </p>
      </header>

      <div class="baselines">
        <div
          v-if="tokenRow"
          class="baseline baseline--token"
        >
          <span class="baseline__label">Token</span>
          <div class="baseline__inputs">
            <el-input-number
              v-model="tokenPerMillion"
              :min="0"
              :step="0.1"
              :controls="false"
              class="baseline__input"
            />
            <span class="baseline__unit">¥ / 百万 token</span>
            <span class="baseline__eq">=</span>
            <el-input-number
              v-model="tokenPerToken"
              :min="0"
              :step="0.0000001"
              :controls="false"
              class="baseline__input baseline__input--wide"
            />
            <span class="baseline__unit">¥ / token</span>
          </div>
        </div>
        <div
          v-for="b in otherBaselines"
          :key="b.unit"
          class="baseline"
        >
          <span class="baseline__label">{{ MeteringUnitLabel[b.unit] }}</span>
          <div class="baseline__inputs">
            <el-input-number
              v-model="b.price"
              :min="0"
              :step="0.01"
              :controls="false"
              class="baseline__input"
            />
            <span class="baseline__unit">¥ {{ MeteringUnitSuffix[b.unit] }}</span>
          </div>
        </div>
      </div>
    </section>

    <section
      v-if="saved"
      class="card"
    >
      <header class="card__head">
        <h2 class="card__title">
          权重与倍率
        </h2>
      </header>
      <div class="knobs">
        <label class="knob">
          <span class="knob__label">输出权重</span>
          <el-input-number
            v-model="draft.completionWeight"
            :min="0"
            :step="0.5"
            controls-position="right"
          />
          <span class="knob__hint">1 个输出 token 折合几个输入 token</span>
        </label>
        <label class="knob">
          <span class="knob__label">默认模型倍率</span>
          <el-input-number
            v-model="draft.defaultModelMultiplier"
            :min="0"
            :step="0.1"
            controls-position="right"
          />
          <span class="knob__hint">
            倍率表里没有的模型都按它：{{ formatCny(defaultPreview.inputPerMillion) }} / 百万输入 ·
            {{ formatCny(defaultPreview.outputPerMillion) }} / 百万输出
          </span>
        </label>
        <label class="knob">
          <span class="knob__label">自主倍率</span>
          <el-input-number
            v-model="draft.proactiveRateMultiplier"
            :min="0"
            :step="0.1"
            controls-position="right"
          />
          <span class="knob__hint">自主唤醒回合在合计上再乘一次</span>
        </label>
      </div>
    </section>

    <section
      v-if="saved"
      class="card"
    >
      <header class="card__head card__head--row">
        <div>
          <h2 class="card__title">
            模型倍率
          </h2>
          <p class="card__sub">
            按裸模型名匹配（不带渠道前缀、不分大小写），同一模型走不同渠道共用一个倍率
          </p>
        </div>
        <el-button
          :icon="Plus"
          @click="addRow()"
        >
          添加模型
        </el-button>
      </header>

      <el-table
        :data="draft.multipliers"
        row-key="key"
        size="small"
        :empty-text="'还没有单独定价的模型，全部按默认倍率'"
      >
        <el-table-column
          label="模型"
          min-width="240"
        >
          <template #default="{ row }: { row: MultiplierDraft }">
            <el-select
              v-model="row.modelName"
              filterable
              allow-create
              default-first-option
              placeholder="选择或输入模型名"
              class="model-select"
            >
              <el-option
                v-for="m in models"
                :key="m.modelName"
                :label="m.modelName"
                :value="m.modelName"
                :disabled="isTaken(m.modelName, row)"
              >
                <span class="model-option">
                  <span class="mono">{{ m.modelName }}</span>
                  <span class="model-option__meta">
                    {{ m.vendors.join(' · ') || '—' }}<template v-if="m.calls30d > 0">
                      · 30 天 {{ m.calls30d.toLocaleString() }} 次</template>
                  </span>
                </span>
              </el-option>
            </el-select>
          </template>
        </el-table-column>
        <el-table-column
          label="渠道"
          min-width="150"
        >
          <template #default="{ row }: { row: MultiplierDraft }">
            <span
              v-if="infoOf(row.modelName)"
              class="vendors"
            >
              <span
                v-for="v in infoOf(row.modelName)!.vendors"
                :key="v"
                class="vendor"
              >{{ v }}</span>
              <el-tag
                v-if="!infoOf(row.modelName)!.inCatalog"
                size="small"
                type="warning"
                effect="plain"
              >
                不在目录
              </el-tag>
            </span>
            <span
              v-else
              class="muted"
            >—</span>
          </template>
        </el-table-column>
        <el-table-column
          label="倍率"
          width="136"
        >
          <template #default="{ row }: { row: MultiplierDraft }">
            <el-input-number
              v-model="row.multiplier"
              :min="0"
              :step="0.1"
              size="small"
              controls-position="right"
              class="multiplier-input"
            />
          </template>
        </el-table-column>
        <el-table-column
          label="¥ / 百万输入"
          width="120"
          align="right"
        >
          <template #default="{ row }: { row: MultiplierDraft }">
            <span class="num">{{ formatCny(rowPreview(row).inputPerMillion) }}</span>
          </template>
        </el-table-column>
        <el-table-column
          label="¥ / 百万输出"
          width="120"
          align="right"
        >
          <template #default="{ row }: { row: MultiplierDraft }">
            <span class="num">{{ formatCny(rowPreview(row).outputPerMillion) }}</span>
          </template>
        </el-table-column>
        <el-table-column
          label="近 30 天调用"
          width="110"
          align="right"
        >
          <template #default="{ row }: { row: MultiplierDraft }">
            <span class="num">{{ infoOf(row.modelName)?.calls30d.toLocaleString() ?? '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column
          width="56"
          align="center"
        >
          <template #default="{ row }: { row: MultiplierDraft }">
            <el-button
              :icon="Delete"
              link
              type="danger"
              title="移除，改按默认倍率"
              @click="removeRow(row)"
            />
          </template>
        </el-table-column>
      </el-table>

      <div
        v-if="unpriced.length > 0"
        class="unpriced"
      >
        <p class="unpriced__title">
          在用，按默认倍率 ×{{ draftRules.defaultModelMultiplier }}
          <span class="unpriced__sub">近 30 天有调用、但倍率表里没有的模型</span>
        </p>
        <div
          v-for="m in unpriced"
          :key="m.modelName"
          class="unpriced__row"
        >
          <span class="mono unpriced__name">{{ m.modelName }}</span>
          <span class="vendors">
            <span
              v-for="v in m.vendors"
              :key="v"
              class="vendor"
            >{{ v }}</span>
          </span>
          <el-tag
            size="small"
            type="warning"
            effect="light"
          >
            在用，按默认倍率
          </el-tag>
          <el-tag
            v-if="!m.inCatalog"
            size="small"
            type="info"
            effect="plain"
          >
            不在目录
          </el-tag>
          <span class="unpriced__calls num">30 天 {{ m.calls30d.toLocaleString() }} 次</span>
          <el-button
            size="small"
            @click="addRow(m.modelName)"
          >
            单独定价
          </el-button>
        </div>
      </div>
    </section>

    <p
      v-if="saved"
      class="pricing__meta"
    >
      版本 {{ saved.version }} · 最近更新 {{ formatDateTime(saved.updatedAt,'YYYY-MM-DD HH:mm:ss') }}
    </p>

    <transition name="pricing-bar">
      <footer
        v-if="isDirty"
        class="pricing__bar"
      >
        <span class="pricing__bar-text">
          有未保存的更改<template v-if="changes.length"> · {{ changes.length }} 项</template>
          <span
            v-if="problems.length"
            class="pricing__bar-problem"
          >· {{ problems[0] }}</span>
        </span>
        <div class="pricing__bar-actions">
          <el-button
            :disabled="saving"
            @click="reset"
          >
            撤销
          </el-button>
          <el-button
            type="primary"
            :loading="saving"
            :disabled="problems.length > 0"
            @click="save"
          >
            保存
          </el-button>
        </div>
      </footer>
    </transition>
  </div>
</template>

<style scoped>
.pricing {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 0 4px 24px;
}

.pricing--dirty {
  padding-bottom: 88px;
}

.pricing :deep(.page-header) {
  margin-bottom: 2px;
}

.formula {
  padding: 12px 16px;
  border: 1px solid color-mix(in srgb, var(--el-color-primary) 22%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--el-color-primary) 5%, transparent);
}

.formula__main {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.formula__sub,
.formula__example {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

.formula__example {
  font-variant-numeric: tabular-nums;
}

.card {
  padding: 14px 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
}

.card__head {
  margin-bottom: 12px;
}

.card__head--row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.card__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.card__sub {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.baselines {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

.baseline {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
}

.baseline--token {
  grid-column: 1 / -1;
}

.baseline__label {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}

.baseline__inputs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.baseline__input {
  width: 120px;
}

.baseline__input--wide {
  width: 150px;
}

.baseline__unit {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.baseline__eq {
  margin: 0 4px;
  color: var(--el-text-color-placeholder);
}

.knobs {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}

.knob {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.knob__label {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}

.knob__hint {
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}

.model-select {
  width: 100%;
}

.model-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.model-option__meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.multiplier-input {
  width: 110px;
}

.vendors {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.vendor {
  padding: 0 6px;
  border-radius: 4px;
  font-size: 11px;
  line-height: 18px;
  color: var(--el-text-color-regular);
  background: var(--el-fill-color);
}

.unpriced {
  margin-top: 14px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--el-color-warning) 30%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--el-color-warning) 6%, transparent);
}

.unpriced__title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-color-warning-dark-2);
}

.unpriced__sub {
  margin-left: 8px;
  font-size: 12px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
}

.unpriced__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-top: 1px dashed var(--el-border-color-lighter);
}

.unpriced__row:first-of-type {
  border-top: none;
}

.unpriced__name {
  min-width: 180px;
  font-size: 13px;
  color: var(--el-text-color-primary);
}

.unpriced__calls {
  margin-left: auto;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.pricing__meta {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.pricing__bar {
  position: fixed;
  right: 24px;
  bottom: 24px;
  left: calc(var(--meeko-sider-width, 220px) + 24px);
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  background: var(--el-bg-color);
  box-shadow: var(--el-box-shadow-light);
}

.pricing__bar-text {
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.pricing__bar-problem {
  margin-left: 4px;
  color: var(--el-color-danger);
}

.pricing__bar-actions {
  display: flex;
  gap: 8px;
}

.pricing-bar-enter-active,
.pricing-bar-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.pricing-bar-enter-from,
.pricing-bar-leave-to {
  opacity: 0;
  transform: translateY(12px);
}

.mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}

.num {
  font-variant-numeric: tabular-nums;
}

.muted {
  color: var(--el-text-color-placeholder);
}
</style>
