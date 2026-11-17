<script setup lang="ts">
/**
 * Jastalk 定价：每个模型用一次扣多少积分（1 元 = 100 积分）。
 * 一行管一个（渠道, 模型）。渠道写 `*` 是不分渠道，两个都写 `*` 是默认价；找价格的顺序是
 * （渠道, 模型）→（*, 模型）→（*, *），取第一个单位对得上的。都找不到的模型用户选不了。
 * 改价最迟 30 秒生效；已经结算的不受影响（用量明细里抄着当时的单价）。
 */
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';

import PageHeader from '@/shared/ui/PageHeader.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import FillListPageLayout from '@/shared/ui/FillListPageLayout.vue';
import { formatDateTime } from '@/shared/lib/date';

import { ANY, rateUnits, type PointRate, type PointRateEdit, type RateUnit } from '../model/jastalk.types';
import { describePrice, formatPrice, unitLabels, unitPer } from '../model/jastalkFormat';
import { getJastalkAdminPort } from '../services';

const port = getJastalkAdminPort();

const rates = ref<PointRate[]>([]);
const loading = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const r = await port.rates();
    if (r.success) rates.value = r.data;
    else ElMessage.error(r.error.message);
  } finally {
    loading.value = false;
  }
}

/** 这一行管到谁。 */
function scope(r: Pick<PointRate, 'vendorKey' | 'modelName'>): string {
  if (r.vendorKey === ANY && r.modelName === ANY) return '默认价：没单独定价的都照它';
  if (r.vendorKey === ANY) return '不分渠道';
  return '只管这个渠道';
}

// ─── 编辑 ────────────────────────────────────────────────

const dialogOpen = ref(false);
const saving = ref(false);
const editing = ref(false);
const formRef = ref<FormInstance>();
const form = ref<PointRateEdit>(blank());

function blank(): PointRateEdit {
  return { vendorKey: ANY, modelName: '', unit: 'token', inputPrice: 300, outputPrice: 1500 };
}

const rules: FormRules<PointRateEdit> = {
  vendorKey: [{ required: true, message: '填渠道，不分渠道写 *', trigger: 'blur' }],
  modelName: [
    { required: true, message: '填模型名，默认价写 *', trigger: 'blur' },
    {
      trigger: 'blur',
      validator: (_: unknown, value: string, done: (e?: Error) => void) =>
        done(value.trim() === ANY && form.value.vendorKey.trim() !== ANY ? new Error('模型写 * 时渠道也得是 *（默认价）') : undefined),
    },
  ],
};

/** 已经有这一对了：保存是改价，不是多一行。 */
const existing = computed(() =>
  rates.value.find((r) => r.vendorKey === form.value.vendorKey.trim() && r.modelName === form.value.modelName.trim()),
);

/** 每种单位下两个价格各是什么意思；用不上的那个不给填。 */
const priceFields: Readonly<Record<RateUnit, { input: string | null; output: string | null }>> = {
  token: { input: '输入', output: '输出' },
  image: { input: null, output: '每张' },
  audio_second: { input: '听写', output: '合成' },
};

function onUnitChange(): void {
  if (priceFields[form.value.unit].input === null) form.value.inputPrice = 0;
}

function create(): void {
  editing.value = false;
  form.value = blank();
  dialogOpen.value = true;
}

function edit(r: PointRate): void {
  editing.value = true;
  form.value = { vendorKey: r.vendorKey, modelName: r.modelName, unit: r.unit, inputPrice: r.inputPrice, outputPrice: r.outputPrice };
  dialogOpen.value = true;
}

async function save(): Promise<void> {
  if (!(await formRef.value?.validate().catch(() => false))) return;
  saving.value = true;
  try {
    const r = await port.saveRate({ ...form.value, vendorKey: form.value.vendorKey.trim(), modelName: form.value.modelName.trim() });
    if (!r.success) {
      ElMessage.error(r.error.message);
      return;
    }
    ElMessage.success('已保存，最迟 30 秒生效');
    dialogOpen.value = false;
    await load();
  } finally {
    saving.value = false;
  }
}

