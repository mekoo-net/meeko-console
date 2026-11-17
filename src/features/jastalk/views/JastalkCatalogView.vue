<script setup lang="ts">
/**
 * Jastalk 模型目录：用户能选哪些渠道和模型（先选渠道再选模型，用户不接 API）。
 * 渠道和模型名原样发给 OneApi，要和它那边的写法一字不差。价格不在这里，在「定价」；
 * 目录里有、定价表里找不到价格的模型，用户选不了——这一页把它们标出来。
 * 每改一次版本号加一，Jastalk 的网关几秒内拉到新的，不用重启。
 */
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';

import PageHeader from '@/shared/ui/PageHeader.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import FillListPageLayout from '@/shared/ui/FillListPageLayout.vue';
import { formatDateTime } from '@/shared/lib/date';

import { modelCategories, type CatalogModel, type CatalogModelEdit, type ModelCategory } from '../model/jastalk.types';
import { categoryLabels, categoryUnits, describePrice, unitLabels } from '../model/jastalkFormat';
import { getJastalkAdminPort } from '../services';

const port = getJastalkAdminPort();

const models = ref<CatalogModel[]>([]);
const version = ref(0);
const loading = ref(false);
const category = ref<ModelCategory | 'all'>('all');

const shown = computed(() => (category.value === 'all' ? models.value : models.value.filter((m) => m.category === category.value)));
/** 开着却没有价格的：用户在列表里看不到它们，多半是忘了配价。 */
const unpriced = computed(() => models.value.filter((m) => m.enabled && !m.priced).length);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const r = await port.catalog();
    if (r.success) {
      models.value = r.data.models;
      version.value = r.data.version;
    } else ElMessage.error(r.error.message);
  } finally {
    loading.value = false;
  }
}

// ─── 编辑 ────────────────────────────────────────────────

const dialogOpen = ref(false);
const saving = ref(false);
const formRef = ref<FormInstance>();
const form = ref<CatalogModelEdit>(blank());

function blank(): CatalogModelEdit {
  return {
    id: null,
    category: category.value === 'all' ? 'chat' : category.value,
    vendorKey: '',
    modelName: '',
    vendorName: '',
    displayName: '',
    enabled: true,
    sort: 10,
  };
}

const isNew = computed(() => form.value.id === null);
const title = computed(() => (isNew.value ? '添加模型' : '编辑模型'));

const noWildcard = (_: unknown, value: string, done: (e?: Error) => void) =>
  done(value.trim() === '*' ? new Error('目录里要写具体的名字，不能写 *') : undefined);

const rules: FormRules<CatalogModelEdit> = {
  vendorKey: [
    { required: true, message: '填渠道（OneApi 那边的 vendor key）', trigger: 'blur' },
    { validator: noWildcard, trigger: 'blur' },
  ],
  modelName: [
    { required: true, message: '填模型名（和 OneApi 那边一字不差）', trigger: 'blur' },
    { validator: noWildcard, trigger: 'blur' },
  ],
};

function create(): void {
  const sameCategory = models.value.filter((m) => m.category === blank().category);
  form.value = { ...blank(), sort: (sameCategory.at(-1)?.sort ?? 0) + 10 };
  dialogOpen.value = true;
}

function edit(m: CatalogModel): void {
  form.value = {
    id: m.id,
    category: m.category,
    vendorKey: m.vendorKey,
    modelName: m.modelName,
    vendorName: m.vendorName,
    displayName: m.displayName,
    enabled: m.enabled,
    sort: m.sort,
  };
  dialogOpen.value = true;
}

/** 这个渠道以前起过的显示名：新加同一个渠道的模型时自动带上，免得同一个渠道叫出两个名字。 */
function fillVendorName(): void {
  if (!isNew.value || form.value.vendorName.trim()) return;
  const known = models.value.find((m) => m.vendorKey === form.value.vendorKey.trim());
  if (known) form.value.vendorName = known.vendorName;
}

async function save(): Promise<void> {
  if (!(await formRef.value?.validate().catch(() => false))) return;
  saving.value = true;
  try {
    const r = await port.saveModel(form.value);
    if (!r.success) {
      ElMessage.error(r.error.message);
      return;
    }
    ElMessage.success(r.data.priced || !r.data.enabled ? '已保存' : '已保存。这个模型还没有价格，用户暂时选不了');
    dialogOpen.value = false;
    await load();
  } finally {
    saving.value = false;
  }
}

