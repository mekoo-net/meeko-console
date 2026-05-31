<script setup lang="ts">
/**
 * 模型定价：左右分栏。左侧按供应商组（QueueGroup）筛选，右侧管理该渠道下别名定价。
 */
import { computed, onMounted, ref, watch } from 'vue';

import { Delete, Edit, RefreshLeft, Search } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

import PageHeader from '@/shared/ui/PageHeader.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import { formatDateTime } from '@/shared/lib/date';
import { formatMoney } from '@/shared/lib/money';
import { confirmDanger } from '@/shared/composables/useConfirm';
import { clientPaginate, usePagination } from '@/shared/composables/usePagination';

import {
  ModelFamilyLabel,
  ProviderGroupLabel,
  billingTypeValues,
  BillingTypeLabel,
  type BillingType,
} from '../model/enums';
import type { ListPricingFilter, Pricing, UpsertPricingInput } from '../model/pricing.types';
import type { Model } from '../model/model.types';
import type { ModelRoute } from '../model/modelRoute.types';
import type { ProviderGroup } from '../model/catalog.types';
import {
  getDemuxaiCatalogPort,
  getDemuxaiModelRoutePort,
  getDemuxaiPricingPort,
} from '../services';
import ProviderWorkspaceLayout from '../components/provider/ProviderWorkspaceLayout.vue';
import ProviderGroupSidebar from '../components/provider/ProviderGroupSidebar.vue';
import ProviderDetailPanel from '../components/provider/ProviderDetailPanel.vue';
import PricingEditDialog from '../components/PricingEditDialog.vue';

const pricingPort = getDemuxaiPricingPort();
const modelRoutePort = getDemuxaiModelRoutePort();
const catalogPort = getDemuxaiCatalogPort();

const groups = ref<ProviderGroup[]>([]);
const groupsLoading = ref(false);
const selectedChannel = ref<string>('all');

const allPricing = ref<Pricing[]>([]);
const pricingLoading = ref(false);

const modelRoutes = ref<ModelRoute[]>([]);

const pricedPagination = usePagination({ initialPageSize: 20, pageSizes: [10, 20, 50, 100] });
const unconfiguredPagination = usePagination({ initialPageSize: 15, pageSizes: [10, 15, 30, 50] });

interface PageFilter {
  keyword: string;
  billingType: BillingType | 'all';
}

const defaultFilter = (): PageFilter => ({
  keyword: '',
  billingType: 'all',
});

const filter = ref<PageFilter>(defaultFilter());

const dialogOpen = ref(false);
const dialogLoading = ref(false);
const editingPricing = ref<Pricing | null>(null);
const editingModel = ref<Model | null>(null);

type TabName = 'priced' | 'unconfigured';
const activeTab = ref<TabName>('priced');

/** alias → channelKey（启用路由） */
const aliasChannelMap = computed(() => {
  const m = new Map<string, string>();
  for (const r of modelRoutes.value) {
    if (r.status === 'enabled') m.set(r.alias, r.channelKey);
  }
  return m;
});

/** 已启用路由的对外别名；定价主键应对齐 alias，排除遗留上游 modelName 行 */
const knownAliasSet = computed(() => {
  const s = new Set<string>();
  for (const r of modelRoutes.value) {
    if (r.status === 'enabled') s.add(r.alias);
  }
  return s;
});

function isBillableAlias(modelId: string): boolean {
  return knownAliasSet.value.has(modelId);
}

const selectedGroup = computed(() => {
  if (selectedChannel.value === 'all') return null;
  return groups.value.find((g) => g.queueGroup === selectedChannel.value) ?? null;
});

const channelTitle = computed(() => {
  if (selectedChannel.value === 'all') return '全部渠道';
  const g = selectedGroup.value;
  if (!g) return selectedChannel.value;
  return ProviderGroupLabel[g.queueGroup] ?? g.displayName;
});

function matchesChannel(modelId: string): boolean {
  if (selectedChannel.value === 'all') return true;
  const ch = aliasChannelMap.value.get(modelId);
  if (ch) return ch === selectedChannel.value;
  return false;
}

function applyListFilter(rows: Pricing[]): Pricing[] {
  const kw = filter.value.keyword.trim().toLowerCase();
  const bt = filter.value.billingType;
  return rows.filter((p) => {
    if (!isBillableAlias(p.modelId)) return false;
    if (!matchesChannel(p.modelId)) return false;
    if (bt !== 'all' && p.billingType !== bt) return false;
    if (kw && !p.modelId.toLowerCase().includes(kw)) return false;
    return true;
  });
}

const filteredPriced = computed(() => applyListFilter(allPricing.value));

