<script setup lang="ts">
/**
 * Jastalk 渠道（照 Yomi 的渠道页）：左边是渠道，右边是这个渠道的模型。
 *
 * 渠道 = OneApi 上的一个 provider，清单是后端回的，不手敲。渠道上只定一个倍率：
 * 积分 = 全站共用的美元牌价 × 倍率 × 100，后端算好，这里只显示。模型从渠道在 OneApi 发布的清单里勾选接入；
 * 个别模型可以单独定价，不跟倍率走。牌价里对不上的模型没有价格，用户选不了——这一页把它们标出来。
 *
 * 读不到 OneApi 的渠道目录、手上没有牌价这两种情况，后端照样回一份（在线状态、可接入的模型、牌价是空的），
 * 页面顶上要明说，不能悄悄显示成「都不在线」「牌价里都没有」。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { ElMessage, type TableInstance } from 'element-plus';
import { Refresh, Search } from '@element-plus/icons-vue';

import PageHeader from '@/shared/ui/PageHeader.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import WorkspaceLayout from '@/shared/ui/workspace/WorkspaceLayout.vue';
import WorkspaceDetailPanel from '@/shared/ui/workspace/WorkspaceDetailPanel.vue';
import { confirmDanger } from '@/shared/composables/useConfirm';

import ChannelEditDrawer from '../components/channel/ChannelEditDrawer.vue';
import ChannelSidebar from '../components/channel/ChannelSidebar.vue';
import ModelEditDialog from '../components/channel/ModelEditDialog.vue';
import ModelRateDrawer from '../components/channel/ModelRateDrawer.vue';
import {
  describeListPrice,
  describeModelPrice,
  multiplierText,
  pricingLabels,
  pricingTones,
} from '../model/channelPricing';
import { notifyCompile } from '../model/compileFeedback';
import {
  modelCategories,
  type CatalogModel,
  type ChannelBoard,
  type ChannelDetail,
  type ChannelModel,
  type ModelCategory,
  type UpstreamModel,
} from '../model/jastalk.types';
import { categoryLabels, categoryUnits } from '../model/jastalkFormat';
import { getJastalkAdminPort } from '../services';

const port = getJastalkAdminPort();

const board = ref<ChannelBoard | null>(null);
const boardLoading = ref(false);
const selectedKey = ref('');

const detail = ref<ChannelDetail | null>(null);
const detailLoading = ref(false);
let detailSeq = 0;

/** 「可接入」里打算把勾选的模型接成哪一类。还没接的模型不知道归哪一类，牌价按这里选的类别的计量单位折。 */
const importCategory = ref<ModelCategory>('chat');
/**
 * 现在摆着的这份详情是按哪个类别预览的。换了类别要重取，新的回来之前摆着的还是旧的那一份：
 * 列里的单位跟着这个走，不跟着下拉框走，免得把按 token 折的数配上「/ 张」。
 */
const previewCategory = ref<ModelCategory>('chat');

type Tab = 'models' | 'available';
const tab = ref<Tab>('models');

const channels = computed(() => board.value?.channels ?? []);
const selected = computed(() => channels.value.find((c) => c.vendorKey === selectedKey.value) ?? null);
/** 右边摆的那一份详情：只认现在选中的渠道的，切渠道时不把上一个渠道的模型晃一下。 */
const current = computed(() => (detail.value?.channel.vendorKey === selectedKey.value ? detail.value : null));

const upstreamReachable = computed(() => board.value?.upstreamReachable ?? true);
const listPricesLoaded = computed(() => board.value?.listPricesLoaded ?? true);

async function loadBoard(): Promise<void> {
  boardLoading.value = true;
  try {
    const r = await port.channels();
    if (!r.success) {
      ElMessage.error(r.error.message);
      return;
    }
    board.value = r.data;
    if (!r.data.channels.some((c) => c.vendorKey === selectedKey.value)) selectedKey.value = r.data.channels[0]?.vendorKey ?? '';
  } finally {
    boardLoading.value = false;
  }
}

