<script setup lang="ts">
/**
 * Tavern 积分价目：调一次模型扣多少积分。价目形状与 Yomi 定价一致，编辑直接用 Yomi 的价目对话框，单位是积分。
 *
 *  - 一行一个 (渠道, 模型)：目录里的、近 30 天调用过的、配过价的取并集，服务端合好下发
 *  - 没单独定价的照默认价扣；在用却没定价的标出来，默认价是按 token 的，生图这类按张的模型照它报不了，记 0
 *  - 改价最迟 30 秒对新回合生效，已扣的不变（回合里抄了当时的价目）
 */
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Edit, Search } from '@element-plus/icons-vue';

import { BillingTypeLabel, type RateBody } from '@yomi/common';
import PageHeader from '@/shared/ui/PageHeader.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import FillListPageLayout from '@/shared/ui/FillListPageLayout.vue';
import { formatDateTime } from '@/shared/lib/date';
import RateEditDialog from '@/features/yomi/components/RateEditDialog.vue';

import {
  ANY,
  creditBillingTypes,
  type CreditModelRate,
  type CreditRate,
  type CreditRateBoard,
} from '../model/credits.types';
import { creditPriceParts, creditPriceUnit } from '../model/creditRate';
import { getTavernCreditsPort } from '../services';

const port = getTavernCreditsPort();

const board = ref<CreditRateBoard | null>(null);
const loading = ref(false);
const keyword = ref('');
const onlyUnpriced = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const r = await port.rates();
    if (r.success) board.value = r.data;
    else ElMessage.error(r.error.message);
  } finally {
    loading.value = false;
  }
}

/** 在用却连同模型的不分渠道价都没有：照默认价扣，运营最该先看的那几行。 */
function unpriced(row: CreditModelRate): boolean {
  return row.rate === null && row.modelRate === null && row.calls30d > 0;
}

const rows = computed(() => {
  const k = keyword.value.trim().toLowerCase();
  return (board.value?.models ?? []).filter(
    (r) =>
      (!onlyUnpriced.value || unpriced(r)) &&
      (!k || `${r.vendorKey}/${r.modelName}`.toLowerCase().includes(k)),
  );
});

const unpricedCount = computed(() => (board.value?.models ?? []).filter(unpriced).length);

// ─── 编辑 ────────────────────────────────────────────────

interface Editing {
  vendorKey: string;
  modelName: string;
  initial: RateBody | null;
}

const editing = ref<Editing | null>(null);
const dialogOpen = ref(false);
const saving = ref(false);

const subjectKey = computed(() => {
  const e = editing.value;
  if (!e) return '';
  return e.modelName === ANY ? '默认价' : `${e.vendorKey === ANY ? '不分渠道' : e.vendorKey} / ${e.modelName}`;
});

function edit(vendorKey: string, modelName: string, rate: CreditRate | null): void {
  editing.value = { vendorKey, modelName, initial: rate ? rate.price : null };
  dialogOpen.value = true;
}

async function save(price: RateBody): Promise<void> {
  const e = editing.value;
  if (!e) return;
  saving.value = true;
  try {
    const r = await port.saveRate({ vendorKey: e.vendorKey, modelName: e.modelName, price });
    if (!r.success) {
      ElMessage.error(r.error.message);
      return;
    }
    ElMessage.success('已保存，30 秒内对新回合生效');
    dialogOpen.value = false;
    await load();
  } finally {
    saving.value = false;
  }
}

