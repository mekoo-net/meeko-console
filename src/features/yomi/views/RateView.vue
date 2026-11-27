<script setup lang="ts">
/**
 * 模型定价：左侧渠道，右侧按模型家族分组列出每条别名的有效价。
 *
 * 价格定在家族分组上，渠道自己不管价格：一个家族（Claude / Gemini / …）一份分组定价，写在分组标题上——
 * 倍率（美元牌价 × 倍率 = 人民币）、按次价，或积分单价。组里的别名默认继承它，也可以单设独立倍率或自定义有效价。
 */
import { computed, onMounted, ref, watch } from 'vue';

import { ArrowRight, Delete, Edit } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

import PageHeader from '@/shared/ui/PageHeader.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import { formatDateTime } from '@/shared/lib/date';
import { confirmDanger } from '@/shared/composables/useConfirm';
import { usePagination } from '@/shared/composables/usePagination';

import {
  CHAT_UNSUPPORTED_BILLING_TYPES,
  FamilyPricingModeLabel,
  ProviderGroupLabel,
  compareMakers,
  modelFamilyLabel,
} from '@yomi/common';
import type { Rate, RouteRateEntry, VendorFamilyPricing, VendorModelGroup } from '@yomi/common';
import type { UnconfiguredRoute, VendorRateStatsMap } from '@yomi/common';
import type { ProviderGroup } from '../model/catalog.types';
import {
  ROUTE_PRICING_CHOICE_LABEL,
  DEFAULT_FAMILY_PRICING,
  formatFamilyPricingValue,
  routePricingChoice,
  type RoutePricingChoice,
} from '../model/familyPricing';
import { formatMultiplier } from '../model/rateSummary';
import { isEmbeddingPrice, rateBodyDisplay, type PriceDisplay } from '../model/priceTable';
import {
  getYomiCatalogPort,
  getYomiPricingPort,
  getYomiRatePort,
  getYomiVendorRoutePort,
} from '../services';
import ProviderWorkspaceLayout from '../components/provider/ProviderWorkspaceLayout.vue';
import ProviderGroupSidebar from '../components/provider/ProviderGroupSidebar.vue';
import ProviderDetailPanel from '../components/provider/ProviderDetailPanel.vue';
import AliasMap from '../components/AliasMap.vue';
import MakerMark from '../components/pricing/MakerMark.vue';
import PriceCells from '../components/pricing/PriceCells.vue';
import FamilyPricingDrawer from '../components/pricing/FamilyPricingDrawer.vue';
import RouteRateDrawer, { type RouteRateTarget } from '../components/RouteRateDrawer.vue';

const catalogPort = getYomiCatalogPort();
const ratePort = getYomiRatePort();
const routePort = getYomiVendorRoutePort();
const pricingPort = getYomiPricingPort();

const groups = ref<ProviderGroup[]>([]);
const groupsLoading = ref(false);
const selectedVendor = ref<string>('');

const pricedGroups = ref<VendorModelGroup[]>([]);
const pricedGroupsLoading = ref(false);
const families = ref<VendorFamilyPricing[]>([]);
const vendorRateCounts = ref<VendorRateStatsMap>({});
const unconfiguredItems = ref<UnconfiguredRoute[]>([]);
const unconfiguredLoading = ref(false);

const unconfiguredPagination = usePagination({ pageSize: 15, pageSizes: [10, 15, 30, 50] });

/**
 * 已定价的别名一次取全，不分页：分组标题上写着这一组的倍率，一组被翻页切成两半的话，
 * 后半截就成了没有标题、看不出跟哪个倍率的行。一个渠道的别名是几十条的量级，分几趟取完。
 */
const PRICED_FETCH_SIZE = 200;

const routeRateOpen = ref(false);
const routeRateTarget = ref<RouteRateTarget | null>(null);

const familyDrawerOpen = ref(false);
const familyDrawerTarget = ref<VendorFamilyPricing | null>(null);

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
  choice: RoutePricingChoice;
}

