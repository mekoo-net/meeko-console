<script setup lang="ts">
/**
 * 模型定价管理页。
 *
 * 与 Models 1..1 —— 一行展示一个 modelId 的定价；未配置的模型会以"未设置"占位行
 * 出现在列表底部（通过对比 models 与 pricing 推导），点击「设置」直接 upsert。
 */
import { computed, onMounted, ref, watch } from 'vue';

import { Delete, Edit, RefreshLeft, Search } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

import PageHeader from '@/shared/ui/PageHeader.vue';
import StatusTag from '@/shared/ui/StatusTag.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import { formatDateTime } from '@/shared/lib/date';
import { formatMoney } from '@/shared/lib/money';
import { confirmDanger } from '@/shared/composables/useConfirm';
import { TIER_THRESHOLDS } from '@/features/accounts/model/tierConfig';

import {
  pricingModeValues,
  PricingModeLabel,
  type PricingMode,
} from '../model/enums';
import type { ListPricingFilter, Pricing, UpsertPricingInput } from '../model/pricing.types';
import type { Model } from '../model/model.types';
import { getDemuxaiModelPort, getDemuxaiPricingPort } from '../services';
import PricingEditDialog from '../components/PricingEditDialog.vue';

const pricingPort = getDemuxaiPricingPort();
const modelPort = getDemuxaiModelPort();

const records = ref<Pricing[]>([]);
const total = ref(0);
const loading = ref(false);

const page = ref(1);
const pageSize = ref(20);

interface PageFilter {
  keyword: string;
  mode: PricingMode | 'all';
}

const defaultFilter = (): PageFilter => ({
  keyword: '',
  mode: 'all',
});

const filter = ref<PageFilter>(defaultFilter());

const models = ref<Model[]>([]);
const modelsByModelId = computed(() => {
  const m = new Map<string, Model>();
  for (const it of models.value) m.set(it.modelId, it);
  return m;
});

const dialogOpen = ref(false);
const dialogLoading = ref(false);
const editingPricing = ref<Pricing | null>(null);
const editingModel = ref<Model | null>(null);

function buildPortFilter(): ListPricingFilter {
  return {
    keyword: filter.value.keyword.trim(),
    mode: filter.value.mode,
  };
}

async function loadModels(): Promise<void> {
  const r = await modelPort.list({
    page: 1,
    pageSize: 500,
    filter: { keyword: '', family: 'all', capability: 'all' },
  });
  if (r.success) models.value = r.data.items;
}

