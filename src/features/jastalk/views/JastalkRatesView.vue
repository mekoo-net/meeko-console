<script setup lang="ts">
/**
 * Jastalk 模型定价（照 Yomi 的模型定价页，少了别名那一层：Jastalk 的模型就叫它在渠道里的名字）。
 * 左边是渠道，右边是这个渠道接进来的模型各卖多少积分。
 *
 * 价格按渠道定：渠道上定一个倍率，积分 = 全站共用的美元牌价 × 倍率 × 100，后端算好，这里只显示；
 * 右上角那个数就是这个渠道的倍率，点它改。个别模型可以单独定价，不跟倍率走。
 * 接哪些模型在「渠道」页，这里只管价。
 *
 * 没有价的模型用户选不了：单列一栏，每个写着差的是什么（渠道没设倍率、牌价里没有它、折不成它的单位）。
 *
 * 没有「重算」：改倍率、接模型、牌价变了，后端自己会算。
 *
 * 不分渠道的价（渠道写 `*`，以前在平铺的价格表里手填的）这里不能新加——价格只跟着渠道走。
 * 库里还留着的在页面顶上列出来：它们还在生效（没有自己价格的模型会落到上面），要看得见、删得掉。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Refresh } from '@element-plus/icons-vue';

import PageHeader from '@/shared/ui/PageHeader.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import WorkspaceLayout from '@/shared/ui/workspace/WorkspaceLayout.vue';
import WorkspaceDetailPanel from '@/shared/ui/workspace/WorkspaceDetailPanel.vue';
import { confirmDanger } from '@/shared/composables/useConfirm';

import ChannelEditDrawer from '../components/channel/ChannelEditDrawer.vue';
import ChannelSidebar from '../components/channel/ChannelSidebar.vue';
import ModelRateDrawer from '../components/channel/ModelRateDrawer.vue';
import {
  describeModelPrice,
  followBlock,
  followBlockText,
  multiplierText,
  pricingLabels,
  pricingTones,
} from '../model/channelPricing';
import { ANY, type ChannelBoard, type ChannelDetail, type ChannelModel, type PointRate } from '../model/jastalk.types';
import { categoryLabels, describePrice } from '../model/jastalkFormat';
import { getJastalkAdminPort } from '../services';

const port = getJastalkAdminPort();

const board = ref<ChannelBoard | null>(null);
const boardLoading = ref(false);
const selectedKey = ref('');

const detail = ref<ChannelDetail | null>(null);
const detailLoading = ref(false);
let detailSeq = 0;

type Tab = 'priced' | 'unpriced';
const tab = ref<Tab>('priced');

const channels = computed(() => board.value?.channels ?? []);
const selected = computed(() => channels.value.find((c) => c.vendorKey === selectedKey.value) ?? null);
/** 右边摆的那一份详情：只认现在选中的渠道的，切渠道时不把上一个渠道的模型晃一下。 */
const current = computed(() => (detail.value?.channel.vendorKey === selectedKey.value ? detail.value : null));

const upstreamReachable = computed(() => board.value?.upstreamReachable ?? true);
const listPricesLoaded = computed(() => board.value?.listPricesLoaded ?? true);

const priced = computed(() => current.value?.models.filter((m) => m.model.priced) ?? []);
const unpriced = computed(() => current.value?.models.filter((m) => !m.model.priced) ?? []);
const compiledCount = computed(() => current.value?.models.filter((m) => m.pricing === 'compiled').length ?? 0);

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
  const mine = ++detailSeq;
  if (!key) {
    detail.value = null;
    detailLoading.value = false;
    return;
  }
  detailLoading.value = true;
  try {
    const r = await port.channel(key);
    if (mine !== detailSeq) return;
    if (r.success) detail.value = r.data;
    else ElMessage.error(r.error.message);
  } finally {
    if (mine === detailSeq) detailLoading.value = false;
  }
}

// ─── 不分渠道的旧价格 ────────────────────────────────────

/** 渠道写 `*` 的那几行。平时是空的，这一块不出现。 */
const wildcards = ref<PointRate[]>([]);

async function loadWildcards(): Promise<void> {
  const r = await port.rates();
  // 读不到不弹：这一块只是提醒还有旧账，不耽误按渠道定价
  if (r.success) wildcards.value = r.data.filter((rate) => rate.vendorKey === ANY);
}

function wildcardScope(rate: PointRate): string {
  return rate.modelName === ANY ? '所有模型' : rate.modelName;
}

async function removeWildcard(rate: PointRate): Promise<void> {
  const okp = await confirmDanger({
    title: '删除不分渠道的价',
    message: `删掉「${wildcardScope(rate)}」不分渠道的价？现在落在它上面的模型会变成没有价格，用户选不了，直到它所在的渠道给它算出价、或者单独定价。`,
    confirmText: '删除',
  });
  if (!okp) return;
  const r = await port.deleteRate(rate.id);
  if (!r.success) {
    ElMessage.error(r.error.message);
    return;
  }
  ElMessage.success('已删除');
  await reload();
}

/** 改完任何一样都一起重拉：左边的数（倍率、未定价几个）、右边的模型、顶上的旧价格是同一份数据的几个面。 */
async function reload(): Promise<void> {
  await Promise.all([loadBoard(), loadDetail(), loadWildcards()]);
}

// ─── 定价 ────────────────────────────────────────────────

const settingsOpen = ref(false);

const rateOpen = ref(false);
const rateTarget = ref<ChannelModel | null>(null);

function priceModel(row: ChannelModel): void {
  rateTarget.value = row;
  rateOpen.value = true;
}