async function remove(m: CatalogModel): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `从目录里删掉「${m.displayName}」（${m.vendorKey} / ${m.modelName}）？删掉以后用户不能再选它。只是暂时不想开放的话，停用就行。`,
      '删除模型',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  const r = await port.deleteModel(m.id);
  if (!r.success) {
    ElMessage.error(r.error.message);
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
        title="模型目录"
        :description="`版本 ${version}，每改一次加一；网关几秒内拉到新的。`"
      >
        <template #actions>
          <el-button
            type="primary"
            :icon="Plus"
            @click="create"
          >
            添加模型
          </el-button>
        </template>
      </PageHeader>
    </template>

    <template #filters>
      <div class="filters">
        <el-radio-group v-model="category">
          <el-radio-button value="all">
            全部
          </el-radio-button>
          <el-radio-button
            v-for="c in modelCategories"
            :key="c"
            :value="c"
          >
            {{ categoryLabels[c] }}
          </el-radio-button>
        </el-radio-group>
        <el-alert
          v-if="unpriced > 0"
          class="filters__alert"
          type="warning"
          :closable="false"
          show-icon
          :title="`有 ${unpriced} 个开着的模型还没有价格，用户选不了。去「定价」里配上。`"
        />
      </div>
    </template>

    <el-table
      v-loading="loading"
      :data="shown"
      row-key="id"
      size="small"
      stripe
      height="100%"
      :empty-text="' '"
    >
      <el-table-column
        label="类别"
        width="96"
      >
        <template #default="{ row }: { row: CatalogModel }">
          {{ categoryLabels[row.category] }}
        </template>
      </el-table-column>
      <el-table-column
        label="渠道"
        min-width="150"
      >
        <template #default="{ row }: { row: CatalogModel }">
          <div class="cell-stack">
            <span :class="{ 'cell-muted': !row.enabled }">{{ row.vendorName }}</span>
            <span class="cell-sub mono">{{ row.vendorKey }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column
        label="模型"
        min-width="220"
      >
        <template #default="{ row }: { row: CatalogModel }">
          <div class="cell-stack">
            <span :class="{ 'cell-muted': !row.enabled }">{{ row.displayName }}</span>
            <span class="cell-sub mono">{{ row.modelName }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column
        label="价格（积分）"
        min-width="260"
      >
        <template #default="{ row }: { row: CatalogModel }">
          <div
            v-if="row.priced"
            class="cell-stack"
          >
            <span class="num">{{ describePrice(row.unit, row.inputPrice, row.outputPrice) }}</span>
            <span class="cell-sub">照定价表的 <span class="mono">{{ row.ratedBy }}</span></span>
          </div>
          <el-tag
            v-else
            size="small"
            type="warning"
            effect="plain"
            :title="`定价表里没有${unitLabels[row.unit]}算的价格能用在它身上`"
          >
            没有价格（要{{ unitLabels[row.unit] }}的）
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        label="状态"
        width="80"
        align="center"
      >
        <template #default="{ row }: { row: CatalogModel }">
          <el-tag
            size="small"
            :type="row.enabled ? 'success' : 'info'"
            effect="plain"
          >
            {{ row.enabled ? '开放' : '已停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        label="排序"
        width="70"
        align="right"
      >
        <template #default="{ row }: { row: CatalogModel }">
          <span class="num">{{ row.sort }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="更新时间"
        width="150"
      >
        <template #default="{ row }: { row: CatalogModel }">
          <span class="mono cell-time">{{ formatDateTime(row.updatedAt, 'YYYY-MM-DD HH:mm') }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="操作"
        width="110"
        align="center"
        fixed="right"
      >
        <template #default="{ row }: { row: CatalogModel }">
          <el-button
            link
            type="primary"
            @click="edit(row)"
          >
            编辑
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
          title="目录是空的"
          description="添加模型以后，用户才有模型可选。"
        />
      </template>
    </el-table>
  </FillListPageLayout>

  <el-dialog
    v-model="dialogOpen"
    :title="title"
    width="520px"
    align-center
    :close-on-click-modal="false"
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="84px"
    >
      <el-form-item label="类别">
        <el-select
          v-model="form.category"
          :disabled="!isNew"
        >
          <el-option
            v-for="c in modelCategories"
            :key="c"
            :label="`${categoryLabels[c]}（${unitLabels[categoryUnits[c]]}）`"
            :value="c"
          />
        </el-select>
      </el-form-item>
      <el-form-item
        label="渠道"
        prop="vendorKey"
      >
        <el-input
          v-model="form.vendorKey"
          :disabled="!isNew"
          maxlength="64"
          placeholder="如：kiro"
          @blur="fillVendorName"
        />
      </el-form-item>
      <el-form-item
        label="模型"
        prop="modelName"
      >
        <el-input
          v-model="form.modelName"
          :disabled="!isNew"
          maxlength="128"
          placeholder="如：claude-opus-5.5"
        />
        <span
          v-if="isNew"
          class="hint"
        >类别、渠道、模型建了以后不能改；同一个模型各渠道写法可能不一样。</span>
      </el-form-item>
      <el-form-item label="渠道显示名">
        <el-input
          v-model="form.vendorName"
          maxlength="64"
          :placeholder="form.vendorKey.trim() || '不填就用渠道的名字'"
        />
      </el-form-item>
      <el-form-item label="模型显示名">
        <el-input
          v-model="form.displayName"
          maxlength="64"
          :placeholder="form.modelName.trim() || '不填就用模型名'"
        />
      </el-form-item>
      <el-form-item label="排序">
        <el-input-number
          v-model="form.sort"
          :step="10"
          controls-position="right"
        />
        <span class="hint">同一类里小的在前；用户没选过时用对话类里排第一个的。</span>
      </el-form-item>
      <el-form-item label="开放">
        <el-switch v-model="form.enabled" />
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
.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.filters__alert {
  flex: 1 1 320px;
  width: auto;
  padding: 6px 12px;
}

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

.cell-muted {
  color: var(--el-text-color-placeholder);
}

.cell-time {
  font-size: 12px;
}

.hint {
  display: block;
  width: 100%;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}
</style>
