<script setup lang="ts">
/**
 * 管线选模型：左栏渠道、右栏该渠道的模型。
 * 选择先落在弹窗内，「确定」才写回页面草稿；「取消」不改动任何值。
 */
import { computed, ref, watch } from 'vue';
import { Check, Search } from '@element-plus/icons-vue';

import {
  entryMatches,
  groupCatalog,
  sameModelId,
  splitModelId,
  type CatalogChannel,
  type CatalogEntry,
} from '../model/llmCatalog';
import type { LlmPipelineAdmin, LlmPlatformModelOption } from '../model/llmSettings.types';

const props = defineProps<{
  modelValue: boolean;
  pipeline: LlmPipelineAdmin | null;
  catalog: LlmPlatformModelOption[];
  loading: boolean;
  /** 页面草稿里的当前值；null = 自动。 */
  value: string | null;
  /** 服务端已保存的值，目录里没有时仍要列出来。 */
  saved: string | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  confirm: [value: string | null];
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

const selection = ref<string | null>(null);
const activeChannelId = ref<string | null>(null);
const query = ref('');

const channels = computed<CatalogChannel[]>(() =>
  props.pipeline
    ? groupCatalog(props.catalog, props.pipeline.purpose, [props.value, props.saved])
    : [],
);

const filteredChannels = computed(() =>
  channels.value
    .map((channel) => ({
      channel,
      entries: channel.entries.filter((entry) => entryMatches(channel, entry, query.value)),
    }))
    .filter((item) => !query.value.trim() || item.entries.length > 0),
);

const activeItem = computed(
  () =>
    filteredChannels.value.find((item) => item.channel.id === activeChannelId.value) ??
    filteredChannels.value[0] ??
    null,
);

const selectionParts = computed(() => (selection.value ? splitModelId(selection.value) : null));

function channelLabel(id: string): string {
  return id || '未分渠道';
}

function channelHoldsSelection(channel: CatalogChannel): boolean {
  return channel.entries.some((entry) => sameModelId(entry.id, selection.value));
}

function selectableCount(entries: CatalogEntry[]): number {
  return entries.filter((entry) => !entry.unfit).length;
}

function pick(entry: CatalogEntry): void {
  if (entry.unfit) return;
  selection.value = entry.id;
}

function pickAndConfirm(entry: CatalogEntry): void {
  if (entry.unfit) return;
  selection.value = entry.id;
  confirm();
}

function pickAutoAndConfirm(): void {
  selection.value = null;
  confirm();
}

function confirm(): void {
  emit('confirm', selection.value);
  visible.value = false;
}

function focusChannelOfSelection(): void {
  const holder = channels.value.find(channelHoldsSelection);
  activeChannelId.value = holder?.id ?? channels.value[0]?.id ?? null;
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    selection.value = props.value;
    query.value = '';
    focusChannelOfSelection();
  },
  { immediate: true },
);

// 目录晚于弹窗到达时，打开那一刻还没有渠道可定位。
watch(
  () => props.catalog,
  () => {
    if (props.modelValue && !channels.value.some((c) => c.id === activeChannelId.value)) {
      focusChannelOfSelection();
    }
  },
);
</script>

