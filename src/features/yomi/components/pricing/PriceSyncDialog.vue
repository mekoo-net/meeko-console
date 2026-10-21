<script setup lang="ts">
/**
 * 同步官方价：打开就拉 models.dev，用一张表列出当前 vs 官方。
 * 勾上的行套用官方价。源只有一份官方目录，没有「选价格源」。
 */
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Loading, Refresh } from '@element-plus/icons-vue';

import {
  compareMakers,
  makerLabel,
  type ApplyPriceItem,
  type FetchCandidate,
  type FetchPriceItem,
  type FetchPricesResult,
} from '@yomi/common';
import { rateBodySummary } from '../../model/rateSummary';
import { getYomiPricingPort } from '../../services';
import { notifyCompile } from './compileFeedback';

interface Props {
  modelValue: boolean;
  /** 只拉这家厂商；null = 全部。 */
  maker?: string | null;
}

const props = withDefaults(defineProps<Props>(), { maker: null });
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'applied'): void;
}>();

const pricingPort = getYomiPricingPort();

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const title = computed(() =>
  props.maker ? `同步 ${makerLabel(props.maker)} 官方价` : '同步官方价',
);

const fetching = ref(false);
const fetchError = ref<string | null>(null);
const result = ref<FetchPricesResult | null>(null);
/** 勾上 = 用官方价覆盖这一行。 */
const picked = ref<Set<string>>(new Set());
const filterMode = ref<'changed' | 'all'>('changed');
const applying = ref(false);

function officialOf(item: FetchPriceItem): FetchCandidate | null {
  return item.candidates[0] ?? null;
}

function isChanged(item: FetchPriceItem): boolean {
  const c = officialOf(item);
  return c != null && !c.sameAsCurrent;
}

function defaultPicked(r: FetchPricesResult): Set<string> {
  return new Set(r.items.filter(isChanged).map((it) => it.modelKey));
}

const visibleItems = computed<FetchPriceItem[]>(() => {
  const r = result.value;
  if (!r) return [];
  const items = filterMode.value === 'all' ? r.items : r.items.filter(isChanged);
  if (props.maker) return items;
  return [...items].sort((a, b) => compareMakers(a.maker, b.maker) || a.modelKey.localeCompare(b.modelKey));
});

const changedCount = computed(() => result.value?.items.filter(isChanged).length ?? 0);
const pickedCount = computed(() => picked.value.size);

const allVisiblePicked = computed(() => {
  const rows = visibleItems.value.filter(isChanged);
  return rows.length > 0 && rows.every((it) => picked.value.has(it.modelKey));
});

const someVisiblePicked = computed(() => {
  const rows = visibleItems.value.filter(isChanged);
  const n = rows.filter((it) => picked.value.has(it.modelKey)).length;
  return n > 0 && n < rows.length;
});

function isPicked(item: FetchPriceItem): boolean {
  return picked.value.has(item.modelKey);
}

function togglePick(item: FetchPriceItem): void {
  if (!isChanged(item)) return;
  const next = new Set(picked.value);
  if (next.has(item.modelKey)) next.delete(item.modelKey);
  else next.add(item.modelKey);
  picked.value = next;
}

function toggleAllVisible(on: boolean): void {
  const next = new Set(picked.value);
  for (const item of visibleItems.value) {
    if (!isChanged(item)) continue;
    if (on) next.add(item.modelKey);
    else next.delete(item.modelKey);
  }
  picked.value = next;
}

function currentText(item: FetchPriceItem): string {
  return item.current ? rateBodySummary(item.current) : '—';
}

function officialText(item: FetchPriceItem): string {
  const c = officialOf(item);
  return c ? rateBodySummary(c) : '—';
}

async function doFetch(): Promise<void> {
  fetching.value = true;
  fetchError.value = null;
  try {
    const r = await pricingPort.fetchPrices({
      sources: [{ kind: 'models_dev', name: 'models.dev' }],
      makers: props.maker ? [props.maker] : undefined,
    });
    if (r.success) {
      result.value = r.data;
      picked.value = defaultPicked(r.data);
      const failed = r.data.sources.filter((s) => !s.ok);
      if (failed.length > 0) {
        fetchError.value = `${failed.map((s) => s.name).join('、')} 抓取失败`;
      }
    } else {
      result.value = null;
      fetchError.value = r.error.message;
    }
  } finally {
    fetching.value = false;
  }
}

