<script setup lang="ts">
/**
 * 模型定价：左侧渠道，右侧每条别名的有效价。
 *
 * 别名要么走渠道定价（美元 × 渠道倍率 = 人民币），要么自定义按量 / 按次等。
 */
import { computed, onMounted, ref, watch } from 'vue';

import { Delete, Edit } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

import PageHeader from '@/shared/ui/PageHeader.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import { formatDateTime } from '@/shared/lib/date';
import { confirmDanger } from '@/shared/composables/useConfirm';
import { usePagination } from '@/shared/composables/usePagination';

import { ProviderGroupLabel } from '@demux/common';
import type { Rate, RouteRateEntry, VendorModelGroup } from '@demux/common';
import type { UnconfiguredRoute, VendorRateStatsMap } from '@demux/common';
import type { ProviderGroup } from '../model/catalog.types';
import { formatMultiplier } from '../model/rateSummary';
import { isEmbeddingPrice, rateBodyDisplay, type PriceDisplay } from '../model/priceTable';
import { getDemuxCatalogPort, getDemuxRatePort } from '../services';
import ProviderWorkspaceLayout from '../components/provider/ProviderWorkspaceLayout.vue';
import ProviderGroupSidebar from '../components/provider/ProviderGroupSidebar.vue';
import ProviderDetailPanel from '../components/provider/ProviderDetailPanel.vue';
import AliasMap from '../components/AliasMap.vue';
import PriceCells from '../components/pricing/PriceCells.vue';
import RouteRateDrawer, { type RouteRateTarget } from '../components/RouteRateDrawer.vue';
import ProviderGroupEditDrawer from '../components/provider/ProviderGroupEditDrawer.vue';

const catalogPort = getDemuxCatalogPort();
const ratePort = getDemuxRatePort();

const groups = ref<ProviderGroup[]>([]);
const groupsLoading = ref(false);
const selectedVendor = ref<string>('');

const pricedGroups = ref<VendorModelGroup[]>([]);
const pricedGroupsLoading = ref(false);
const vendorRateCounts = ref<VendorRateStatsMap>({});
const unconfiguredItems = ref<UnconfiguredRoute[]>([]);
const unconfiguredLoading = ref(false);

const pricedPagination = usePagination({ pageSize: 20, pageSizes: [10, 20, 50, 100] });
const unconfiguredPagination = usePagination({ pageSize: 15, pageSizes: [10, 15, 30, 50] });

const routeRateOpen = ref(false);
const routeRateTarget = ref<RouteRateTarget | null>(null);

const vendorMultiplierOpen = ref(false);

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
  () => vendorRateCounts.value[selectedVendor.value]?.unconfigured ?? 0,
);

interface PricedRow {
  vendorKey: string;
  vendorModel: string;
  entry: RouteRateEntry;
  display: Omit<PriceDisplay, 'price'>;
}

const pricedRows = computed<PricedRow[]>(() =>
  pricedGroups.value.flatMap((group) =>
    group.routeKeys.map((entry) => ({
      vendorKey: group.vendorKey,
      vendorModel: group.vendorModel,
      entry,
      display: rateBodyDisplay(
        entry.rate,
        isEmbeddingPrice({ modelKey: group.vendorModel, capabilities: null }),
        entry.rate.currency,
      ),
    })),
  ),
);

function pricedRowKey(row: PricedRow): string {
  return `${row.vendorKey}|${row.entry.routeKey}`;
}

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

async function loadVendorRateStats(): Promise<void> {
  const r = await ratePort.vendorRateStats();
  if (r.success) vendorRateCounts.value = r.data;
  else ElMessage.error(r.error.message);
}