<template>
  <el-dialog
    v-model="visible"
    width="min(880px, 94vw)"
    top="8vh"
    append-to-body
    class="pipeline-model-dialog"
  >
    <template #header>
      <slot name="header" />
    </template>

    <div class="pmd">
      <div class="pmd__toolbar">
        <button
          type="button"
          class="pmd__auto"
          :class="{ 'pmd__auto--active': selection === null }"
          @click="selection = null"
          @dblclick="pickAutoAndConfirm"
        >
          <span class="pmd__auto-label">自动</span>
          <span class="pmd__auto-hint">不指定模型</span>
          <el-icon
            v-if="selection === null"
            class="pmd__check"
            :size="16"
          >
            <Check />
          </el-icon>
        </button>
        <el-input
          v-model="query"
          class="pmd__search"
          placeholder="搜索渠道或模型"
          clearable
          :prefix-icon="Search"
        />
      </div>

      <div
        v-loading="loading"
        class="pmd__panes"
      >
        <nav class="pmd__channels">
          <p class="pmd__pane-title">渠道</p>
          <div class="pmd__scroll">
            <button
              v-for="item in filteredChannels"
              :key="item.channel.id"
              type="button"
              class="pmd__channel"
              :class="{
                'pmd__channel--active': activeItem?.channel.id === item.channel.id,
                'pmd__channel--unfit': selectableCount(item.entries) === 0,
              }"
              @click="activeChannelId = item.channel.id"
            >
              <span class="pmd__channel-name">{{ channelLabel(item.channel.id) }}</span>
              <span
                v-if="channelHoldsSelection(item.channel)"
                class="pmd__channel-dot"
                aria-label="当前选择在此渠道"
              />
              <span class="pmd__channel-count">{{ selectableCount(item.entries) }}</span>
            </button>
            <p
              v-if="!loading && filteredChannels.length === 0"
              class="pmd__empty"
            >
              {{ query.trim() ? '没有匹配的渠道或模型' : '目录为空：还没有供应商发布模型' }}
            </p>
          </div>
        </nav>

        <section class="pmd__models">
          <p
            v-if="activeItem"
            class="pmd__pane-title"
          >
            {{ channelLabel(activeItem.channel.id) }}
            <span class="pmd__pane-sub">
              {{ selectableCount(activeItem.entries) }} / {{ activeItem.entries.length }} 可选
            </span>
          </p>
          <div class="pmd__scroll">
            <button
              v-for="entry in activeItem?.entries ?? []"
              :key="entry.id"
              type="button"
              class="pmd__model"
              :class="{
                'pmd__model--active': sameModelId(entry.id, selection),
                'pmd__model--unfit': entry.unfit,
              }"
              :disabled="entry.unfit != null"
              :title="entry.unfit ?? entry.id"
              @click="pick(entry)"
              @dblclick="pickAndConfirm(entry)"
            >
              <span class="pmd__model-main">
                <span class="pmd__model-name">{{ entry.name }}</span>
                <span class="pmd__model-tags">
                  <span
                    v-if="entry.vision"
                    class="pmd__tag"
                  >识图</span>
                  <span
                    v-if="!entry.model"
                    class="pmd__tag pmd__tag--warn"
                  >不在目录</span>
                  <span
                    v-if="entry.unfit"
                    class="pmd__unfit"
                  >{{ entry.unfit }}</span>
                </span>
              </span>
              <el-icon
                v-if="sameModelId(entry.id, selection)"
                class="pmd__check"
                :size="16"
              >
                <Check />
              </el-icon>
            </button>
          </div>
        </section>
      </div>
    </div>

    <template #footer>
      <div class="pmd__foot">
        <span class="pmd__current">
          已选
          <template v-if="selectionParts">
            <span
              v-if="selectionParts.channel"
              class="pmd__current-channel"
            >{{ selectionParts.channel }}</span>
            <strong>{{ selectionParts.name }}</strong>
          </template>
          <strong v-else>自动</strong>
        </span>
        <div class="pmd__foot-actions">
          <el-button @click="visible = false">取消</el-button>
          <el-button
            type="primary"
            @click="confirm"
          >
            确定
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.pmd {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pmd__toolbar {
  display: flex;
  align-items: stretch;
  gap: 12px;
}

.pmd__auto {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
  padding: 8px 14px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  background: var(--el-bg-color);
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.15s,
    background-color 0.15s;
}

.pmd__auto:hover {
  border-color: var(--el-color-primary-light-5);
  background: var(--el-fill-color-light);
}

.pmd__auto--active {
  border-color: var(--el-color-primary-light-3);
  background: color-mix(in srgb, var(--el-color-primary) 8%, transparent);
}

.pmd__auto-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.pmd__auto--active .pmd__auto-label {
  color: var(--el-color-primary);
}

.pmd__auto-hint {
  flex: 1;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.pmd__search {
  width: 260px;
  flex-shrink: 0;
}

.pmd__panes {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  height: min(56vh, 520px);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  overflow: hidden;
}

.pmd__channels {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-lighter);
}

.pmd__models {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.pmd__pane-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0;
  padding: 12px 14px 8px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--el-text-color-secondary);
}

.pmd__pane-sub {
  font-weight: 400;
  color: var(--el-text-color-placeholder);
}

.pmd__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 8px 8px;
}

.pmd__channel {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  color: var(--el-text-color-regular);
}

.pmd__channel:hover {
  background: var(--el-fill-color);
}

.pmd__channel--active {
  background: var(--el-bg-color);
  box-shadow: 0 0 0 1px var(--el-border-color-light);
  color: var(--el-text-color-primary);
  font-weight: 600;
}

.pmd__channel--unfit {
  color: var(--el-text-color-placeholder);
}

.pmd__channel-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pmd__channel-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--el-color-primary);
  flex-shrink: 0;
}

.pmd__channel-count {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-secondary);
}

.pmd__model {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  margin-bottom: 4px;
  padding: 9px 12px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.15s,
    background-color 0.15s;
}

.pmd__model:hover:not(:disabled) {
  background: var(--el-fill-color-light);
}

.pmd__model--active {
  border-color: var(--el-color-primary-light-3);
  background: color-mix(in srgb, var(--el-color-primary) 8%, transparent);
}

.pmd__model--unfit {
  cursor: not-allowed;
}

.pmd__model-main {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  min-width: 0;
}

.pmd__model-name {
  font-size: 13px;
  color: var(--el-text-color-primary);
  word-break: break-all;
}

.pmd__model--active .pmd__model-name {
  color: var(--el-color-primary);
  font-weight: 500;
}

.pmd__model--unfit .pmd__model-name {
  color: var(--el-text-color-placeholder);
}

.pmd__model-tags {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.pmd__tag {
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  line-height: 16px;
  color: var(--el-color-primary);
  background: color-mix(in srgb, var(--el-color-primary) 10%, transparent);
}

.pmd__tag--warn {
  color: var(--el-color-warning-dark-2);
  background: color-mix(in srgb, var(--el-color-warning) 14%, transparent);
}

.pmd__unfit {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}

.pmd__check {
  flex-shrink: 0;
  color: var(--el-color-primary);
}

.pmd__empty {
  margin: 12px 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.pmd__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.pmd__current {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.pmd__current strong {
  overflow: hidden;
  font-weight: 500;
  color: var(--el-text-color-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pmd__current-channel {
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 12px;
  color: var(--el-text-color-regular);
  background: var(--el-fill-color);
}

.pmd__foot-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

@media (max-width: 640px) {
  .pmd__toolbar {
    flex-direction: column;
  }

  .pmd__search {
    width: 100%;
  }

  .pmd__panes {
    grid-template-columns: 130px minmax(0, 1fr);
  }
}
</style>