const pagedPriced = computed(() =>
  clientPaginate(
    filteredPriced.value,
    pricedPagination.state.page,
    pricedPagination.state.pageSize,
  ),
);

watch(
  filteredPriced,
  (list) => {
    pricedPagination.setTotal(list.length);
  },
  { immediate: true },
);

function modelFromAlias(alias: string): Model {
  const t = Date.now();
  return {
    uid: alias,
    modelId: alias,
    displayName: alias,
    family: 'other',
    capabilities: ['chat'],
    visibleMinTier: 1,
    maxContextTokens: 128_000,
    maxOutputTokens: null,
    supportsStreaming: true,
    supportsFunctionCall: false,
    description: null,
    createdAtUtc: t,
    updatedAtUtc: t,
  };
}

/** 仅：已启用别名且尚未定价；上游模型无 alias 不可定价，不出现在此列表 */
const unconfiguredModels = computed<Model[]>(() => {
  const configured = new Set(
    allPricing.value.filter((p) => isBillableAlias(p.modelId)).map((r) => r.modelId),
  );
  const seen = new Set<string>();
  const out: Model[] = [];
  for (const route of modelRoutes.value) {
    if (route.status !== 'enabled') continue;
    if (selectedChannel.value !== 'all' && route.channelKey !== selectedChannel.value) {
      continue;
    }
    if (configured.has(route.alias) || seen.has(route.alias)) continue;
    seen.add(route.alias);
    out.push(modelFromAlias(route.alias));
  }
  return out;
});

const pagedUnconfigured = computed(() =>
  clientPaginate(
    unconfiguredModels.value,
    unconfiguredPagination.state.page,
    unconfiguredPagination.state.pageSize,
  ),
);

watch(
  unconfiguredModels,
  (list) => {
    unconfiguredPagination.setTotal(list.length);
  },
  { immediate: true },
);

async function loadGroups(): Promise<void> {
  groupsLoading.value = true;
  try {
    const r = await catalogPort.listProviderGroups();
    if (r.success) groups.value = r.data;
    else ElMessage.error(r.error.message);
  } finally {
    groupsLoading.value = false;
  }
}

async function loadModelRoutes(): Promise<void> {
  const routesR = await modelRoutePort.list({
    page: 1,
    pageSize: 500,
    filter: { keyword: '', channelKey: 'all', status: 'enabled' },
  });
  if (routesR.success) modelRoutes.value = routesR.data.items;
}

async function fetchAllPricing(): Promise<void> {
  pricingLoading.value = true;
  try {
    const portFilter: ListPricingFilter = {
      keyword: '',
      billingType: 'all',
    };
    const r = await pricingPort.list({
      page: 1,
      pageSize: 500,
      filter: portFilter,
    });
    if (r.success) {
      allPricing.value = r.data.items;
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    pricingLoading.value = false;
  }
}

function resetFilter(): void {
  filter.value = defaultFilter();
  pricedPagination.setPage(1);
}

function openEdit(p: Pricing): void {
  editingPricing.value = p;
  editingModel.value = modelFromAlias(p.modelId);
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
      await fetchAllPricing();
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
    message: `确认删除 "${row.modelId}" 的定价？`,
    confirmText: '确认删除',
    type: 'warning',
  });
  if (!okp) return;
  const r = await pricingPort.delete(row.modelId);
  if (r.success) {
    ElMessage.success('已删除');
    await fetchAllPricing();
  } else {
    ElMessage.error(r.error.message);
  }
}