async function fetchData(): Promise<void> {
  loading.value = true;
  try {
    const r = await pricingPort.list({
      page: page.value,
      pageSize: pageSize.value,
      filter: buildPortFilter(),
    });
    if (r.success) {
      records.value = r.data.items;
      total.value = r.data.total;
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    loading.value = false;
  }
}

watch(
  () => [page.value, pageSize.value] as const,
  () => void fetchData(),
);

watch(
  () => [filter.value.keyword, filter.value.mode] as const,
  () => {
    page.value = 1;
    void fetchData();
  },
);

function resetFilter(): void {
  filter.value = defaultFilter();
  page.value = 1;
}

function openEdit(p: Pricing): void {
  editingPricing.value = p;
  editingModel.value = modelsByModelId.value.get(p.modelId) ?? null;
  dialogOpen.value = true;
}

function openCreateFor(m: Model): void {
  editingPricing.value = null;
  editingModel.value = m;
  dialogOpen.value = true;
}

async function onSubmit(payload: UpsertPricingInput): Promise<void> {
  dialogLoading.value = true;
  try {
    const r = await pricingPort.upsert(payload);
    if (r.success) {
      ElMessage.success('定价已保存');
      dialogOpen.value = false;
      await fetchData();
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    dialogLoading.value = false;
  }
}

async function onDelete(row: Pricing): Promise<void> {
  const okp = await confirmDanger({
    title: '删除定价',
    message: `确认删除 "${row.modelId}" 的定价？删除后该模型不会再有现行价，BFF 会拒绝计费请求直至重新设置。`,
    confirmText: '确认删除',
    type: 'warning',
  });
  if (!okp) return;
  const r = await pricingPort.delete(row.modelId);
  if (r.success) {
    ElMessage.success('已删除');
    await fetchData();
  } else {
    ElMessage.error(r.error.message);
  }
}

const unconfiguredModels = computed<Model[]>(() => {
  const configured = new Set(records.value.map((r) => r.modelId));
  return models.value.filter((m) => !configured.has(m.modelId));
});

function priceSummary(row: Pricing): string {
  if (row.mode === 'per_token') {
    return `${formatMoney(row.inputPricePerKToken ?? 0, { fractionDigits: 4 })} 入 / ${formatMoney(
      row.outputPricePerKToken ?? 0,
      { fractionDigits: 4 },
    )} 出 · per 1K`;
  }
  if (row.mode === 'per_call') return `${formatMoney(row.pricePerCall ?? 0, { fractionDigits: 4 })} / 次`;
  if (row.mode === 'per_image') return `${formatMoney(row.pricePerImage ?? 0, { fractionDigits: 4 })} / 张`;
  return `${formatMoney(row.pricePerMinute ?? 0, { fractionDigits: 4 })} / 分钟`;
}

function tierBadgeLabel(level: number, mult: number): string {
  const def = TIER_THRESHOLDS.find((t) => t.level === level);
  return `${def?.name ?? `Lv${level}`} × ${mult}`;
}

onMounted(() => {
  void loadModels();
  void fetchData();
});
</script>

<template>
  <div class="page">
    <PageHeader
      title="模型定价"
      description="每个 modelId 一条定价。最终扣费 = 基础单价 × tokens / 1K × 全局倍率 × LV 倍率。生效时间未来 = 预生效；历史不可改，只能用新 effectiveFrom 覆盖。"
    />

    <el-card class="filter-card" shadow="never">
      <el-form inline @submit.prevent>
        <el-form-item label="搜索">
          <el-input
            v-model="filter.keyword"
            :prefix-icon="Search"
            placeholder="modelId"
            style="width: 240px"
            clearable
          />
        </el-form-item>
        <el-form-item label="计费模式">
          <el-select v-model="filter.mode" style="width: 180px">
            <el-option label="全部" value="all" />
            <el-option
              v-for="m in pricingModeValues"
              :key="m"
              :label="PricingModeLabel[m]"
              :value="m"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button :icon="RefreshLeft" @click="resetFilter">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-table
      v-loading="loading"
      :data="records"
      row-key="modelId"
      size="small"
      class="compact-table"
      :empty-text="' '"
    >
      <el-table-column label="modelId" min-width="220">
        <template #default="{ row }: { row: Pricing }">
          <div class="cell-model">
            <div class="cell-model__name">
              {{ modelsByModelId.get(row.modelId)?.displayName ?? row.modelId }}
            </div>
            <div class="cell-model__id">{{ row.modelId }}</div>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="计费模式" width="120">
        <template #default="{ row }: { row: Pricing }">
          <el-tag size="small" type="primary" effect="plain" round>
            {{ PricingModeLabel[row.mode] }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column label="基础单价" min-width="280">
        <template #default="{ row }: { row: Pricing }">
          <span class="cell-price">{{ priceSummary(row) }}</span>
        </template>
      </el-table-column>

      <el-table-column label="全局倍率" width="100" align="center">
        <template #default="{ row }: { row: Pricing }">
          <span class="num">× {{ row.multiplier }}</span>
        </template>
      </el-table-column>

      <el-table-column label="LV 倍率" min-width="220">
        <template #default="{ row }: { row: Pricing }">
          <div class="tier-badges">
            <el-tag
              v-for="[lv, mult] in Object.entries(row.tierMultipliers)"
              :key="lv"
              size="small"
              effect="plain"
              :type="Number(mult) < 1 ? 'success' : 'warning'"
            >
              {{ tierBadgeLabel(Number(lv), Number(mult)) }}
            </el-tag>
            <span v-if="Object.keys(row.tierMultipliers).length === 0" class="cell-muted">—</span>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="生效时间" width="160">
        <template #default="{ row }: { row: Pricing }">
          <span class="cell-date">{{ formatDateTime(row.effectiveFromUtc) }}</span>
        </template>
      </el-table-column>

      <el-table-column label="操作" width="160" align="right" fixed="right">
        <template #default="{ row }: { row: Pricing }">
          <el-button :icon="Edit" link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button :icon="Delete" link type="danger" @click="onDelete(row)">删除</el-button>
        </template>
      </el-table-column>

      <template #empty>
        <EmptyState
          title="暂无定价"
          description="尚未为任何模型设置定价；下方「未配置定价」区可一键创建。"
        />
      </template>
    </el-table>

    <div class="pagination-bar">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        background
      />
    </div>

    <section v-if="unconfiguredModels.length > 0" class="unconfigured">
      <h3 class="unconfigured__title">
        未配置定价
        <StatusTag :label="`${unconfiguredModels.length} 个`" tone="warning" />
      </h3>
      <p class="unconfigured__desc">
        这些模型已启用但未设置定价，BFF 收到调用时会拒绝计费。建议尽快补齐。
      </p>
      <div class="unconfigured__grid">
        <div v-for="m in unconfiguredModels" :key="m.modelId" class="unconfigured__card">
          <div>
            <div class="unconfigured__name">{{ m.displayName }}</div>
            <div class="unconfigured__id">{{ m.modelId }}</div>
          </div>
          <el-button size="small" type="primary" plain @click="openCreateFor(m)">
            设置定价
          </el-button>
        </div>
      </div>
    </section>

    <PricingEditDialog
      v-model="dialogOpen"
      :pricing="editingPricing"
      :model="editingModel"
      :loading="dialogLoading"
      @submit="onSubmit"
    />
  </div>
</template>

<style scoped>
.filter-card {
  margin-bottom: 14px;
  border-radius: 8px;
}
.filter-card :deep(.el-card__body) {
  padding: 14px 20px 0;
}
.cell-model__name {
  font-weight: 500;
  color: var(--el-text-color-primary);
}
.cell-model__id {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
.cell-price {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12.5px;
}
.tier-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.num {
  font-variant-numeric: tabular-nums;
}
.pagination-bar {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
.unconfigured {
  margin-top: 24px;
  padding: 16px 20px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 8px;
}
.unconfigured__title {
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #92400e;
}
.unconfigured__desc {
  margin: 0 0 12px;
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
}
.unconfigured__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 10px;
}
.unconfigured__card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: #fff;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}
.unconfigured__name {
  font-weight: 500;
  font-size: 13px;
}
.unconfigured__id {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
</style>
