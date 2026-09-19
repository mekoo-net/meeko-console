<script setup lang="ts">
/**
 * 价格表：官方定价依据。左侧厂家、右侧这家的模型与美元牌价。
 *
 * 方向是「模型名映射到价格表取价」——这里只登记厂家发布的模型，不去迁就下游路由用了什么名字；
 * 哪个别名没映射上，是模型页的事。有效价(CNY) = 基准价(USD) × 渠道倍率。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { Delete, Edit, MoreFilled, Plus, Refresh } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

import PageHeader from '@/shared/ui/PageHeader.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import { confirmDanger } from '@/shared/composables/useConfirm';

import {
  PriceSourceKindLabel,
  canonicalizeModelKey,
  makerLabel,
  type BillingType,
  type ModelCapabilities,
  type ModelPrice,
  type ModelPriceMakerGroup,
  type UpsertModelPriceInput,
} from '@demux/common';
import { priceDisplay, type PriceModelKind } from '../model/priceTable';
import { getDemuxPricingPort } from '../services';
import ProviderWorkspaceLayout from '../components/provider/ProviderWorkspaceLayout.vue';
import ProviderDetailPanel from '../components/provider/ProviderDetailPanel.vue';
import RateEditDialog, { type RateDraft } from '../components/RateEditDialog.vue';
import PriceSyncDialog from '../components/pricing/PriceSyncDialog.vue';
import ModelKindMark from '../components/pricing/ModelKindMark.vue';
import MakerMark from '../components/pricing/MakerMark.vue';
import PriceCells from '../components/pricing/PriceCells.vue';
import { notifyCompile } from '../components/pricing/compileFeedback';

const pricingPort = getDemuxPricingPort();

const groups = ref<ModelPriceMakerGroup[]>([]);
const loading = ref(false);
const selectedMaker = ref<string | null>(null);

const totalModels = computed(() => groups.value.reduce((n, g) => n + g.items.length, 0));

const activeGroup = computed(() => {
  if (selectedMaker.value == null) return null;
  return groups.value.find((g) => g.maker === selectedMaker.value) ?? null;
});

const rows = computed(() => (activeGroup.value?.items ?? []).map(priceDisplay));

function selectMaker(maker: string): void {
  selectedMaker.value = maker;
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    const r = await pricingPort.listModelPricesByMaker({ keyword: '' });
    if (!r.success) {
      ElMessage.error(r.error.message);
      return;
    }
    groups.value = r.data;
    const keys = r.data.map((g) => g.maker);
    if (selectedMaker.value && keys.includes(selectedMaker.value)) return;
    selectedMaker.value = keys[0] ?? null;
  } finally {
    loading.value = false;
  }
}

watch(groups, (list) => {
  if (list.length === 0) return;
  if (selectedMaker.value && list.some((g) => g.maker === selectedMaker.value)) return;
  selectedMaker.value = list[0]!.maker;
});

// ---- 编辑 -----------------------------------------------------------------------

const dialogOpen = ref(false);
const dialogLoading = ref(false);
const editingKey = ref('');
const editingMaker = ref<string>('');
const editingDraft = ref<RateDraft | null>(null);
/** 官方目录给的模型能力，决定表单放出哪些档；手加的模型没有，给 null。 */
const editingCaps = ref<ModelCapabilities | null>(null);

const newKeyDialogOpen = ref(false);
const newKeyInput = ref('');
/**
 * 模型类型只在「新建模型」这一步问一次：官方拉取的模型类型由目录给，手加的没处可查。
 * 类型定了计量方式，所以填价那一步不再有「计费方式」可挑。向量化仍是 per_token，但只收入价。
 */
const newTypeInput = ref<PriceModelKind>('per_token');
const editingBilling = ref<BillingType>('per_token');

const MODEL_TYPE_OPTIONS: readonly {
  value: PriceModelKind;
  billingType: BillingType;
  label: string;
  meter: string;
}[] = [
  { value: 'per_token', billingType: 'per_token', label: '文本 / 对话', meter: '按 token' },
  { value: 'embedding', billingType: 'per_token', label: '向量化', meter: '按输入 token' },
  { value: 'per_image', billingType: 'per_image', label: '生图', meter: '按张' },
  { value: 'per_video', billingType: 'per_video', label: '视频', meter: '按秒' },
  { value: 'per_audio_minute', billingType: 'per_audio_minute', label: '音频转写', meter: '按分钟' },
  { value: 'per_character', billingType: 'per_character', label: '语音合成', meter: '按字符' },
  { value: 'per_call', billingType: 'per_call', label: '其它', meter: '按次' },
];

