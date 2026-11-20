<script setup lang="ts">
/**
 * 上游同步：打开就拉 models.dev 的候选价（只读），和表里现有的列成一张对比表；勾上的行才写进表里。
 * 牌价进账单之前必须有人看过，所以没有「拉下来直接盖」这条路。
 * 一个模型有多条候选时用号池后台排在最前的那条。
 */
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Loading, Refresh } from '@element-plus/icons-vue';

import { makerLabel } from '@yomi/common';

import { applyItems, defaultPicked, failureText, syncRows, type SyncRow } from '../../model/ratecard';
import type { PriceApplyResult, PriceFetchResult } from '../../model/ratecard.types';
import { getOneApiRatecardPort } from '../../services';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    /** 只拉这一家；null = 全部。 */
    maker?: string | null;
  }>(),
  { maker: null },
);

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'applied', result: PriceApplyResult): void;
}>();

const port = getOneApiRatecardPort();

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const title = computed(() => `上游同步 · ${props.maker ? makerLabel(props.maker) : '全部'}`);

const fetching = ref(false);
const fetchError = ref<string | null>(null);
const result = ref<PriceFetchResult | null>(null);
/** 勾上 = 用上游的价写这一行。 */
const picked = ref<Set<string>>(new Set());
const filterMode = ref<'changed' | 'all'>('changed');
const applying = ref(false);

// 拉一次可能要十几秒，期间弹窗可能被关掉又为另一家打开：晚到的旧结果不能盖掉新的
let fetchSeq = 0;

const rows = computed<SyncRow[]>(() => (result.value ? syncRows(result.value) : []));
const changedRows = computed(() => rows.value.filter((r) => r.status !== 'same'));
const visibleRows = computed(() => (filterMode.value === 'all' ? rows.value : changedRows.value));
const visibleChanged = computed(() => visibleRows.value.filter((r) => r.status !== 'same'));

const failedSources = computed(() => (result.value?.sources ?? []).filter((s) => !s.ok));

const pickedCount = computed(() => picked.value.size);

const allVisiblePicked = computed(
  () => visibleChanged.value.length > 0 && visibleChanged.value.every((r) => picked.value.has(r.item.modelKey)),
);
const someVisiblePicked = computed(
  () => !allVisiblePicked.value && visibleChanged.value.some((r) => picked.value.has(r.item.modelKey)),
);

function togglePick(row: SyncRow): void {
  if (row.status === 'same' || applying.value) return;
  const next = new Set(picked.value);
  if (next.has(row.item.modelKey)) next.delete(row.item.modelKey);
  else next.add(row.item.modelKey);
  picked.value = next;
}

function toggleAllVisible(on: boolean): void {
  const next = new Set(picked.value);
  for (const row of visibleChanged.value) {
    if (on) next.add(row.item.modelKey);
    else next.delete(row.item.modelKey);
  }
  picked.value = next;
}

async function doFetch(): Promise<void> {
  const mine = ++fetchSeq;
  fetching.value = true;
  fetchError.value = null;
  try {
    const r = await port.fetchCandidates({ maker: props.maker });
    if (mine !== fetchSeq) return;
    if (r.success) {
      result.value = r.data;
      picked.value = defaultPicked(syncRows(r.data));
    } else {
      result.value = null;
      fetchError.value = failureText(r.error);
    }
  } finally {
    if (mine === fetchSeq) fetching.value = false;
  }
}