function priceSummary(row: Pricing): string {
  switch (row.billingType) {
    case 'per_token': {
      const p = row.pricing;
      const extras: string[] = [];
      if (p.input.cachedRead != null) {
        extras.push(`cR ${formatMoney(p.input.cachedRead, { fractionDigits: 2 })}`);
      }
      if (p.input.cachedWrite != null) {
        extras.push(`cW ${formatMoney(p.input.cachedWrite, { fractionDigits: 2 })}`);
      }
      if (p.output.reasoning != null) {
        extras.push(`reason ${formatMoney(p.output.reasoning, { fractionDigits: 2 })}`);
      }
      if (p.input.audio != null || p.output.audio != null) {
        const ai = p.input.audio ?? 0;
        const ao = p.output.audio ?? 0;
        extras.push(
          `audio ${formatMoney(ai, { fractionDigits: 2 })}/${formatMoney(ao, { fractionDigits: 2 })}`,
        );
      }
      const main = `${formatMoney(p.input.perMToken, { fractionDigits: 2 })} 入 / ${formatMoney(
        p.output.perMToken,
        { fractionDigits: 2 },
      )} 出 · per 1M`;
      return extras.length ? `${main} · ${extras.join(' · ')}` : main;
    }
    case 'per_call': {
      const p = row.pricing;
      const cached =
        p.cachedPricePerCall != null
          ? ` · cached ${formatMoney(p.cachedPricePerCall, { fractionDigits: 4 })}`
          : '';
      return `${formatMoney(p.pricePerCall, { fractionDigits: 4 })} / 次${cached}`;
    }
    case 'per_image': {
      const prices = row.pricing.tiers.map((t) => t.pricePerImage);
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      const range =
        min === max
          ? formatMoney(min, { fractionDigits: 4 })
          : `${formatMoney(min, { fractionDigits: 4 }) }-${formatMoney(max, { fractionDigits: 4 })}`;
      return `${row.pricing.tiers.length} 档 / ${range} / 张`;
    }
    case 'per_video': {
      const prices = row.pricing.tiers.map((t) => t.pricePerSecond);
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      const range =
        min === max
          ? formatMoney(min, { fractionDigits: 4 })
          : `${formatMoney(min, { fractionDigits: 4 }) }-${formatMoney(max, { fractionDigits: 4 })}`;
      return `${row.pricing.tiers.length} 档 / ${range} / 秒`;
    }
    case 'per_audio_minute':
      return `${formatMoney(row.pricing.pricePerMinute, { fractionDigits: 4 })} / 分钟`;
    case 'per_character':
      return `${formatMoney(row.pricing.pricePerKChar, { fractionDigits: 4 })} / 1K 字符`;
  }
}

function tierBadgeLabel(level: number, mult: number): string {
  return `Lv${level} × ${mult}`;
}

function channelLabelFor(modelId: string): string {
  const key = aliasChannelMap.value.get(modelId);
  if (!key) return '—';
  return ProviderGroupLabel[key] ?? key;
}

watch(
  () => [filter.value.keyword, filter.value.billingType, selectedChannel.value] as const,
  () => {
    pricedPagination.setPage(1);
    unconfiguredPagination.setPage(1);
  },
);

watch(selectedChannel, () => {
  activeTab.value = 'priced';
});

watch(activeTab, (tab) => {
  if (tab === 'unconfigured') unconfiguredPagination.setPage(1);
});

onMounted(async () => {
  await Promise.all([loadGroups(), loadModelRoutes(), fetchAllPricing()]);
});
</script>