interface FamilySection {
  family: VendorFamilyPricing;
  rows: PricedRow[];
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
      choice: routePricingChoice(entry.pricingMode, entry.priceMultiplier),
    })),
  ),
);

/**
 * 按家族分好的已定价别名。分组以后端给的家族列表为准（怎么定价都在上面）；
 * 行里出现了列表里没有的家族（列表没取到）也照样成组，按默认的倍率 1 显示，不让行掉出页面。
 * 渠道里有别名但一条都还没定价的家族也列出来：分组的价可以先定好。
 */
const sections = computed<FamilySection[]>(() => {
  const byFamily = new Map<string, PricedRow[]>();
  for (const row of pricedRows.value) {
    const list = byFamily.get(row.entry.family);
    if (list) list.push(row);
    else byFamily.set(row.entry.family, [row]);
  }

  const out: FamilySection[] = [];
  for (const family of families.value) {
    const rows = byFamily.get(family.family) ?? [];
    byFamily.delete(family.family);
    if (rows.length === 0 && family.routeCount === 0) continue;
    out.push({ family, rows });
  }
  for (const [family, rows] of byFamily) {
    out.push({
      family: {
        family,
        ...DEFAULT_FAMILY_PRICING,
        routeCount: rows.length,
        inheritingRouteCount: rows.filter((r) => r.choice === 'family').length,
      },
      rows,
    });
  }
  return out.sort((a, b) => compareMakers(a.family.family, b.family.family));
});

/**
 * 折起来的家族分组，键是「渠道|家族」：各渠道各记各的，换个渠道再回来还是原样。
 * 记在浏览器里，刷新不丢。只是个人看页面的习惯，读不出、存不了就当没折过。
 */
const COLLAPSED_KEY = 'meeko.yomi.rate.collapsedFamilies';

function storedCollapsed(): Set<string> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]');
    return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

const collapsed = ref(storedCollapsed());

function isCollapsed(family: string): boolean {
  return collapsed.value.has(`${selectedVendor.value}|${family}`);
}

function toggleFamily(family: string): void {
  const key = `${selectedVendor.value}|${family}`;
  const next = new Set(collapsed.value);
  if (!next.delete(key)) next.add(key);
  collapsed.value = next;
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
  } catch {
    // 隐私模式等存不了就算了，这一页里照样折得起来，只是刷新后回到全部展开。
  }
}

function pricedRowKey(row: PricedRow): string {
  return `${row.vendorKey}|${row.entry.routeKey}`;
}

/** 行上「来源」一栏：这条的价跟的是哪一层。 */
function sourceText(row: PricedRow): string {
  if (row.choice === 'manual') return ROUTE_PRICING_CHOICE_LABEL.manual;
  // 写后端实际乘上去的那个数；还没重算过的行（缺牌价）退回路由上存的。
  const applied = row.entry.rate.multiplierApplied;
  if (row.choice === 'own') {
    return `独立 ${formatMultiplier(applied ?? row.entry.priceMultiplier ?? 1)}`;
  }
  // 继承分组：分组是倍率就写乘了多少；分组是按次 / 积分，价格栏里已经是分组那个价了，这里只说它是跟分组的。
  return applied != null ? formatMultiplier(applied) : '继承分组';
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
  const vendorKey = selectedVendor.value;
  if (!vendorKey) return;
  pricedGroupsLoading.value = true;
  try {
    const all: VendorModelGroup[] = [];
    for (let page = 1; ; page += 1) {
      const r = await ratePort.listVendorModelGroups({
        page,
        pageSize: PRICED_FETCH_SIZE,
        filter: { vendorKey, keyword: '', billingType: 'all' },
      });
      if (!r.success) {
        ElMessage.error(r.error.message);
        return;
      }
      all.push(...r.data.groups);
      if (r.data.groups.length === 0 || all.length >= r.data.total) break;
    }
    // 取的途中换了渠道：这一批是上一个渠道的，丢掉。
    if (vendorKey === selectedVendor.value) pricedGroups.value = all;
  } finally {
    pricedGroupsLoading.value = false;
  }
}