/** 只认最后一次请求的回包：连着点两个渠道，慢的那个回来不会盖掉后点的。 */
async function loadDetail(): Promise<void> {
  const key = selectedKey.value;
  const category = importCategory.value;
  const mine = ++detailSeq;
  if (!key) {
    detail.value = null;
    detailLoading.value = false;
    return;
  }
  detailLoading.value = true;
  try {
    const r = await port.channel(key, category);
    if (mine !== detailSeq) return;
    if (r.success) {
      detail.value = r.data;
      previewCategory.value = category;
    } else ElMessage.error(r.error.message);
  } finally {
    if (mine === detailSeq) detailLoading.value = false;
  }
}

/** 改完任何一样都两边一起重拉：左边的数（倍率、未定价几个）和右边的模型是同一份数据的两个面。 */
async function reload(): Promise<void> {
  await Promise.all([loadBoard(), loadDetail()]);
}

// ─── 已接入 ──────────────────────────────────────────────

/** 「OneApi 那边不发布了」只在读得到目录、渠道也在线时标：渠道整个不在线时每个模型都是，头上已经写了离线。 */
const showDelisted = computed(() => upstreamReachable.value && selected.value?.online === true);

const compiledCount = computed(() => current.value?.models.filter((m) => m.pricing === 'compiled').length ?? 0);

const settingsOpen = ref(false);

const editOpen = ref(false);
const editTarget = ref<CatalogModel | null>(null);

function editModel(row: ChannelModel): void {
  editTarget.value = row.model;
  editOpen.value = true;
}

const rateOpen = ref(false);
const rateTarget = ref<ChannelModel | null>(null);

function priceModel(row: ChannelModel): void {
  rateTarget.value = row;
  rateOpen.value = true;
}

async function removeModel(row: ChannelModel): Promise<void> {
  const okp = await confirmDanger({
    title: '移除模型',
    message: `从「${row.model.vendorName}」移除 ${row.model.displayName}？移除后用户不能再选它。`,
    confirmText: '移除',
  });
  if (!okp) return;
  const r = await port.deleteModel(row.model.id);
  if (!r.success) {
    ElMessage.error(r.error.message);
    return;
  }
  ElMessage.success('已移除');
  await reload();
}

const compiling = ref(false);

async function recompile(): Promise<void> {
  const channel = selected.value;
  if (!channel) return;
  compiling.value = true;
  try {
    const r = await port.compileRates(channel.vendorKey);
    if (!r.success) {
      ElMessage.error(r.error.message);
      return;
    }
    notifyCompile(`${channel.vendorName} 已重算`, r.data);
    await reload();
  } finally {
    compiling.value = false;
  }
}

// ─── 可接入 ──────────────────────────────────────────────

const availableKeyword = ref('');
const availableTable = ref<TableInstance>();
const selection = ref<UpstreamModel[]>([]);
const importEnabled = ref(true);
const importing = ref(false);

const shownAvailable = computed(() => {
  const all = current.value?.available ?? [];
  const kw = availableKeyword.value.trim().toLowerCase();
  return kw ? all.filter((m) => m.modelName.toLowerCase().includes(kw)) : all;
});

/** 列表是空的时候说是哪一种空：读不到、渠道不在线、筛没了、都接完了，各不一样。 */
const availableEmptyText = computed(() => {
  if (!upstreamReachable.value) return '没读到 OneApi 的渠道目录';
  if (selected.value && !selected.value.online) return '渠道不在线，读不到它发布的模型';
  if (availableKeyword.value.trim()) return '没有匹配的模型';
  return 'OneApi 发布的模型都已接入';
});

/** 可接入的模型按所选类别折出来的积分；牌价里没有、折不成这一类的单位、渠道没设倍率，都折不出来。 */
function previewPoints(row: UpstreamModel): string {
  const price = row.listPrice;
  if (!price || price.pointsInput === null || price.pointsOutput === null) return '—';
  return describeModelPrice(previewCategory.value, price.pointsInput, price.pointsOutput);
}