async function loadUnconfiguredRoutes(): Promise<void> {
  if (!selectedVendor.value) return;
  unconfiguredLoading.value = true;
  try {
    const r = await ratePort.listUnconfiguredRoutes({
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
    const r = await ratePort.listVendorModelGroups({
      page: pricedPagination.state.page,
      pageSize: pricedPagination.state.pageSize,
      filter: {
        vendorKey: selectedVendor.value,
        keyword: '',
        billingType: 'all',
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

function openRouteRate(row: PricedRow): void {
  routeRateTarget.value = {
    routeId: row.entry.routeId,
    routeKey: row.entry.routeKey,
    vendorModel: row.vendorModel,
    pricingMode: row.entry.pricingMode,
    rate: row.entry.rate,
  };
  routeRateOpen.value = true;
}

function openUnconfigured(row: UnconfiguredRoute): void {
  routeRateTarget.value = {
    routeId: row.routeId,
    routeKey: row.routeKey,
    vendorModel: row.vendorModel,
    pricingMode: 'compiled',
    rate: null,
  };
  routeRateOpen.value = true;
}

async function reloadAll(): Promise<void> {
  await Promise.all([loadPricedGroups(), loadVendorRateStats(), loadGroups()]);
  if (activeTab.value === 'unconfigured') await loadUnconfiguredRoutes();
}

async function onRouteRateSaved(): Promise<void> {
  await reloadAll();
}

async function onVendorMultiplierSaved(): Promise<void> {
  await reloadAll();
}

async function onDelete(row: Rate): Promise<void> {
  const okp = await confirmDanger({
    title: '删除定价',
    message: `确认删除 "${row.modelId}" 的定价？`,
    confirmText: '确认删除',
    type: 'warning',
  });
  if (!okp) return;
  const r = await ratePort.delete(String(row.id));
  if (r.success) {
    ElMessage.success('已删除');
    await reloadAll();
  } else {
    ElMessage.error(r.error.message);
  }
}

watch(selectedVendor, () => {
  activeTab.value = 'priced';
  pricedPagination.setPage(1);
  unconfiguredPagination.setPage(1);
});

watch(
  () =>
    [pricedPagination.state.page, pricedPagination.state.pageSize, selectedVendor.value] as const,
  () => {
    void loadPricedGroups();
  },
);

watch(
  () =>
    [
      unconfiguredPagination.state.page,
      unconfiguredPagination.state.pageSize,
      selectedVendor.value,
      activeTab.value,
    ] as const,
  () => {
    if (activeTab.value === 'unconfigured') void loadUnconfiguredRoutes();
  },
);

watch(activeTab, (tab) => {
  if (tab === 'unconfigured') {
    unconfiguredPagination.setPage(1);
  }
});

onMounted(async () => {
  await loadGroups();
  await loadVendorRateStats();
});
</script>

<template>
  <ProviderWorkspaceLayout :loading="groupsLoading && groups.length === 0">
    <template #header>
      <PageHeader title="模型定价" />
    </template>

    <ProviderGroupSidebar
      v-model="selectedVendor"
      :groups="groups"
      :loading="groupsLoading"
      :counts="vendorRateCounts"
      search-placeholder="搜索渠道 / QueueGroup"
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
        <button
          v-if="selectedGroup"
          type="button"
          class="mult"
          @click="vendorMultiplierOpen = true"
        >
          <span class="mult__v">{{ formatMultiplier(selectedGroup.priceMultiplier) }}</span>
          <span class="mult__k">渠道倍率</span>
        </button>
      </template>

      <template #toolbar>
        <el-tabs v-model="activeTab" class="rate-tabs">
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
      </template>

      <div v-show="activeTab === 'priced'" v-loading="pricedGroupsLoading" class="provider-detail__table-wrap">
        <div class="rate-list">
          <div v-if="pricedRows.length > 0" class="rate-row rate-row--head">
            <span>别名</span>
            <span>价格</span>
            <span>日期</span>
            <span class="rate-row__ops-h">操作</span>
          </div>
          <article
            v-for="row in pricedRows"
            :key="pricedRowKey(row)"
            class="rate-row"
            @click="openRouteRate(row)"
          >
            <AliasMap class="rate-row__alias" :alias="row.entry.routeKey" :target="row.vendorModel" />
            <div class="rate-row__price">
              <PriceCells :model="row.display" />
            </div>
            <div class="rate-row__date">{{ formatDateTime(row.entry.rate.effectiveFromUtc) }}</div>
            <div class="rate-row__ops">
              <el-button :icon="Edit" link type="primary" @click.stop="openRouteRate(row)">
                定价
              </el-button>
              <el-button :icon="Delete" link type="danger" @click.stop="onDelete(row.entry.rate)">
                删除
              </el-button>
            </div>
          </article>
          <EmptyState
            v-if="pricedRows.length === 0 && !pricedGroupsLoading"
            class="rate-list__empty"
            title="暂无定价"
          />
        </div>
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

      <div
        v-show="activeTab === 'unconfigured'"
        v-loading="unconfiguredLoading"
        class="provider-detail__table-wrap"
      >
        <div class="rate-list rate-list--open">
          <div v-if="unconfiguredItems.length > 0" class="rate-row rate-row--head">
            <span>别名</span>
            <span class="rate-row__ops-h">操作</span>
          </div>
          <article
            v-for="row in unconfiguredItems"
            :key="row.routeKey"
            class="rate-row"
            @click="openUnconfigured(row)"
          >
            <AliasMap class="rate-row__alias" :alias="row.routeKey" :target="row.vendorModel" />
            <div class="rate-row__ops">
              <el-button size="small" type="primary" plain @click.stop="openUnconfigured(row)">
                定价
              </el-button>
            </div>
          </article>
          <EmptyState
            v-if="unconfiguredItems.length === 0 && !unconfiguredLoading"
            class="rate-list__empty"
            title="全部已配置"
          />
        </div>
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

    <RouteRateDrawer
      v-model="routeRateOpen"
      :target="routeRateTarget"
      :vendor-multiplier="selectedGroup?.priceMultiplier ?? 1"
      @saved="onRouteRateSaved"
    />

    <ProviderGroupEditDrawer
      v-model="vendorMultiplierOpen"
      :group="selectedGroup"
      @refresh="onVendorMultiplierSaved"
    />
  </ProviderWorkspaceLayout>
</template>

<style scoped>
.detail-header__main {
  flex: 1;
  min-width: 0;
}
:deep(.provider-detail__header) {
  align-items: center;
}
.rate-tabs {
  margin-bottom: 4px;
}
.rate-tabs :deep(.el-tabs__header) {
  margin-bottom: 0;
}
.rate-tabs :deep(.el-tabs__nav-wrap)::after {
  height: 1px;
}
.tab-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.rate-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: grid;
  grid-template-columns: minmax(160px, 1.1fr) minmax(220px, 1.5fr) 148px 140px;
  column-gap: 16px;
  align-content: start;
  padding: 0 4px 8px;
  height: 100%;
}
.rate-list--open {
  grid-template-columns: minmax(0, 1fr) 88px;
}
.rate-list__empty {
  grid-column: 1 / -1;
}
.rate-row {
  display: grid;
  grid-template-columns: subgrid;
  grid-column: 1 / -1;
  align-items: center;
  padding: 11px 8px;
  border-bottom: 1px solid var(--el-border-color-extra-light);
}
.rate-row:not(.rate-row--head) {
  cursor: pointer;
}
.rate-row:not(.rate-row--head):hover {
  background: var(--el-fill-color-light);
}
.rate-row--head {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 0 8px 7px;
  background: var(--el-bg-color);
  border-bottom-color: var(--el-border-color-lighter);
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.rate-row__alias {
  min-width: 0;
}
.rate-row__price {
  min-width: 0;
}
.rate-row__date {
  font-variant-numeric: tabular-nums;
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}
.rate-row__ops {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  flex-wrap: nowrap;
  white-space: nowrap;
}
.rate-row__ops-h {
  text-align: right;
}
.mult {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  line-height: 1;
}
.mult__v {
  font-size: 22px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.04em;
  color: var(--el-text-color-primary);
}
.mult:hover .mult__v {
  color: var(--el-color-primary);
}
.mult__k {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