async function loadFamilies(): Promise<void> {
  const group = selectedGroup.value;
  if (!group) return;
  const r = await pricingPort.listVendorFamilies(group.id);
  if (group.queueGroup !== selectedVendor.value) return;
  if (r.success) families.value = r.data;
  else ElMessage.error(r.error.message);
}

function openRouteRate(row: PricedRow): void {
  routeRateTarget.value = {
    routeId: row.entry.routeId,
    routeKey: row.entry.routeKey,
    vendorModel: row.vendorModel,
    pricingMode: row.entry.pricingMode,
    priceMultiplier: row.entry.priceMultiplier,
    family: row.entry.family,
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
    priceMultiplier: null,
    family: row.family,
    rate: null,
  };
  routeRateOpen.value = true;
}

function openFamily(family: VendorFamilyPricing): void {
  familyDrawerTarget.value = family;
  familyDrawerOpen.value = true;
}

async function reloadAll(): Promise<void> {
  await Promise.all([loadPricedGroups(), loadFamilies(), loadVendorRateStats(), loadGroups()]);
  if (activeTab.value === 'unconfigured') await loadUnconfiguredRoutes();
}

/** 正在切网页聊天开关的别名（路由主键），切的时候那一个开关转圈、不让连点。 */
const chatToggling = ref<string | null>(null);

/** 这种计费方式在网页聊天里没有入口：开关开着也不会出现在网页里，开关置灰并说明。 */
function chatUnsupported(row: PricedRow): boolean {
  return CHAT_UNSUPPORTED_BILLING_TYPES.includes(row.entry.rate.billingType);
}

/**
 * 切「下发到网页聊天」。只改这一条，不重算价，不重新拉整页：开关的值以后端回的为准，
 * 网页聊天的模型列表几秒后跟着变（网关按版本重拉）。
 */