async function doApply(): Promise<void> {
  const items = applyItems(rows.value, picked.value);
  if (items.length === 0) return;
  applying.value = true;
  try {
    const r = await port.applyCandidates(items);
    if (!r.success) {
      ElMessage.error(failureText(r.error));
      return;
    }
    visible.value = false;
    emit('applied', r.data);
  } finally {
    applying.value = false;
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) {
      // 关掉以后还在路上的结果作废
      fetchSeq += 1;
      return;
    }
    result.value = null;
    picked.value = new Set();
    filterMode.value = 'changed';
    applying.value = false;
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
  >
    <div
      v-if="fetching && !result"
      class="sync-loading"
    >
      <el-icon
        class="is-loading"
        :size="18"
      >
        <Loading />
      </el-icon>
      正在拉取上游牌价…
    </div>

    <div
      v-else-if="fetchError && !result"
      class="sync-error"
    >
      <p>{{ fetchError }}</p>
      <el-button
        :icon="Refresh"
        @click="doFetch"
      >
        重试
      </el-button>
    </div>

    <template v-else-if="result">
      <div class="diff-toolbar">
        <el-radio-group
          v-model="filterMode"
          size="small"
        >
          <el-radio-button value="changed">
            有差异 {{ changedRows.length }}
          </el-radio-button>
          <el-radio-button value="all">
            全部 {{ rows.length }}
          </el-radio-button>
        </el-radio-group>
        <el-button
          size="small"
          link
          :icon="Refresh"
          :loading="fetching"
          :disabled="applying"
          @click="doFetch"
        >
          重新拉取
        </el-button>
        <span class="diff-count">已勾 {{ pickedCount }} 条</span>
      </div>

      <!-- 有来源没拉到时候选是不全的（比如补 1 小时缓存写价的那一份）：得让人看见，再决定套不套 -->
      <ul
        v-if="failedSources.length > 0"
        class="source-failures"
      >
        <li
          v-for="s in failedSources"
          :key="`${s.kind}:${s.name}`"
        >
          {{ s.name }} 没拉到：{{ s.error }}
        </li>
      </ul>

      <div class="diff-scroller">
        <table
          v-if="visibleRows.length > 0"
          class="diff-table"
        >
          <thead>
            <tr>
              <th class="col-check">
                <el-checkbox
                  :model-value="allVisiblePicked"
                  :indeterminate="someVisiblePicked"
                  :disabled="visibleChanged.length === 0 || applying"
                  @change="toggleAllVisible($event as boolean)"
                />
              </th>
              <th v-if="!maker">
                厂家
              </th>
              <th>模型</th>
              <th>当前</th>
              <th>上游</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in visibleRows"
              :key="row.item.modelKey"
              class="diff-row"
              :class="{
                'diff-row--picked': picked.has(row.item.modelKey),
                'diff-row--same': row.status === 'same',
              }"
              @click="togglePick(row)"
            >
              <td
                class="col-check"
                @click.stop
              >
                <el-checkbox
                  :model-value="picked.has(row.item.modelKey)"
                  :disabled="row.status === 'same' || applying"
                  @change="togglePick(row)"
                />
              </td>
              <td
                v-if="!maker"
                class="col-maker"
              >
                {{ makerLabel(row.item.maker) }}
              </td>
              <td class="col-key">
                {{ row.item.modelKey }}
                <el-tag
                  v-if="row.status === 'new'"
                  size="small"
                  type="success"
                  effect="plain"
                >
                  新增
                </el-tag>
                <el-tag
                  v-else-if="row.status === 'changed'"
                  size="small"
                  type="warning"
                  effect="plain"
                >
                  变价
                </el-tag>
              </td>
              <td class="col-price">
                {{ row.currentText }}
              </td>
              <td class="col-price col-upstream">
                {{ row.candidateText }}
              </td>
            </tr>
          </tbody>
        </table>
        <div
          v-else
          class="diff-empty"
        >
          {{ filterMode === 'changed' && rows.length > 0 ? '上游的价和表里的一致' : '上游没有可对比的模型' }}
        </div>
      </div>
    </template>

    <template #footer>
      <el-button
        :disabled="applying"
        @click="visible = false"
      >
        关闭
      </el-button>
      <el-button
        type="primary"
        :disabled="!result || pickedCount === 0 || fetching"
        :loading="applying"
        @click="doApply"
      >
        套用{{ pickedCount > 0 ? ` ${pickedCount} 条` : '' }}
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
.source-failures {
  margin: 0 0 8px;
  padding: 0;
  list-style: none;
  font-size: 12.5px;
  color: var(--el-color-warning-dark-2);
  overflow-wrap: anywhere;
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
.col-key .el-tag {
  margin-left: 4px;
  font-family: var(--el-font-family);
  font-weight: 400;
  letter-spacing: 0;
}
.col-price {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--el-text-color-regular);
}
.col-upstream {
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
.diff-row--same .col-upstream {
  color: var(--el-text-color-secondary);
}
.diff-empty {
  padding: 24px;
  text-align: center;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
</style>