async function importSelected(): Promise<void> {
  const channel = selected.value;
  if (!channel || selection.value.length === 0) return;
  importing.value = true;
  try {
    const r = await port.importModels(channel.vendorKey, {
      category: importCategory.value,
      models: selection.value.map((m) => m.modelName),
      enabled: importEnabled.value,
    });
    if (!r.success) {
      ElMessage.error(r.error.message);
      return;
    }
    const skipped = r.data.skipped > 0 ? `，${r.data.skipped} 个这一类里已有` : '';
    notifyCompile(`已接入 ${r.data.added} 个${skipped}`, r.data.compile);
    availableTable.value?.clearSelection();
    // 接进来的在「已接入」里：切过去，当场看得到它们有没有价
    tab.value = 'models';
    await reload();
  } finally {
    importing.value = false;
  }
}

// 换了类别，可接入的那些牌价要按新类别的单位重折：带着它重取（勾过的行表格记着，不丢）
watch(importCategory, () => void loadDetail());

watch(selectedKey, () => {
  tab.value = 'models';
  availableKeyword.value = '';
  // 表格记着勾过的行（搜索时不丢）；换了渠道得清掉，两个渠道里同名的模型不是一回事
  availableTable.value?.clearSelection();
  void loadDetail();
});

// 选中第一个渠道以后，上面那条 watch 去拉它的详情
onMounted(loadBoard);
</script>

