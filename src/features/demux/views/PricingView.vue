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
import { usePagination } from '@/shared/composables/usePagination';

import {
  ModelFamilyLabel,
  ProviderGroupLabel,
  billingTypeValues,
  BillingTypeLabel,
  type BillingType,
} from '@demux/common';
import type { Pricing, UpsertPricingInput, VendorModelGroup } from '@demux/common';
import type { Model } from '@demux/common';
import type { UnconfiguredAlias, VendorPricingStatsMap } from '@demux/common';
import type { ProviderGroup } from '../model/catalog.types';
import { getDemuxCatalogPort, getDemuxPricingPort } from '../services';
import ProviderWorkspaceLayout from '../components/provider/ProviderWorkspaceLayout.vue';
import ProviderGroupSidebar from '../components/provider/ProviderGroupSidebar.vue';
import ProviderDetailPanel from '../components/provider/ProviderDetailPanel.vue';
import PricingEditDialog from '../components/PricingEditDialog.vue';

const pricingPort = getDemuxPricingPort();
const catalogPort = getDemuxCatalogPort();

const groups = ref<ProviderGroup[]>([]);
const groupsLoading = ref(false);
const selectedVendor = ref<string>('');

const pricedGroups = ref<VendorModelGroup[]>([]);
const pricedGroupsLoading = ref(false);
const vendorPricingCounts = ref<VendorPricingStatsMap>({});
const unconfiguredItems = ref<UnconfiguredAlias[]>([]);
const unconfiguredLoading = ref(false);

const pricedPagination = usePagination({ pageSize: 20, pageSizes: [10, 20, 50, 100] });
const unconfiguredPagination = usePagination({ pageSize: 15, pageSizes: [10, 15, 30, 50] });

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

const selectedGroup = computed(() => {
  return groups.value.find((g) => g.queueGroup === selectedVendor.value) ?? null;
});

const vendorTitle = computed(() => {
  const g = selectedGroup.value;
  if (!g) return '—';
  const slug = g.vendorSlug?.trim();
  if (slug) return slug;
  return ProviderGroupLabel[g.queueGroup] ?? g.queueGroup;
});

function ensureVendorSelected(): void {
  if (groups.value.length === 0) return;
  if (groups.value.some((g) => g.queueGroup === selectedVendor.value)) return;
  selectedVendor.value = groups.value[0]!.queueGroup;
}

const selectedVendorUnconfiguredCount = computed(
  () => vendorPricingCounts.value[selectedVendor.value]?.unconfigured ?? 0,
);

function groupRowKey(row: VendorModelGroup): string {
  return `${row.vendorKey}|${row.vendorModel}`;
}

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

const pagedUnconfigured = computed<Model[]>(() =>
  unconfiguredItems.value.map((row) => modelFromAlias(row.alias)),
);

async function loadGroups(): Promise<void> {
  groupsLoading.value = true;
  try {
    const r = await catalogPort.listProviderGroups();
    if (r.success) {
      groups.value = r.data;
      ensureVendorSelected();
    } else ElMessage.error(r.error.message);
  } finally {
    groupsLoading.value = false;
  }
}

async function loadVendorPricingStats(): Promise<void> {
  const r = await pricingPort.vendorPricingStats();
  if (r.success) vendorPricingCounts.value = r.data;
  else ElMessage.error(r.error.message);
}