<template>
  <ProviderWorkspaceLayout :loading="groupsLoading && groups.length === 0">
    <template #header>
      <PageHeader
        title="模型定价"
        description="仅对已配置对外别名（模型路由 alias）定价。左侧按 QueueGroup 筛选；未配置列表只展示「有 alias、尚未定价」的条目，上游模型需先在供应商组建别名。"
      />
    </template>

    <ProviderGroupSidebar
      v-model="selectedChannel"
      :groups="groups"
      :loading="groupsLoading"
      show-all-option
      all-label="全部渠道"
      search-placeholder="搜索渠道 / QueueGroup"
      empty-description="请先在「供应商组」页从网关同步 Provider。"
    />

    <ProviderDetailPanel>
      <template #header>
        <div class="detail-header__main">
          <h2 class="provider-detail__title">{{ channelTitle }}</h2>
          <p v-if="selectedGroup" class="provider-detail__sub">{{ selectedGroup.queueGroup }}</p>
          <p v-else class="provider-detail__sub">汇总所有 QueueGroup 下已启用别名的定价</p>
          <div class="provider-detail__stats">
            <span>已定价 {{ filteredPriced.length }} 个别名</span>
            <span>未配置 {{ unconfiguredModels.length }} 个</span>
          </div>
        </div>
      </template>

      <template #toolbar>
        <el-tabs v-model="activeTab" class="pricing-tabs">
          <el-tab-pane name="priced">
            <template #label>
              <span class="tab-label">
                已配置
                <el-tag v-if="filteredPriced.length > 0" size="small" type="info" effect="plain" round>
                  {{ filteredPriced.length }}
                </el-tag>
              </span>
            </template>
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
          </el-tab-pane>
        </el-tabs>

        <el-form v-if="activeTab === 'priced'" inline class="filter-form" @submit.prevent>
          <el-form-item label="搜索">
            <el-input
              v-model="filter.keyword"
              :prefix-icon="Search"
              placeholder="对外别名 modelId"
              style="width: 220px"
              clearable
            />
          </el-form-item>
          <el-form-item label="计费类型">
            <el-select v-model="filter.billingType" style="width: 160px">
              <el-option label="全部" value="all" />
              <el-option
                v-for="m in billingTypeValues"
                :key="m"
                :label="BillingTypeLabel[m]"
                :value="m"
              />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button :icon="RefreshLeft" @click="resetFilter">重置</el-button>
          </el-form-item>
        </el-form>
      </template>

      <div v-show="activeTab === 'priced'" class="provider-detail__table-wrap">
        <el-table
          v-loading="pricingLoading"
          :data="pagedPriced"
          row-key="modelId"
          size="small"
          class="compact-table"
          height="100%"
          :empty-text="' '"
        >
          <el-table-column label="对外别名" min-width="200">
            <template #default="{ row }: { row: Pricing }">
              <div class="cell-model">
                <div class="cell-model__name">
                  {{ row.modelId }}
                </div>
                <div class="cell-model__id">{{ row.modelId }}</div>
              </div>
            </template>
          </el-table-column>
          <el-table-column v-if="selectedChannel === 'all'" label="渠道" width="110">
            <template #default="{ row }: { row: Pricing }">
              <el-tag size="small" effect="plain">{{ channelLabelFor(row.modelId) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="计费类型" width="120">
            <template #default="{ row }: { row: Pricing }">
              <el-tag size="small" type="primary" effect="plain" round>
                {{ BillingTypeLabel[row.billingType] }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="基础单价" min-width="280">
            <template #default="{ row }: { row: Pricing }">
              <span class="cell-price">{{ priceSummary(row) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="倍率" width="88" align="center">
            <template #default="{ row }: { row: Pricing }">
              <span class="num">× {{ row.multiplier }}</span>
            </template>
          </el-table-column>
          <el-table-column label="LV 倍率" min-width="180">
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
          <el-table-column label="生效" width="150">
            <template #default="{ row }: { row: Pricing }">
              <span class="cell-date">{{ formatDateTime(row.effectiveFromUtc) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="140" align="right" fixed="right">
            <template #default="{ row }: { row: Pricing }">
              <el-button :icon="Edit" link type="primary" @click="openEdit(row)">编辑</el-button>
              <el-button :icon="Delete" link type="danger" @click="onDelete(row)">删除</el-button>
            </template>
          </el-table-column>
          <template #empty>
            <EmptyState
              title="暂无定价"
              :description="
                selectedChannel === 'all'
                  ? '切换到「未配置」为别名补齐定价。'
                  : '该渠道下尚无已定价别名；可切换「未配置」或先在供应商组创建别名。'
              "
            />
          </template>
        </el-table>
      </div>

      <div v-show="activeTab === 'priced'" class="provider-pagination">
        <el-pagination
          v-model:current-page="pricedPagination.state.page"
          v-model:page-size="pricedPagination.state.pageSize"
          :total="pricedPagination.state.total"
          :page-sizes="pricedPagination.pageSizes"
          layout="total, sizes, prev, pager, next"
          background
        />
      </div>

      <div v-show="activeTab === 'unconfigured'" class="provider-detail__table-wrap">
        <el-table
          :data="pagedUnconfigured"
          row-key="modelId"
          size="small"
          class="compact-table unconfigured-table"
          height="100%"
          @row-click="(row: Model) => openCreateFor(row)"
        >
          <el-table-column label="对外别名" min-width="260">
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
          <el-table-column label="操作" width="120" align="right" fixed="right">
            <template #default="{ row }: { row: Model }">
              <el-button size="small" type="primary" plain @click.stop="openCreateFor(row)">
                设置定价
              </el-button>
            </template>
          </el-table-column>
          <template #empty>
            <EmptyState
              title="全部已配置"
              description="当前筛选范围内，所有启用别名均已设置定价。"
            />
          </template>
        </el-table>
      </div>

      <div v-show="activeTab === 'unconfigured'" class="provider-pagination">
        <el-pagination
          v-model:current-page="unconfiguredPagination.state.page"
          v-model:page-size="unconfiguredPagination.state.pageSize"
          :total="unconfiguredPagination.state.total"
          :page-sizes="unconfiguredPagination.pageSizes"
          layout="total, sizes, prev, pager, next"
          background
        />
      </div>
    </ProviderDetailPanel>

    <PricingEditDialog
      v-model="dialogOpen"
      :pricing="editingPricing"
      :model="editingModel"
      :loading="dialogLoading"
      @submit="onSubmit"
    />
  </ProviderWorkspaceLayout>
</template>

<style scoped>
.detail-header__main {
  flex: 1;
  min-width: 0;
}
.pricing-tabs {
  margin-bottom: 4px;
}
.pricing-tabs :deep(.el-tabs__header) {
  margin-bottom: 0;
}
.pricing-tabs :deep(.el-tabs__nav-wrap)::after {
  height: 1px;
}
.tab-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.filter-form {
  margin-top: 12px;
}
.cell-model__name {
  font-weight: 500;
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
.unconfigured-table :deep(.el-table__row) {
  cursor: pointer;
}
.cell-muted {
  color: var(--el-text-color-secondary);
}
.cell-date {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