<template>
  <WorkspaceLayout :loading="boardLoading && !board">
    <template #header>
      <PageHeader
        title="渠道"
        :description="board ? `版本 ${board.version}` : undefined"
      >
        <template #actions>
          <el-button
            :icon="Refresh"
            plain
            :loading="boardLoading"
            @click="reload"
          >
            刷新
          </el-button>
        </template>
      </PageHeader>
      <div
        v-if="!upstreamReachable || !listPricesLoaded"
        class="notices"
      >
        <el-alert
          v-if="!upstreamReachable"
          type="warning"
          :closable="false"
          show-icon
          title="没读到 OneApi 的渠道目录：在线状态和可接入的模型不准。"
        />
        <el-alert
          v-if="!listPricesLoaded"
          type="warning"
          :closable="false"
          show-icon
          title="手上没有牌价：算不了新价，已经算好的照旧在用。"
        />
      </div>
    </template>

    <ChannelSidebar
      v-model="selectedKey"
      :channels="channels"
      :upstream-reachable="upstreamReachable"
    />

    <WorkspaceDetailPanel v-if="selected">
      <template #header>
        <div class="detail-main">
          <h2 class="provider-detail__title">
            {{ selected.vendorName }}
          </h2>
          <p class="provider-detail__sub">
            {{ selected.vendorKey }}
          </p>
          <div class="provider-detail__stats">
            <span>已定价 {{ selected.priced }}</span>
            <span :class="{ 'stat-warn': selected.unpriced > 0 }">未定价 {{ selected.unpriced }}</span>
            <el-button
              link
              type="primary"
              size="small"
              :loading="compiling"
              @click="recompile"
            >
              重算
            </el-button>
          </div>
        </div>
        <button
          type="button"
          class="mult"
          @click="settingsOpen = true"
        >
          <span
            class="mult__v"
            :class="{ 'mult__v--unset': selected.multiplier === null }"
          >{{ multiplierText(selected.multiplier) }}</span>
          <span class="mult__k">渠道倍率</span>
        </button>
      </template>

      <template #toolbar>
        <el-tabs
          v-model="tab"
          class="channel-tabs"
        >
          <el-tab-pane name="models">
            <template #label>
              <span class="tab-label">
                已接入
                <el-tag
                  v-if="selected.models > 0"
                  size="small"
                  type="info"
                  effect="plain"
                  round
                >
                  {{ selected.models }}
                </el-tag>
              </span>
            </template>
          </el-tab-pane>
          <el-tab-pane name="available">
            <template #label>
              <span class="tab-label">
                可接入
                <el-tag
                  v-if="current && current.available.length > 0"
                  size="small"
                  type="info"
                  effect="plain"
                  round
                >
                  {{ current.available.length }}
                </el-tag>
              </span>
            </template>
          </el-tab-pane>
        </el-tabs>
      </template>

      <div
        v-show="tab === 'models'"
        v-loading="detailLoading"
        class="provider-detail__table-wrap"
      >
        <el-table
          :data="current?.models ?? []"
          :row-key="(row: ChannelModel) => String(row.model.id)"
          size="small"
          class="compact-table"
          height="100%"
          :empty-text="' '"
        >
          <el-table-column
            label="模型"
            min-width="200"
          >
            <template #default="{ row }: { row: ChannelModel }">
              <div class="cell-stack">
                <span class="model-name">
                  <span :class="{ 'cell-muted': !row.model.enabled }">{{ row.model.displayName }}</span>
                  <!-- 开着是常态，不占一列：只把停用的标出来 -->
                  <el-tag
                    v-if="!row.model.enabled"
                    size="small"
                    type="info"
                    effect="plain"
                  >
                    停用
                  </el-tag>
                  <el-tag
                    v-if="showDelisted && !row.upstream"
                    size="small"
                    type="warning"
                    effect="plain"
                    title="OneApi 那边现在不发布这个模型了"
                  >
                    上游已下架
                  </el-tag>
                </span>
                <!-- 刚接进来的模型名称就是模型名：不把同一个字符串写两行 -->
                <span
                  v-if="row.model.displayName !== row.model.modelName"
                  class="cell-sub mono"
                >{{ row.model.modelName }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column
            label="类别"
            width="76"
          >
            <template #default="{ row }: { row: ChannelModel }">
              {{ categoryLabels[row.model.category] }}
            </template>
          </el-table-column>
          <el-table-column
            label="价格（积分）"
            min-width="250"
          >
            <template #default="{ row }: { row: ChannelModel }">
              <span
                v-if="row.model.priced"
                class="num"
              >{{ describeModelPrice(row.model.category, row.model.inputPrice, row.model.outputPrice) }}</span>
              <span
                v-else
                class="cell-muted"
              >—</span>
            </template>
          </el-table-column>
          <el-table-column
            label="来源"
            width="92"
          >
            <template #default="{ row }: { row: ChannelModel }">
              <el-tag
                size="small"
                :type="pricingTones[row.pricing]"
                effect="plain"
              >
                {{ pricingLabels[row.pricing] }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column
            label="排序"
            width="56"
            align="right"
          >
            <template #default="{ row }: { row: ChannelModel }">
              <span class="num">{{ row.model.sort }}</span>
            </template>
          </el-table-column>
          <el-table-column
            label="操作"
            width="148"
            align="right"
            fixed="right"
          >
            <template #default="{ row }: { row: ChannelModel }">
              <el-button
                link
                type="primary"
                @click="editModel(row)"
              >
                编辑
              </el-button>
              <el-button
                link
                type="primary"
                @click="priceModel(row)"
              >
                定价
              </el-button>
              <el-button
                link
                type="danger"
                @click="removeModel(row)"
              >
                移除
              </el-button>
            </template>
          </el-table-column>

          <!-- 详情没拉到（还在拉、或者拉失败了）时不说「还没有接入模型」：那是不知道，不是没有 -->
          <template #empty>
            <EmptyState
              v-if="current && !detailLoading"
              title="还没有接入模型"
            >
              <el-button
                type="primary"
                plain
                @click="tab = 'available'"
              >
                去接入
              </el-button>
            </EmptyState>
          </template>
        </el-table>
      </div>

      <div
        v-show="tab === 'available'"
        class="available"
      >
        <div class="available__bar">
          <el-input
            v-model="availableKeyword"
            :prefix-icon="Search"
            placeholder="搜索模型"
            clearable
            class="available__search"
          />
          <div class="available__actions">
            <span class="available__count">已选 {{ selection.length }} 个</span>
            <el-select
              v-model="importCategory"
              class="available__category"
            >
              <el-option
                v-for="c in modelCategories"
                :key="c"
                :label="categoryLabels[c]"
                :value="c"
              />
            </el-select>
            <el-checkbox v-model="importEnabled">
              开放
            </el-checkbox>
            <el-button
              type="primary"
              :disabled="selection.length === 0"
              :loading="importing"
              @click="importSelected"
            >
              接入
            </el-button>
          </div>
        </div>
        <div
          v-loading="detailLoading"
          class="provider-detail__table-wrap"
        >
          <el-table
            ref="availableTable"
            :data="shownAvailable"
            row-key="modelName"
            size="small"
            class="compact-table"
            height="100%"
            :empty-text="' '"
            @selection-change="(rows: UpstreamModel[]) => (selection = rows)"
          >
            <el-table-column
              type="selection"
              width="44"
              reserve-selection
            />
            <el-table-column
              label="模型"
              min-width="240"
            >
              <template #default="{ row }: { row: UpstreamModel }">
                <span class="mono">{{ row.modelName }}</span>
              </template>
            </el-table-column>
            <el-table-column
              label="牌价（美元）"
              min-width="250"
            >
              <template #default="{ row }: { row: UpstreamModel }">
                <span
                  v-if="row.listPrice"
                  class="num"
                >{{ describeListPrice(row.listPrice, categoryUnits[previewCategory]) }}</span>
                <span
                  v-else-if="!listPricesLoaded"
                  class="cell-muted"
                >—</span>
                <el-tag
                  v-else
                  size="small"
                  type="warning"
                  effect="plain"
                >
                  牌价里没有
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column
              label="折合积分"
              min-width="250"
            >
              <template #default="{ row }: { row: UpstreamModel }">
                <span class="num">{{ previewPoints(row) }}</span>
              </template>
            </el-table-column>

            <template #empty>
              <EmptyState
                v-if="current && !detailLoading"
                :title="availableEmptyText"
              />
            </template>
          </el-table>
        </div>
      </div>
    </WorkspaceDetailPanel>

    <WorkspaceDetailPanel
      v-else
      show-placeholder
    >
      <template #placeholder>
        <EmptyState
          v-if="!boardLoading"
          title="还没有渠道"
        />
      </template>
    </WorkspaceDetailPanel>

    <ChannelEditDrawer
      v-model="settingsOpen"
      :channel="selected"
      :compiled-count="compiledCount"
      @saved="reload"
    />

    <ModelRateDrawer
      v-model="rateOpen"
      :target="rateTarget"
      :channel="selected"
      :list-prices-loaded="listPricesLoaded"
      @saved="reload"
    />

    <ModelEditDialog
      v-model="editOpen"
      :target="editTarget"
      @saved="reload"
    />
  </WorkspaceLayout>
</template>

<style scoped>
.notices {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.notices :deep(.el-alert) {
  padding: 6px 12px;
}

.detail-main {
  flex: 1;
  min-width: 0;
}

:deep(.provider-detail__header) {
  align-items: center;
}

.provider-detail__stats {
  align-items: center;
}

.stat-warn {
  color: var(--el-color-danger);
}

/* 倍率：这一页最要紧的一个数，点它改（照 Yomi 定价页右上角那一个） */
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

/* 「未设置」是字不是数：不用数字的字距，颜色提醒一下 */
.mult__v--unset {
  font-size: 18px;
  letter-spacing: 0;
  color: var(--el-color-warning);
}

.mult:hover .mult__v {
  color: var(--el-color-primary);
}

.mult__k {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.channel-tabs {
  margin-bottom: 4px;
}

.channel-tabs :deep(.el-tabs__header) {
  margin-bottom: 0;
}

.channel-tabs :deep(.el-tabs__nav-wrap)::after {
  height: 1px;
}

.tab-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.available {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.available__bar {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.available__search {
  width: 240px;
}

.available__actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.available__count {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.available__category {
  width: 120px;
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

.model-name {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
</style>