async function loadUnconfiguredAliases(): Promise<void> {
  if (!selectedVendor.value) return;
  unconfiguredLoading.value = true;
  try {
    const r = await pricingPort.listUnconfiguredAliases({
      page: unconfiguredPagination.state.page,
      pageSize: unconfiguredPagination.state.pageSize,
      vendorKey: selectedVendor.value,
    });
    if (r.success) {
      unconfiguredItems.value = r.data.items;
      unconfiguredPagination.setTotal(r.data.total);
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    unconfiguredLoading.value = false;
  }
}

async function loadPricedGroups(): Promise<void> {
  if (!selectedVendor.value) return;
  pricedGroupsLoading.value = true;
  try {
    const r = await pricingPort.listVendorModelGroups({
      page: pricedPagination.state.page,
      pageSize: pricedPagination.state.pageSize,
      filter: {
        vendorKey: selectedVendor.value,
        keyword: filter.value.keyword,
        billingType: filter.value.billingType,
      },
    });
    if (r.success) {
      pricedGroups.value = r.data.groups;
      pricedPagination.setTotal(r.data.total);
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    pricedGroupsLoading.value = false;
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
      await Promise.all([loadPricedGroups(), loadVendorPricingStats()]);
      if (activeTab.value === 'unconfigured') await loadUnconfiguredAliases();
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
  const r = await pricingPort.delete(String(row.id));
  if (r.success) {
    ElMessage.success('已删除');
    await Promise.all([loadPricedGroups(), loadVendorPricingStats()]);
    if (activeTab.value === 'unconfigured') await loadUnconfiguredAliases();
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

function vendorLabelForKey(vendorKey: string): string {
  if (!vendorKey) return '—';
  return ProviderGroupLabel[vendorKey] ?? vendorKey;
}

watch(
  () => [filter.value.keyword, filter.value.billingType, selectedVendor.value] as const,
  () => {
    pricedPagination.setPage(1);
    unconfiguredPagination.setPage(1);
  },
);

watch(
  () =>
    [
      pricedPagination.state.page,
      pricedPagination.state.pageSize,
      filter.value.keyword,
      filter.value.billingType,
      selectedVendor.value,
    ] as const,
  () => {
    void loadPricedGroups();
  },
);

watch(selectedVendor, () => {
  activeTab.value = 'priced';
});

watch(
  () =>
    [
      unconfiguredPagination.state.page,
      unconfiguredPagination.state.pageSize,
      selectedVendor.value,
      activeTab.value,
    ] as const,
  () => {
    if (activeTab.value === 'unconfigured') void loadUnconfiguredAliases();
  },
);

watch(activeTab, (tab) => {
  if (tab === 'unconfigured') {
    unconfiguredPagination.setPage(1);
  }
});

onMounted(async () => {
  await loadGroups();
  await loadVendorPricingStats();
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
      v-model="selectedVendor"
      :groups="groups"
      :loading="groupsLoading"
      :counts="vendorPricingCounts"
      search-placeholder="搜索渠道 / QueueGroup"
      empty-description="请先在「供应商组」页从网关同步 Provider。"
    />

    <ProviderDetailPanel>
      <template #header>
        <div class="detail-header__main">
          <h2 class="provider-detail__title">{{ vendorTitle }}</h2>
          <p v-if="selectedGroup" class="provider-detail__sub">{{ selectedGroup.queueGroup }}</p>
          <div class="provider-detail__stats">
            <span>已定价 {{ pricedPagination.state.total }} 个模型</span>
            <span>未配置 {{ selectedVendorUnconfiguredCount }} 个</span>
          </div>
        </div>
      </template>

      <template #toolbar>
        <el-tabs v-model="activeTab" class="pricing-tabs">
          <el-tab-pane name="priced">
            <template #label>
              <span class="tab-label">
                已配置
                <el-tag
                  v-if="pricedPagination.state.total > 0"
                  size="small"
                  type="info"
                  effect="plain"
                  round
                >
                  {{ pricedPagination.state.total }}
                </el-tag>
              </span>
            </template>
          </el-tab-pane>
          <el-tab-pane name="unconfigured">
            <template #label>
              <span class="tab-label">
                未配置
                <el-tag
                  v-if="selectedVendorUnconfiguredCount > 0"
                  size="small"
                  type="danger"
                  effect="plain"
                  round
                >
                  {{ selectedVendorUnconfiguredCount }}
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
              placeholder="别名 / 原始模型名"
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
          v-loading="pricedGroupsLoading"
          :data="pricedGroups"
          :row-key="groupRowKey"
          size="small"
          class="compact-table"
          height="100%"
          :empty-text="' '"
        >
          <el-table-column type="expand">
            <template #default="{ row }: { row: VendorModelGroup }">
              <el-table
                :data="row.aliases"
                row-key="alias"
                size="small"
                class="inner-table"
              >
                <el-table-column label="对外别名" min-width="200">
                  <template #default="{ row: aliasRow }">
                    <div class="cell-model">
                      <div class="cell-model__name">{{ aliasRow.alias }}</div>
                    </div>
                  </template>
                </el-table-column>
                <el-table-column label="计费类型" width="120">
                  <template #default="{ row: aliasRow }">
                    <el-tag size="small" type="primary" effect="plain" round>
                      {{ BillingTypeLabel[aliasRow.pricing.billingType as BillingType] }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="基础单价" min-width="280">
                  <template #default="{ row: aliasRow }">
                    <span class="cell-price">{{ priceSummary(aliasRow.pricing) }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="LV 倍率" min-width="180">
                  <template #default="{ row: aliasRow }">
                    <div class="tier-badges">
                      <el-tag
                        v-for="[lv, mult] in Object.entries(aliasRow.pricing.tierMultipliers)"
                        :key="lv"
                        size="small"
                        effect="plain"
                        :type="Number(mult) < 1 ? 'success' : 'warning'"
                      >
                        {{ tierBadgeLabel(Number(lv), Number(mult)) }}
                      </el-tag>
                      <span
                        v-if="Object.keys(aliasRow.pricing.tierMultipliers).length === 0"
                        class="cell-muted"
                      >
                        —
                      </span>
                    </div>
                  </template>
                </el-table-column>
                <el-table-column label="生效" width="150">
                  <template #default="{ row: aliasRow }">
                    <span class="cell-date">{{
                      formatDateTime(aliasRow.pricing.effectiveFromUtc)
                    }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="140" align="right">
                  <template #default="{ row: aliasRow }">
                    <el-button :icon="Edit" link type="primary" @click="openEdit(aliasRow.pricing)">
                      编辑
                    </el-button>
                    <el-button
                      :icon="Delete"
                      link
                      type="danger"
                      @click="onDelete(aliasRow.pricing)"
                    >
                      删除
                    </el-button>
                  </template>
                </el-table-column>
              </el-table>
            </template>
          </el-table-column>
          <el-table-column label="原始模型名" min-width="240">
            <template #default="{ row }: { row: VendorModelGroup }">
              <div class="cell-model">
                <div class="cell-model__name">{{ row.vendorModel }}</div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="渠道" width="120">
            <template #default="{ row }: { row: VendorModelGroup }">
              <el-tag size="small" effect="plain">{{ vendorLabelForKey(row.vendorKey) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="别名数" width="100">
            <template #default="{ row }: { row: VendorModelGroup }">
              {{ row.aliases.length }} 个
            </template>
          </el-table-column>
          <template #empty>
            <EmptyState
              title="暂无定价"
              description="该渠道下尚无已定价别名；可切换「未配置」或先在供应商组创建别名。"
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
          v-loading="unconfiguredLoading"
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
.inner-table {
  margin: 4px 0 4px 48px;
  width: calc(100% - 48px);
}
.inner-table :deep(.el-table__header th) {
  background: var(--el-fill-color-light);
}
.inner-table :deep(.el-table__body tr:last-child td) {
  border-bottom: none;
}
</style>