async function remove(row: CreditModelRate): Promise<void> {
  if (!row.rate) return;
  try {
    await ElMessageBox.confirm(`删掉 ${row.vendorKey}/${row.modelName} 的价目，之后照默认价扣？`, '删除价目', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    });
  } catch {
    return;
  }
  const r = await port.deleteRate(row.rate.id);
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
      <PageHeader title="积分价目" />
    </template>

    <template #filters>
      <section
        v-loading="loading && !board"
        class="default-card"
      >
        <div class="default-card__head">
          <span class="default-card__title">默认价</span>
          <span class="default-card__sub">没单独定价的模型照它扣</span>
        </div>
        <template v-if="board?.default">
          <el-tag
            size="small"
            effect="plain"
            type="info"
          >
            {{ BillingTypeLabel[board.default.price.billingType] }}
          </el-tag>
          <div class="price-parts">
            <span
              v-for="p in creditPriceParts(board.default.price)"
              :key="p.label"
              class="price-part"
              :class="{ 'price-part--inherited': p.inherited }"
            >
              <span class="price-part__label">{{ p.label }}</span>
              <span class="price-part__value num">{{ p.value }}</span>
            </span>
            <span class="price-unit">{{ creditPriceUnit(board.default.price) }}</span>
          </div>
          <el-button
            :icon="Edit"
            size="small"
            @click="edit(ANY, ANY, board.default)"
          >
            改价
          </el-button>
        </template>
        <span
          v-else-if="board"
          class="cell-muted"
        >还没有默认价（服务启动时会种一条）</span>
      </section>

      <div class="toolbar">
        <el-input
          v-model="keyword"
          :prefix-icon="Search"
          placeholder="渠道或模型"
          clearable
          style="width: 260px"
        />
        <el-checkbox v-model="onlyUnpriced">
          只看在用未定价<template v-if="unpricedCount">（{{ unpricedCount }}）</template>
        </el-checkbox>
      </div>
    </template>

    <el-table
      v-loading="loading"
      :data="rows"
      :row-key="(r: CreditModelRate) => `${r.vendorKey}/${r.modelName}`"
      size="small"
      stripe
      height="100%"
      :empty-text="' '"
    >
      <el-table-column
        label="渠道"
        width="130"
      >
        <template #default="{ row }: { row: CreditModelRate }">
          <span :class="{ 'cell-muted': row.vendorKey === ANY }">{{ row.vendorKey === ANY ? '不分渠道' : row.vendorKey }}</span>
        </template>
      </el-table-column>

      <el-table-column
        label="模型"
        min-width="220"
      >
        <template #default="{ row }: { row: CreditModelRate }">
          <div class="cell-model">
            <span class="mono">{{ row.modelName }}</span>
            <el-tag
              v-if="!row.inCatalog && row.vendorKey !== ANY"
              size="small"
              type="info"
              effect="plain"
            >
              已下架
            </el-tag>
          </div>
        </template>
      </el-table-column>

      <el-table-column
        label="近 30 天调用"
        width="110"
        align="right"
      >
        <template #default="{ row }: { row: CreditModelRate }">
          <span
            class="num"
            :class="{ 'cell-muted': row.calls30d === 0 }"
          >{{ row.calls30d.toLocaleString() }}</span>
        </template>
      </el-table-column>

      <el-table-column
        label="计量"
        width="96"
      >
        <template #default="{ row }: { row: CreditModelRate }">
          <el-tag
            v-if="row.rate"
            size="small"
            effect="plain"
            type="info"
          >
            {{ BillingTypeLabel[row.rate.price.billingType] }}
          </el-tag>
          <span
            v-else
            class="cell-muted"
          >—</span>
        </template>
      </el-table-column>

      <el-table-column
        label="价格"
        min-width="300"
      >
        <template #default="{ row }: { row: CreditModelRate }">
          <div
            v-if="row.rate"
            class="price-parts"
          >
            <span
              v-for="p in creditPriceParts(row.rate.price)"
              :key="p.label"
              class="price-part"
              :class="{ 'price-part--inherited': p.inherited }"
            >
              <span class="price-part__label">{{ p.label }}</span>
              <span class="price-part__value num">{{ p.value }}</span>
            </span>
            <span class="price-unit">{{ creditPriceUnit(row.rate.price) }}</span>
          </div>
          <div
            v-else-if="row.modelRate"
            class="price-parts price-parts--inherited"
            title="这一渠道没单独定价，照同模型不分渠道的价"
          >
            <el-tag
              size="small"
              type="info"
              effect="plain"
            >
              不分渠道价
            </el-tag>
            <span
              v-for="p in creditPriceParts(row.modelRate.price)"
              :key="p.label"
              class="price-part price-part--inherited"
            >
              <span class="price-part__label">{{ p.label }}</span>
              <span class="price-part__value num">{{ p.value }}</span>
            </span>
          </div>
          <el-tag
            v-else-if="unpriced(row)"
            size="small"
            type="warning"
            effect="plain"
          >
            照默认价
          </el-tag>
          <span
            v-else
            class="cell-muted"
          >照默认价</span>
        </template>
      </el-table-column>

      <el-table-column
        label="改价时间"
        width="150"
      >
        <template #default="{ row }: { row: CreditModelRate }">
          <span
            v-if="row.rate"
            class="mono cell-time"
          >{{ formatDateTime(row.rate.updatedAt, 'YYYY-MM-DD HH:mm') }}</span>
          <span
            v-else
            class="cell-muted"
          >—</span>
        </template>
      </el-table-column>

      <el-table-column
        label="操作"
        width="120"
        align="center"
        fixed="right"
      >
        <template #default="{ row }: { row: CreditModelRate }">
          <el-button
            link
            type="primary"
            @click="edit(row.vendorKey, row.modelName, row.rate)"
          >
            {{ row.rate ? '改价' : '定价' }}
          </el-button>
          <el-button
            v-if="row.rate"
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
          title="没有符合条件的模型"
          description="清掉搜索词或取消「只看在用未定价」。"
        />
      </template>
    </el-table>
  </FillListPageLayout>

  <RateEditDialog
    v-model="dialogOpen"
    :subject-key="subjectKey"
    :initial="editing?.initial ?? null"
    :loading="saving"
    title-noun="积分价目"
    :billing-type="editing?.initial?.billingType ?? 'per_token'"
    currency="CREDIT"
    :billing-types="editing?.modelName === ANY ? ['per_token'] : creditBillingTypes"
    @submit="save"
  />
</template>

<style scoped>
.mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12.5px;
}

.num {
  font-variant-numeric: tabular-nums;
}

.cell-muted {
  color: var(--el-text-color-placeholder);
}

.cell-time {
  font-size: 12px;
  color: var(--el-text-color-regular);
}

.default-card {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 16px;
  padding: 12px 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
}

.default-card__head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 140px;
}

.default-card__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.default-card__sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
}

.cell-model {
  display: flex;
  align-items: center;
  gap: 6px;
}

.price-parts {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 12px;
}

.price-part {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
}

.price-part__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.price-part__value {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.price-part--inherited .price-part__value {
  font-weight: 400;
  color: var(--el-text-color-placeholder);
}

.price-unit {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