async function remove(r: PointRate): Promise<void> {
  const isDefault = r.vendorKey === ANY && r.modelName === ANY;
  try {
    await ElMessageBox.confirm(
      isDefault
        ? '删掉默认价？没单独定价的模型会变成没有价格，用户选不了。'
        : `删掉 ${r.vendorKey} / ${r.modelName} 的价格？它会改照更宽的那一行算（不分渠道的价、默认价）；都没有的话用户选不了它。`,
      '删除价格',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  const res = await port.deleteRate(r.id);
  if (!res.success) {
    ElMessage.error(res.error.message);
    return;
  }
  ElMessage.success('已删除');
  await load();
}

onMounted(load);
</script>

<template>
  <FillListPageLayout>
    <template #header>
      <PageHeader
        title="定价"
        description="单位是积分，1 元 = 100 积分。按 token 的是每百万 token 多少积分。"
      >
        <template #actions>
          <el-button
            type="primary"
            :icon="Plus"
            @click="create"
          >
            添加价格
          </el-button>
        </template>
      </PageHeader>
    </template>

    <el-table
      v-loading="loading"
      :data="rates"
      row-key="id"
      size="small"
      stripe
      height="100%"
      :empty-text="' '"
    >
      <el-table-column
        label="渠道"
        min-width="130"
      >
        <template #default="{ row }: { row: PointRate }">
          <span class="mono">{{ row.vendorKey }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="模型"
        min-width="220"
      >
        <template #default="{ row }: { row: PointRate }">
          <div class="cell-stack">
            <span class="mono">{{ row.modelName }}</span>
            <span class="cell-sub">{{ scope(row) }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column
        label="计价"
        width="90"
      >
        <template #default="{ row }: { row: PointRate }">
          {{ unitLabels[row.unit] }}
        </template>
      </el-table-column>
      <el-table-column
        label="价格（积分）"
        min-width="280"
      >
        <template #default="{ row }: { row: PointRate }">
          <span class="num">{{ describePrice(row.unit, row.inputPrice, row.outputPrice) }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="更新时间"
        width="150"
      >
        <template #default="{ row }: { row: PointRate }">
          <span class="mono cell-time">{{ formatDateTime(row.updatedAt, 'YYYY-MM-DD HH:mm') }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="操作"
        width="110"
        align="center"
        fixed="right"
      >
        <template #default="{ row }: { row: PointRate }">
          <el-button
            link
            type="primary"
            @click="edit(row)"
          >
            改价
          </el-button>
          <el-button
            link
            type="danger"
            @click="remove(row)"
          >
            删除
          </el-button>
        </template>
      </el-table-column>

      <template #empty>
        <EmptyState
          title="还没有定价"
          description="没有价格的模型用户选不了。先加一行默认价（渠道、模型都写 *），再给贵的模型单独定价。"
        />
      </template>
    </el-table>
  </FillListPageLayout>

  <el-dialog
    v-model="dialogOpen"
    :title="editing ? '改价' : '添加价格'"
    width="520px"
    align-center
    :close-on-click-modal="false"
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="72px"
    >
      <el-form-item
        label="渠道"
        prop="vendorKey"
      >
        <el-input
          v-model="form.vendorKey"
          :disabled="editing"
          maxlength="64"
          placeholder="如：kiro；不分渠道写 *"
        />
      </el-form-item>
      <el-form-item
        label="模型"
        prop="modelName"
      >
        <el-input
          v-model="form.modelName"
          :disabled="editing"
          maxlength="128"
          placeholder="如：claude-opus-5.5；默认价写 *"
        />
        <span
          v-if="!editing && existing"
          class="hint hint--warn"
        >这一对已经有价格了（{{ describePrice(existing.unit, existing.inputPrice, existing.outputPrice) }}），保存会改掉它。</span>
        <span
          v-else-if="!editing"
          class="hint"
        >{{ scope({ vendorKey: form.vendorKey.trim(), modelName: form.modelName.trim() }) }}</span>
      </el-form-item>
      <el-form-item label="计价">
        <el-radio-group
          v-model="form.unit"
          @change="onUnitChange"
        >
          <el-radio-button
            v-for="u in rateUnits"
            :key="u"
            :value="u"
          >
            {{ unitLabels[u] }}
          </el-radio-button>
        </el-radio-group>
        <span class="hint">对话、向量、重排按 token；生图按张；语音按秒。单位和模型的类别对不上，这一行就用不上。</span>
      </el-form-item>
      <el-form-item
        v-if="priceFields[form.unit].input"
        :label="priceFields[form.unit].input ?? ''"
      >
        <el-input-number
          v-model="form.inputPrice"
          :min="0"
          :precision="form.unit === 'token' ? 2 : 4"
          :step="form.unit === 'token' ? 100 : 0.01"
          controls-position="right"
        />
        <span class="unit">积分 {{ unitPer[form.unit] }}</span>
      </el-form-item>
      <el-form-item :label="priceFields[form.unit].output ?? ''">
        <el-input-number
          v-model="form.outputPrice"
          :min="0"
          :precision="form.unit === 'token' ? 2 : 4"
          :step="form.unit === 'token' ? 100 : form.unit === 'image' ? 1 : 0.01"
          controls-position="right"
        />
        <span class="unit">积分 {{ unitPer[form.unit] }}</span>
      </el-form-item>
      <el-form-item
        v-if="form.unit === 'token'"
        label="折合"
      >
        <span class="hint hint--inline">
          每百万 token 输入 ¥{{ formatPrice(form.inputPrice / 100) }}、输出 ¥{{ formatPrice(form.outputPrice / 100) }}
        </span>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogOpen = false">
        取消
      </el-button>
      <el-button
        type="primary"
        :loading="saving"
        @click="save"
      >
        保存
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}

.num {
  font-variant-numeric: tabular-nums;
}

.cell-stack {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  line-height: 1.35;
}

.cell-time {
  font-size: 12px;
}

.unit {
  margin-left: 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.hint {
  display: block;
  width: 100%;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}

.hint--inline {
  display: inline;
}

.hint--warn {
  color: var(--el-color-warning);
}
</style>