function priceToDraft(p: ModelPrice): RateDraft {
  return { billingType: p.billingType, rate: p.rate } as RateDraft;
}

function openEdit(p: ModelPrice): void {
  editingKey.value = p.modelKey;
  editingMaker.value = p.maker;
  editingDraft.value = priceToDraft(p);
  editingCaps.value = p.capabilities ?? null;
  editingBilling.value = p.billingType;
  dialogOpen.value = true;
}

/** 新建走两步：先在当前厂家下确定模型名和类型，再填价。厂家由左侧选中项决定，不另外选。 */
function openCreateModel(): void {
  newKeyInput.value = '';
  newTypeInput.value = 'per_token';
  newKeyDialogOpen.value = true;
}

function confirmNewKey(): void {
  const key = canonicalizeModelKey(newKeyInput.value);
  if (!key) {
    ElMessage.warning('请输入厂家发布的模型名，例如 claude-opus-5');
    return;
  }
  const maker = selectedMaker.value;
  if (!maker) return;
  if (activeGroup.value?.items.some((p) => p.modelKey === key)) {
    ElMessage.warning(`「${key}」已经在价格表里了`);
    return;
  }
  newKeyDialogOpen.value = false;
  editingKey.value = key;
  editingMaker.value = maker;
  editingDraft.value = null;
  const picked = MODEL_TYPE_OPTIONS.find((o) => o.value === newTypeInput.value)!;
  editingBilling.value = picked.billingType;
  editingCaps.value =
    picked.value === 'embedding' ? { audio: false, reasoning: false, embedding: true } : null;
  dialogOpen.value = true;
}