async function doApply(): Promise<void> {
  const r = result.value;
  if (!r) return;
  const items: ApplyPriceItem[] = [];
  for (const item of r.items) {
    if (!picked.value.has(item.modelKey)) continue;
    const c = officialOf(item);
    if (!c || c.sameAsCurrent) continue;
    items.push({
      modelKey: item.modelKey,
      maker: c.maker || item.maker,
      billingType: c.billingType,
      rate: c.rate,
      sourceKind: c.sourceKind,
      sourceRef: c.sourceRef,
      capabilities: c.capabilities ?? null,
    } as ApplyPriceItem);
  }
  if (items.length === 0) {
    ElMessage.warning('没有勾选任何差异');
    return;
  }
  applying.value = true;
  try {
    const res = await pricingPort.applyPrices({ items, reason: 'console price sync' });
    if (res.success) {
      notifyCompile(`已对齐 ${items.length} 条基准价`, res.data);
      visible.value = false;
      emit('applied');
    } else {
      ElMessage.error(res.error.message);
    }
  } finally {
    applying.value = false;
  }
}

function reset(): void {
  result.value = null;
  picked.value = new Set();
  filterMode.value = 'changed';
  fetchError.value = null;
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    reset();
    void doFetch();
  },
);
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="title"
    width="920px"
    top="8vh"
    :close-on-click-modal="false"
    class="sync-dialog"
  >
    <div v-if="fetching && !result" class="sync-loading">
      <el-icon class="is-loading" :size="18"><Loading /></el-icon>
      正在拉取{{ props.maker ? ` ${makerLabel(props.maker)}` : '' }}官方价…
    </div>

    <div v-else-if="fetchError && !result" class="sync-error">
      <p>{{ fetchError }}</p>
      <el-button :icon="Refresh" @click="doFetch">重试</el-button>
    </div>

    <template v-else-if="result">
      <div class="diff-toolbar">
        <el-radio-group v-model="filterMode" size="small">
          <el-radio-button value="changed">有差异 {{ changedCount }}</el-radio-button>
          <el-radio-button value="all">全部 {{ result.items.length }}</el-radio-button>
        </el-radio-group>
        <el-button size="small" link :icon="Refresh" :loading="fetching" @click="doFetch">重新拉取</el-button>
        <span class="diff-count">已勾 {{ pickedCount }} 条</span>
      </div>

      <div class="diff-scroller">
        <table v-if="visibleItems.length > 0" class="diff-table">
          <thead>
            <tr>
              <th class="col-check">
                <el-checkbox
                  :model-value="allVisiblePicked"
                  :indeterminate="someVisiblePicked"
                  :disabled="changedCount === 0"
                  @change="toggleAllVisible($event as boolean)"
                />
              </th>
              <th v-if="!props.maker">厂家</th>
              <th>模型</th>
              <th>当前</th>
              <th>官方</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in visibleItems"
              :key="item.modelKey"
              class="diff-row"
              :class="{
                'diff-row--picked': isPicked(item),
                'diff-row--same': !isChanged(item),
              }"
              @click="togglePick(item)"
            >
              <td class="col-check" @click.stop>
                <el-checkbox
                  :model-value="isPicked(item)"
                  :disabled="!isChanged(item)"
                  @change="togglePick(item)"
                />
              </td>
              <td v-if="!props.maker" class="col-maker">{{ makerLabel(item.maker) }}</td>
              <td class="col-key">{{ item.modelKey }}</td>
              <td class="col-price">{{ currentText(item) }}</td>
              <td class="col-price col-official">{{ officialText(item) }}</td>
            </tr>
          </tbody>
        </table>
        <div v-else class="diff-empty">
          {{ filterMode === 'changed' ? '官方价与当前基准价一致，没有要对齐的。' : '目录里没有这家的模型。' }}
        </div>
      </div>
    </template>

    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
      <el-button
        type="primary"
        :disabled="!result || pickedCount === 0"
        :loading="applying"
        @click="doApply"
      >
        对齐差异{{ pickedCount > 0 ? ` ${pickedCount}` : '' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.sync-loading,
.sync-error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 160px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.sync-error {
  flex-direction: column;
}
.diff-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}
.diff-count {
  margin-left: auto;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.diff-scroller {
  max-height: 52vh;
  overflow: auto;
}
.diff-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
.diff-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 0 10px 8px;
  background: var(--el-bg-color);
  text-align: left;
  font-size: 12px;
  font-weight: 500;
  color: var(--el-text-color-secondary);
}
.diff-table td {
  padding: 9px 10px;
  border-top: 1px solid var(--el-border-color-extra-light);
  vertical-align: top;
  font-size: 13px;
}
.col-check {
  width: 36px;
  text-align: center;
}
.col-maker {
  width: 88px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}
.col-key {
  width: 28%;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-weight: 600;
  letter-spacing: -0.01em;
  word-break: break-all;
}
.col-price {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--el-text-color-regular);
}
.col-official {
  color: var(--el-text-color-primary);
}
.diff-row {
  cursor: pointer;
}
.diff-row:hover td {
  background: var(--el-fill-color-light);
}
.diff-row--picked td {
  background: var(--el-color-primary-light-9);
}
.diff-row--same {
  cursor: default;
}
.diff-row--same .col-official {
  color: var(--el-text-color-secondary);
}
.diff-empty {
  padding: 24px;
  text-align: center;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
</style>