/** 这个模型为什么没有价。算得出来、只是还没算的（刚接进来、当时手上没有牌价）不说成缺什么。 */
function unpricedReason(row: ChannelModel): string {
  const block = followBlock({
    multiplier: selected.value?.multiplier ?? null,
    listPrice: row.listPrice,
    listPricesLoaded: listPricesLoaded.value,
  });
  return block ? followBlockText(block, row.listPrice, row.model.unit) : '还没算出来';
}

watch(selectedKey, () => {
  tab.value = 'priced';
  void loadDetail();
});

// 选中第一个渠道以后，上面那条 watch 去拉它的详情
onMounted(() => {
  void loadBoard();
  void loadWildcards();
});
</script>

<template>
  <WorkspaceLayout :loading="boardLoading && !board">
    <template #header>
      <PageHeader title="模型定价">
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
        v-if="!listPricesLoaded || wildcards.length > 0"
        class="notices"
      >
        <el-alert
          v-if="!listPricesLoaded"
          type="warning"
          :closable="false"
          show-icon
          title="手上没有牌价：算不了新价，已经算好的照旧在用。"
        />
        <el-alert
          v-if="wildcards.length > 0"
          class="wildcards"
          type="warning"
          :closable="false"
          show-icon
        >
          <template #title>
            还有 {{ wildcards.length }} 条不分渠道的旧价格在生效：没有自己价格的模型会按它们收（来源写着「{{ pricingLabels.default }}」）。
          </template>
          <ul class="wildcards__list">
            <li
              v-for="rate in wildcards"
              :key="rate.id"
            >
              <span class="wildcards__scope">{{ wildcardScope(rate) }}</span>
              <span class="num">{{ describePrice(rate.unit, rate.inputPrice, rate.outputPrice) }}</span>
              <el-button
                link
                type="danger"
                size="small"
                @click="removeWildcard(rate)"
              >
                删除
              </el-button>
            </li>
          </ul>
        </el-alert>
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
          <el-tab-pane name="priced">
            <template #label>
              <span class="tab-label">
                已定价
                <el-tag
                  v-if="priced.length > 0"
                  size="small"
                  type="info"
                  effect="plain"
                  round
                >
                  {{ priced.length }}
                </el-tag>
              </span>
            </template>
          </el-tab-pane>
          <el-tab-pane name="unpriced">
            <template #label>
              <span class="tab-label">
                未定价
                <el-tag
                  v-if="unpriced.length > 0"
                  size="small"
                  type="danger"
                  effect="plain"
                  round
                >
                  {{ unpriced.length }}
                </el-tag>
              </span>
            </template>
          </el-tab-pane>
        </el-tabs>
      </template>

      <div
        v-show="tab === 'priced'"
        v-loading="detailLoading"
        class="provider-detail__table-wrap"
      >
        <el-table
          :data="priced"
          :row-key="(row: ChannelModel) => String(row.model.id)"
          size="small"
          class="compact-table"
          height="100%"
          :empty-text="' '"
        >
          <el-table-column
            label="模型"
            min-width="220"
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
            min-width="260"
          >
            <template #default="{ row }: { row: ChannelModel }">
              <span class="num">{{ describeModelPrice(row.model.category, row.model.inputPrice, row.model.outputPrice) }}</span>
            </template>
          </el-table-column>
          <el-table-column
            label="来源"
            width="100"
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
            label="操作"
            width="76"
            align="right"
            fixed="right"
          >
            <template #default="{ row }: { row: ChannelModel }">
              <el-button
                link
                type="primary"
                @click="priceModel(row)"
              >
                定价
              </el-button>
            </template>
          </el-table-column>

          <!-- 详情没拉到（还在拉、或者拉失败了）时不说「没有」：那是不知道，不是没有 -->
          <template #empty>
            <EmptyState
              v-if="current && !detailLoading"
              :title="current.models.length === 0 ? '这个渠道还没有接入模型' : '这个渠道还没有定好价的模型'"
              :description="current.models.length === 0 ? '在「渠道」页接入模型' : undefined"
            />
          </template>
        </el-table>
      </div>

      <div
        v-show="tab === 'unpriced'"
        v-loading="detailLoading"
        class="provider-detail__table-wrap"
      >
        <el-table
          :data="unpriced"
          :row-key="(row: ChannelModel) => String(row.model.id)"
          size="small"
          class="compact-table"
          height="100%"
          :empty-text="' '"
        >
          <el-table-column
            label="模型"
            min-width="220"
          >
            <template #default="{ row }: { row: ChannelModel }">
              <div class="cell-stack">
                <span class="model-name">
                  <span :class="{ 'cell-muted': !row.model.enabled }">{{ row.model.displayName }}</span>
                  <el-tag
                    v-if="!row.model.enabled"
                    size="small"
                    type="info"
                    effect="plain"
                  >
                    停用
                  </el-tag>
                </span>
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
            label="差什么"
            min-width="260"
          >
            <template #default="{ row }: { row: ChannelModel }">
              <span class="unpriced-reason">{{ unpricedReason(row) }}</span>
            </template>
          </el-table-column>
          <el-table-column
            label="操作"
            width="76"
            align="right"
            fixed="right"
          >
            <template #default="{ row }: { row: ChannelModel }">
              <el-button
                link
                type="primary"
                @click="priceModel(row)"
              >
                定价
              </el-button>
            </template>
          </el-table-column>

          <template #empty>
            <EmptyState
              v-if="current && !detailLoading"
              title="都定好价了"
            />
          </template>
        </el-table>
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

.wildcards__list {
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
}

.wildcards__list li {
  display: flex;
  align-items: center;
  gap: 12px;
  line-height: 1.8;
}

.wildcards__scope {
  min-width: 120px;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  color: var(--el-text-color-primary);
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

.unpriced-reason {
  color: var(--el-color-danger);
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