async function onSubmit(draft: RateDraft): Promise<void> {
  dialogLoading.value = true;
  try {
    const r = await pricingPort.upsertModelPrice({
      modelKey: editingKey.value,
      maker: editingMaker.value,
      billingType: draft.billingType,
      rate: draft.rate,
      ...(editingCaps.value ? { capabilities: editingCaps.value } : {}),
    } as UpsertModelPriceInput);
    if (r.success) {
      notifyCompile(`基准价 ${r.data.price.modelKey} 已保存`, r.data.compile);
      dialogOpen.value = false;
      selectedMaker.value = r.data.price.maker;
      await load();
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    dialogLoading.value = false;
  }
}

async function onDelete(p: ModelPrice): Promise<void> {
  const okp = await confirmDanger({
    title: '从价格表移除',
    message: `确认移除「${p.modelKey}」？映射到它的模型名将取不到价；已编译出的有效价原样保留，之后不再跟价。`,
    confirmText: '删除',
    type: 'warning',
  });
  if (!okp) return;
  const r = await pricingPort.deleteModelPrice(p.id);
  if (r.success) {
    ElMessage.success('已删除');
    await load();
  } else {
    ElMessage.error(r.error.message);
  }
}

// ---- 拉价 / 重算 -----------------------------------------------------------------

const syncOpen = ref(false);
const syncMaker = ref<string | null>(null);
const compiling = ref(false);

function openSync(maker: string | null): void {
  syncMaker.value = maker;
  syncOpen.value = true;
}

function onMore(cmd: string): void {
  if (cmd === 'sync-all') openSync(null);
  else if (cmd === 'compile') void onCompileAll();
}

async function onCompileAll(): Promise<void> {
  compiling.value = true;
  try {
    const r = await pricingPort.compile({ reason: 'console manual compile' });
    if (r.success) {
      notifyCompile('全量重算完成', r.data);
      await load();
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    compiling.value = false;
  }
}

/** 只标官方源；自己填的价没有「来源」可说，留空。 */
function sourceLabel(source: string): string {
  return (PriceSourceKindLabel as Record<string, string>)[source] ?? '';
}

onMounted(() => void load());
</script>

<template>
  <ProviderWorkspaceLayout :loading="loading && groups.length === 0">
    <template #header>
      <PageHeader title="价格表">
        <template #actions>
          <el-dropdown trigger="click" @command="onMore">
            <el-button :icon="MoreFilled" plain :loading="compiling" />
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="sync-all">全部上游同步</el-dropdown-item>
                <el-dropdown-item command="compile">全量重算有效价</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
      </PageHeader>
    </template>

    <aside class="provider-sidebar">
      <div class="provider-sidebar__list">
        <button
          v-for="g in groups"
          :key="g.maker"
          type="button"
          class="provider-sidebar__item maker-item"
          :class="{ 'provider-sidebar__item--active': selectedMaker === g.maker }"
          @click="selectMaker(g.maker)"
        >
          <MakerMark :maker="g.maker" />
          <span class="maker-item__body">
            <span class="maker-item__name">{{ makerLabel(g.maker) }}</span>
            <span class="maker-item__meta">{{ g.items.length }} 个模型</span>
          </span>
        </button>
        <p v-if="groups.length === 0 && !loading" class="provider-sidebar__empty">没有厂家</p>
      </div>
      <div class="maker-sidebar__foot">{{ totalModels }} 个模型</div>
    </aside>

    <ProviderDetailPanel :show-placeholder="!activeGroup">
      <template #placeholder>
        <EmptyState title="价格表是空的" />
      </template>

      <template #header>
        <div class="detail-main">
          <MakerMark :maker="activeGroup!.maker" />
          <div class="detail-ident">
            <h2 class="provider-detail__title">{{ makerLabel(activeGroup!.maker) }}</h2>
            <p class="detail-sub">{{ activeGroup!.items.length }} 个模型 · 美元牌价</p>
          </div>
        </div>
        <div class="detail-actions">
          <el-button :icon="Refresh" @click="openSync(activeGroup!.maker)">上游同步</el-button>
          <el-button :icon="Plus" type="primary" @click="openCreateModel">新建模型</el-button>
        </div>
      </template>

      <div class="price-list">
        <div v-if="rows.length > 0" class="price-row price-row--head">
          <span class="price-row__id">模型</span>
          <span class="price-row__type">类型</span>
          <span class="price-row__price">价格</span>
          <span class="price-row__ops"></span>
        </div>

        <article v-for="row in rows" :key="row.price.id" class="price-row">
          <div class="price-row__id">
            <div class="price-row__name">{{ row.price.modelKey }}</div>
            <div v-if="row.note || sourceLabel(row.price.source)" class="price-row__hint">
              {{ [row.note, sourceLabel(row.price.source)].filter(Boolean).join(' · ') }}
            </div>
          </div>
          <div class="price-row__type">
            <ModelKindMark :kind="row.kind" />
          </div>
          <div class="price-row__price">
            <PriceCells :model="row" />
          </div>
          <div class="price-row__ops">
            <el-button :icon="Edit" link @click="openEdit(row.price)" />
            <el-button :icon="Delete" link type="danger" @click="onDelete(row.price)" />
          </div>
        </article>

        <EmptyState
          v-if="rows.length === 0"
          class="price-list__empty"
          title="这家还没有模型"
        />
      </div>
    </ProviderDetailPanel>

    <RateEditDialog
      v-model="dialogOpen"
      :subject-key="editingKey"
      :initial="editingDraft"
      :billing-type="editingBilling"
      :capabilities="editingCaps"
      :loading="dialogLoading"
      title-noun="基准价"
      @submit="onSubmit"
    />

    <el-dialog v-model="newKeyDialogOpen" width="420px" :close-on-click-modal="false">
      <template #header>
        <div class="new-model-head">
          <span class="new-model-head__noun">新建模型</span>
          <span class="new-model-head__maker">{{ makerLabel(selectedMaker ?? '') }}</span>
        </div>
      </template>
      <el-input
        v-model="newKeyInput"
        placeholder="gpt-5.2 / claude-sonnet-4-6"
        clearable
        autofocus
        @keyup.enter="confirmNewKey"
      />
      <div class="new-model-types">
        <button
          v-for="opt in MODEL_TYPE_OPTIONS"
          :key="opt.value"
          type="button"
          class="type-card"
          :class="{ 'type-card--active': newTypeInput === opt.value }"
          :data-kind="opt.value"
          @click="newTypeInput = opt.value"
        >
          <span class="type-card__mark">
            <ModelKindMark :kind="opt.value" icon-only />
          </span>
          <span class="type-card__name">{{ opt.label }}</span>
          <span class="type-card__meter">{{ opt.meter }}</span>
        </button>
      </div>
      <p class="new-model-tip">
        填厂家发布的模型名。渠道用什么别名叫它，是模型页去映射的事。<br />
        模型类型定了怎么计量，下一步的表单跟着它变——官方拉来的模型不问这一步，目录里有。
      </p>
      <template #footer>
        <el-button @click="newKeyDialogOpen = false">取消</el-button>
        <el-button type="primary" @click="confirmNewKey">下一步：填价</el-button>
      </template>
    </el-dialog>

    <PriceSyncDialog v-model="syncOpen" :maker="syncMaker" @applied="load" />
  </ProviderWorkspaceLayout>
</template>

<style scoped>
.maker-item {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  padding: 10px 10px;
  line-height: 1;
}
.maker-item__body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
}
.maker-item__name {
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.3;
}
.maker-item__meta {
  font-size: 12px;
  line-height: 1.3;
  color: var(--el-text-color-secondary);
}
.maker-sidebar__foot {
  padding: 10px 14px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  border-top: 1px solid var(--el-border-color-lighter);
}

.detail-main {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}
.detail-ident {
  min-width: 0;
}
.detail-sub {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.detail-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
:deep(.provider-detail__header) {
  align-items: center;
}

.new-model-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.new-model-head__noun {
  font-size: 16px;
  font-weight: 600;
}
.new-model-head__maker {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.new-model-types {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 12px;
}
.type-card {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr);
  grid-template-rows: auto auto;
  column-gap: 8px;
  row-gap: 1px;
  align-items: center;
  padding: 9px 10px;
  border: 1px solid var(--el-border-color);
  border-radius: 9px;
  background: var(--el-bg-color);
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.15s,
    background 0.15s;
}
.type-card:hover {
  border-color: var(--el-border-color-darker);
}
.type-card--active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.type-card__mark {
  grid-row: 1 / 3;
  display: flex;
}
.type-card__name {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}
.type-card--active .type-card__name {
  color: var(--el-color-primary);
}
.type-card__meter {
  font-size: 11.5px;
  color: var(--el-text-color-secondary);
}

.new-model-tip {
  margin: 12px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

/*
 * 列宽必须由整张表算，不能每行自己 grid：否则「图像」比「LLM」宽，
 * 类型列和价格列的左边缘一行一个位置，看起来就是歪的。
 */
.price-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: grid;
  /* 价格列要容下两档（入/出），不能被模型名那列挤成 0。 */
  grid-template-columns: minmax(140px, 1fr) max-content minmax(220px, 1.2fr) 64px;
  column-gap: 16px;
  align-content: start;
  padding: 0 12px 8px;
}
.price-list__empty {
  grid-column: 1 / -1;
}
.price-row {
  display: grid;
  grid-template-columns: subgrid;
  grid-column: 1 / -1;
  align-items: center;
  padding: 11px 0;
  border-bottom: 1px solid var(--el-border-color-extra-light);
}
.price-row:not(.price-row--head):hover {
  background: var(--el-fill-color-light);
}
.price-row--head {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 0 0 7px;
  background: var(--el-bg-color);
  border-bottom-color: var(--el-border-color-lighter);
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.price-row__price {
  min-width: 0;
  /* 只把类型和价格拉开；加在整表 column-gap 上会连模型名一起垫宽。 */
  padding-left: 28px;
}
.price-row__id {
  min-width: 0;
}
.price-row__type {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  min-height: 26px;
  text-align: left;
}
.price-row__type :deep(.el-tooltip__trigger) {
  display: inline-flex;
  justify-content: flex-start;
}
.price-row__name {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: -0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.price-row__hint {
  margin-top: 3px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.price-row__ops {
  display: flex;
  justify-content: flex-end;
  align-items: center;
}
</style>