async function onToggleChat(row: PricedRow, visible: boolean): Promise<void> {
  const routeId = row.entry.routeId;
  if (!routeId) {
    ElMessage.error('这条别名没有路由主键，改不了网页聊天开关');
    return;
  }
  chatToggling.value = routeId;
  try {
    const r = await routePort.setChatVisible(routeId, visible);
    if (!r.success) {
      ElMessage.error(r.error.message);
      return;
    }
    row.entry.chatVisible = r.data.chatVisible;
    ElMessage.success(
      r.data.chatVisible
        ? `${row.entry.routeKey} 已下发到网页聊天`
        : `${row.entry.routeKey} 已从网页聊天撤下`,
    );
  } finally {
    chatToggling.value = null;
  }
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
  unconfiguredPagination.setPage(1);
  // 换渠道先清空：上一个渠道的分组和倍率不能在新渠道的标题下面多留一拍。
  pricedGroups.value = [];
  families.value = [];
  void loadPricedGroups();
  void loadFamilies();
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
      <!-- 这一页没有「重算」按钮：改分组定价重算那一组，改一条别名重算那一条，牌价变了后端自己算。 -->
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
            <span>已定价 {{ pricedRows.length }} 个别名</span>
            <span>未配置 {{ selectedVendorUnconfiguredCount }} 个</span>
          </div>
        </div>
      </template>

      <template #toolbar>
        <el-tabs v-model="activeTab" class="rate-tabs">
          <el-tab-pane name="priced">
            <template #label>
              <span class="tab-label">
                已配置
                <el-tag
                  v-if="pricedRows.length > 0"
                  size="small"
                  type="info"
                  effect="plain"
                  round
                >
                  {{ pricedRows.length }}
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
          <div v-if="sections.length > 0" class="rate-row rate-row--head">
            <span>别名</span>
            <span>价格</span>
            <span>来源 · 日期</span>
            <span class="rate-row__chat-h">网页聊天</span>
            <span class="rate-row__ops-h">操作</span>
          </div>
          <template v-for="sec in sections" :key="sec.family.family">
            <div class="fam-row">
              <!-- 折叠按钮占满标题左边整段；倍率按钮单独在右边，点它是改倍率不是折叠。 -->
              <button
                type="button"
                class="fam-row__id"
                :aria-expanded="!isCollapsed(sec.family.family)"
                :title="isCollapsed(sec.family.family) ? '展开这一组' : '折叠这一组'"
                @click="toggleFamily(sec.family.family)"
              >
                <el-icon
                  class="fam-row__caret"
                  :class="{ 'fam-row__caret--open': !isCollapsed(sec.family.family) }"
                  :size="12"
                >
                  <ArrowRight />
                </el-icon>
                <MakerMark :maker="sec.family.family" />
                <span class="fam-row__name">{{ modelFamilyLabel(sec.family.family) }}</span>
                <span class="fam-row__count">{{ sec.rows.length }} 个别名</span>
              </button>
              <!-- 已经在分组标题上了，不再写「分组」二字：方式 + 值，加一支笔说明能点开改。 -->
              <button
                type="button"
                class="fam-mult"
                title="修改分组定价"
                @click="openFamily(sec.family)"
              >
                <span class="fam-mult__k">{{ FamilyPricingModeLabel[sec.family.mode] }}</span>
                <span class="fam-mult__v">{{ formatFamilyPricingValue(sec.family) }}</span>
                <el-icon class="fam-mult__edit" :size="13"><Edit /></el-icon>
              </button>
            </div>
            <template v-if="!isCollapsed(sec.family.family)">
              <article
                v-for="row in sec.rows"
                :key="pricedRowKey(row)"
                class="rate-row"
                @click="openRouteRate(row)"
              >
                <AliasMap class="rate-row__alias" :alias="row.entry.routeKey" :target="row.vendorModel" />
                <div class="rate-row__price">
                  <PriceCells :model="row.display" />
                </div>
                <!-- 来源和日期叠在一栏里：单开一栏，价格那一栏就被挤得放不下三组数。 -->
                <div class="rate-row__meta">
                  <el-tag
                    v-if="row.choice !== 'family'"
                    class="rate-row__src"
                    size="small"
                    :type="row.choice === 'own' ? 'primary' : 'info'"
                    effect="plain"
                  >
                    {{ sourceText(row) }}
                  </el-tag>
                  <span v-else class="rate-row__src rate-row__src--inherit">{{ sourceText(row) }}</span>
                  <span class="rate-row__date">{{ formatDateTime(row.entry.rate.effectiveFromUtc) }}</span>
                </div>
                <div class="rate-row__chat" @click.stop>
                  <el-tooltip
                    :disabled="!chatUnsupported(row)"
                    content="网页聊天里没有这种计费方式的入口，开着也不会出现"
                    placement="top"
                    :show-after="300"
                  >
                    <el-switch
                      :model-value="row.entry.chatVisible"
                      :loading="chatToggling === row.entry.routeId"
                      :disabled="!row.entry.routeId || chatUnsupported(row)"
                      size="small"
                      :aria-label="`${row.entry.routeKey} 下发到网页聊天`"
                      @update:model-value="(v: string | number | boolean) => onToggleChat(row, v === true)"
                    />
                  </el-tooltip>
                </div>
                <!-- 只放图标：加了网页聊天开关这一栏，带字的按钮会把这一行挤出面板。整行点开也是定价。 -->
                <div class="rate-row__ops">
                  <el-button
                    :icon="Edit"
                    link
                    type="primary"
                    title="定价"
                    aria-label="定价"
                    @click.stop="openRouteRate(row)"
                  />
                  <el-button
                    :icon="Delete"
                    link
                    type="danger"
                    title="删除定价"
                    aria-label="删除定价"
                    @click.stop="onDelete(row.entry.rate)"
                  />
                </div>
              </article>
              <p v-if="sec.rows.length === 0" class="fam-empty">
                这一组的 {{ sec.family.routeCount }} 个别名还没有定价，见「未配置」。
              </p>
            </template>
          </template>
          <EmptyState
            v-if="sections.length === 0 && !pricedGroupsLoading"
            class="rate-list__empty"
            title="暂无定价"
          />
        </div>
      </div>

      <div
        v-show="activeTab === 'unconfigured'"
        v-loading="unconfiguredLoading"
        class="provider-detail__table-wrap"
      >
        <div class="rate-list rate-list--open">
          <div v-if="unconfiguredItems.length > 0" class="rate-row rate-row--head">
            <span>别名</span>
            <span>家族</span>
            <span class="rate-row__ops-h">操作</span>
          </div>
          <article
            v-for="row in unconfiguredItems"
            :key="row.routeKey"
            class="rate-row"
            @click="openUnconfigured(row)"
          >
            <AliasMap class="rate-row__alias" :alias="row.routeKey" :target="row.vendorModel" />
            <div class="rate-row__family">{{ modelFamilyLabel(row.family) }}</div>
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
      :families="families"
      @saved="reloadAll"
    />

    <FamilyPricingDrawer
      v-model="familyDrawerOpen"
      :vendor-id="selectedGroup?.id ?? null"
      :vendor-title="vendorTitle"
      :family="familyDrawerTarget"
      @saved="reloadAll"
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
  /* 价格列放得下三组「icon + 数字」：入 / 写 5m、写 1h、出 / 读。窄了第三组会压到后面几栏上。 */
  /* 第四栏是「网页聊天」开关，只要一个开关宽；操作栏只有两个图标。 */
  grid-template-columns: minmax(160px, 1.1fr) minmax(340px, 1.5fr) 140px 56px 56px;
  column-gap: 16px;
  align-content: start;
  padding: 0 4px 8px;
  height: 100%;
}
.rate-list--open {
  grid-template-columns: minmax(0, 1fr) 120px 88px;
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
.rate-row__meta {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  min-width: 0;
}
.rate-row__src {
  white-space: nowrap;
}
.rate-row__src--inherit {
  font-variant-numeric: tabular-nums;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}
.rate-row__family {
  font-variant-numeric: tabular-nums;
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}
/* 家族分组标题：横跨整行，左边是谁家的模型，右边是这一组怎么定价。 */
.fam-row {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 14px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
}
.rate-row--head + .fam-row {
  margin-top: 8px;
}
.fam-row__id {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.fam-row__caret {
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
  transition: transform 0.15s;
}
.fam-row__caret--open {
  transform: rotate(90deg);
}
.fam-row__id:hover .fam-row__caret,
.fam-row__id:hover .fam-row__name {
  color: var(--el-color-primary);
}
.fam-row__name {
  font-size: 14px;
  font-weight: 600;
}
.fam-row__count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.fam-mult {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 4px 10px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: var(--el-bg-color);
  cursor: pointer;
  line-height: 1.2;
}
.fam-mult:hover {
  border-color: var(--el-color-primary);
}
.fam-mult__v {
  font-size: 16px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.03em;
  color: var(--el-text-color-primary);
}
.fam-mult:hover .fam-mult__v {
  color: var(--el-color-primary);
}
.fam-mult__k {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.fam-mult__edit {
  color: var(--el-text-color-placeholder);
}
.fam-mult:hover .fam-mult__edit {
  color: var(--el-color-primary);
}
.fam-empty {
  grid-column: 1 / -1;
  margin: 0;
  padding: 12px 10px;
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
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
.rate-row__chat,
.rate-row__chat-h {
  display: flex;
  justify-content: center;
  white-space: nowrap;
}
.rate-row__ops-h {
  text-align: right;
}
</style>
