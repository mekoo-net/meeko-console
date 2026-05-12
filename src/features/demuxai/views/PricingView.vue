<script setup lang="ts">
/**
 * 模型定价管理页。
 *
 * 与 Models 1..1 —— 一行展示一个 modelId 的定价。Tab 切换：
 *  - 「模型定价」：已配置定价的列表（带过滤 + 分页）
 *  - 「未配置」：models 与 pricing 对比推导出的未定价模型表格（带分页），
 *    点击行直接 upsert 一条新定价。
 */
import { computed, onMounted, ref, watch } from 'vue';

import { Delete, Edit, RefreshLeft, Search } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

import PageHeader from '@/shared/ui/PageHeader.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import { formatDateTime } from '@/shared/lib/date';
import { formatMoney } from '@/shared/lib/money';
import { confirmDanger } from '@/shared/composables/useConfirm';
import { TIER_THRESHOLDS } from '@/features/accounts/model/tierConfig';

import {
  ModelFamilyLabel,
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

type TabName = 'priced' | 'unconfigured';
const activeTab = ref<TabName>('priced');

const unconfiguredPage = ref(1);
const unconfiguredPageSize = ref(15);

watch(activeTab, (tab) => {
  if (tab === 'unconfigured') unconfiguredPage.value = 1;
});

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

const unconfiguredModelsPage = computed<Model[]>(() => {
  const start = (unconfiguredPage.value - 1) * unconfiguredPageSize.value;
  return unconfiguredModels.value.slice(start, start + unconfiguredPageSize.value);
});

watch(
  () => unconfiguredModels.value.length,
  (n) => {
    const maxPage = Math.max(1, Math.ceil(n / unconfiguredPageSize.value));
    if (unconfiguredPage.value > maxPage) unconfiguredPage.value = maxPage;
  },
);

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
    <PageHeader title="模型定价" />

    <el-tabs v-model="activeTab" class="pricing-tabs">
      <el-tab-pane name="priced">
        <template #label>
          <span class="tab-label">
            模型定价
            <el-tag v-if="total > 0" size="small" type="info" effect="plain" round>
              {{ total }}
            </el-tag>
          </span>
        </template>

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
                <span v-if="Object.keys(row.tierMultipliers).length === 0" class="cell-muted">
                  —
                </span>
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
              description="尚未为任何模型设置定价；切换到「未配置」可批量补齐。"
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
      </el-tab-pane>

      <el-tab-pane name="unconfigured">
        <template #label>
          <span class="tab-label">
            未配置
            <el-tag
              v-if="unconfiguredModels.length > 0"
              size="small"
              type="danger"
              effect="plain"
              round
            >
              {{ unconfiguredModels.length }}
            </el-tag>
          </span>
        </template>

        <el-table
          :data="unconfiguredModelsPage"
          row-key="modelId"
          size="small"
          class="compact-table unconfigured-table"
          @row-click="(row: Model) => openCreateFor(row)"
        >
          <el-table-column label="模型" min-width="280">
            <template #default="{ row }: { row: Model }">
              <div class="cell-model">
                <div class="cell-model__name">{{ row.displayName }}</div>
                <div class="cell-model__id">{{ row.modelId }}</div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="family" width="120">
            <template #default="{ row }: { row: Model }">
              <el-tag size="small" type="info" effect="plain">
                {{ ModelFamilyLabel[row.family] }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="140" align="right" fixed="right">
            <template #default="{ row }: { row: Model }">
              <el-button size="small" type="primary" plain @click.stop="openCreateFor(row)">
                设置定价
              </el-button>
            </template>
          </el-table-column>
          <template #empty>
            <EmptyState title="全部已配置" description="所有已启用模型都已设置定价。" />
          </template>
        </el-table>

        <div class="pagination-bar">
          <el-pagination
            v-model:current-page="unconfiguredPage"
            v-model:page-size="unconfiguredPageSize"
            :total="unconfiguredModels.length"
            :page-sizes="[15, 30, 50, 100]"
            layout="total, sizes, prev, pager, next"
            background
          />
        </div>
      </el-tab-pane>
    </el-tabs>

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
.pricing-tabs :deep(.el-tabs__header) {
  margin-bottom: 14px;
}
.pricing-tabs :deep(.el-tabs__nav-wrap)::after {
  height: 1px;
}
.tab-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.unconfigured-table :deep(.el-table__row) {
  cursor: pointer;
}
.cell-muted {
  color: var(--el-text-color-secondary);
}
</style>
