<script setup lang="ts">
/**
 * Tavern 积分包：玩家拿平台钱包里的钱买积分。下架用开关，删除不影响已下的单（订单抄了包的名字、积分和价格）。
 */
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';

import PageHeader from '@/shared/ui/PageHeader.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import FillListPageLayout from '@/shared/ui/FillListPageLayout.vue';
import { formatDateTime } from '@/shared/lib/date';

import type { CreditPack, CreditPackEdit } from '../model/credits.types';
import { formatCny, formatCredits, roundTo } from '../model/meteringFormat';
import { getTavernCreditsPort } from '../services';

const port = getTavernCreditsPort();

const packs = ref<CreditPack[]>([]);
const loading = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const r = await port.packs();
    if (r.success) packs.value = r.data;
    else ElMessage.error(r.error.message);
  } finally {
    loading.value = false;
  }
}

/** 一元买多少积分（含赠送），比较各档划不划算用。 */
function perYuan(p: CreditPack): string {
  return p.price > 0 ? roundTo((p.credits + p.bonusCredits) / p.price, 2).toLocaleString() : '—';
}

// ─── 编辑 ────────────────────────────────────────────────

const dialogOpen = ref(false);
const saving = ref(false);
const formRef = ref<FormInstance>();
const form = ref<CreditPackEdit>(blank());

function blank(): CreditPackEdit {
  return { id: null, name: '', credits: 1000, bonusCredits: 0, price: 10, active: true, sort: 10 };
}

const rules: FormRules<CreditPackEdit> = {
  name: [{ required: true, message: '起个名字', trigger: 'blur' }],
};

const title = computed(() => (form.value.id === null ? '新建积分包' : '编辑积分包'));

function create(): void {
  form.value = { ...blank(), sort: (packs.value.at(-1)?.sort ?? 0) + 10 };
  dialogOpen.value = true;
}

function edit(p: CreditPack): void {
  form.value = {
    id: p.id,
    name: p.name,
    credits: p.credits,
    bonusCredits: p.bonusCredits,
    price: p.price,
    active: p.active,
    sort: p.sort,
  };
  dialogOpen.value = true;
}

async function save(): Promise<void> {
  if (!(await formRef.value?.validate().catch(() => false))) return;
  saving.value = true;
  try {
    const r = await port.savePack(form.value);
    if (!r.success) {
      ElMessage.error(r.error.message);
      return;
    }
    ElMessage.success('已保存');
    dialogOpen.value = false;
    await load();
  } finally {
    saving.value = false;
  }
}

async function remove(p: CreditPack): Promise<void> {
  try {
    await ElMessageBox.confirm(`删除积分包「${p.name}」？已下的单不受影响。只是不想卖了的话，下架就行。`, '删除积分包', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    });
  } catch {
    return;
  }
  const r = await port.deletePack(p.id);
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
      <PageHeader title="积分包">
        <template #actions>
          <el-button
            type="primary"
            :icon="Plus"
            @click="create"
          >
            新建积分包
          </el-button>
        </template>
      </PageHeader>
    </template>

    <el-table
      v-loading="loading"
      :data="packs"
      row-key="id"
      size="small"
      stripe
      height="100%"
      :empty-text="' '"
    >
      <el-table-column
        label="名称"
        min-width="160"
      >
        <template #default="{ row }: { row: CreditPack }">
          <span :class="{ 'cell-muted': !row.active }">{{ row.name }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="积分"
        width="120"
        align="right"
      >
        <template #default="{ row }: { row: CreditPack }">
          <span class="num">{{ formatCredits(row.credits) }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="赠送"
        width="110"
        align="right"
      >
        <template #default="{ row }: { row: CreditPack }">
          <span
            class="num"
            :class="{ 'cell-muted': row.bonusCredits === 0 }"
          >{{ row.bonusCredits ? `+${formatCredits(row.bonusCredits)}` : '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="售价"
        width="100"
        align="right"
      >
        <template #default="{ row }: { row: CreditPack }">
          <span class="num cell-price">{{ formatCny(row.price, 2) }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="每元积分"
        width="100"
        align="right"
      >
        <template #default="{ row }: { row: CreditPack }">
          <span class="num">{{ perYuan(row) }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="状态"
        width="80"
        align="center"
      >
        <template #default="{ row }: { row: CreditPack }">
          <el-tag
            size="small"
            :type="row.active ? 'success' : 'info'"
            effect="plain"
          >
            {{ row.active ? '在售' : '已下架' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        label="排序"
        width="70"
        align="right"
      >
        <template #default="{ row }: { row: CreditPack }">
          <span class="num">{{ row.sort }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="更新时间"
        width="150"
      >
        <template #default="{ row }: { row: CreditPack }">
          <span class="mono cell-time">{{ formatDateTime(row.updatedAt, 'YYYY-MM-DD HH:mm') }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="操作"
        width="110"
        align="center"
        fixed="right"
      >
        <template #default="{ row }: { row: CreditPack }">
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
          title="还没有积分包"
          description="新建一个，玩家才有积分可买。"
        />
      </template>
    </el-table>
  </FillListPageLayout>

  <el-dialog
    v-model="dialogOpen"
    :title="title"
    width="440px"
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
        label="名称"
        prop="name"
      >
        <el-input
          v-model="form.name"
          maxlength="64"
          placeholder="如：常用"
        />
      </el-form-item>
      <el-form-item label="积分">
        <el-input-number
          v-model="form.credits"
          :min="0.01"
          :precision="2"
          :step="100"
          controls-position="right"
        />
      </el-form-item>
      <el-form-item label="赠送">
        <el-input-number
          v-model="form.bonusCredits"
          :min="0"
          :precision="2"
          :step="10"
          controls-position="right"
        />
      </el-form-item>
      <el-form-item label="售价（元）">
        <el-input-number
          v-model="form.price"
          :min="0"
          :precision="2"
          :step="1"
          controls-position="right"
        />
      </el-form-item>
      <el-form-item label="排序">
        <el-input-number
          v-model="form.sort"
          :step="10"
          controls-position="right"
        />
      </el-form-item>
      <el-form-item label="在售">
        <el-switch v-model="form.active" />
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

.cell-muted {
  color: var(--el-text-color-placeholder);
}

.cell-time {
  font-size: 12px;
}

.cell-price {
  font-weight: 600;
  color: var(--el-color-warning);
}
</style>
