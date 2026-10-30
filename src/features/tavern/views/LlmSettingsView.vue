<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import {
  ArrowRight,
  Bell,
  ChatLineRound,
  Clock,
  Cpu,
  Document,
  Flag,
  Grid,
  Guide,
  List,
  Refresh,
  Sort,
  User,
  VideoCamera,
  View,
} from '@element-plus/icons-vue';
import type { Component } from 'vue';

import PageHeader from '@/shared/ui/PageHeader.vue';
import { formatDateTime } from '@/shared/lib/date';
import PipelineModelDialog from '../components/PipelineModelDialog.vue';
import { sameModelId, splitModelId } from '../model/llmCatalog';
import type {
  LlmPipelineAdmin,
  LlmPlatformModelOption,
  LlmPlatformSettingsAdmin,
} from '../model/llmSettings.types';
import { getTavernLlmSettingsPort } from '../services';

const port = getTavernLlmSettingsPort();
const loading = ref(false);
const saving = ref(false);
const status = ref<LlmPlatformSettingsAdmin | null>(null);
const draft = reactive<Record<string, string | null>>({});
const snapshot = ref<Record<string, string | null>>({});

const pickerPipeline = ref<LlmPipelineAdmin | null>(null);
const pickerVisible = ref(false);
const catalog = ref<LlmPlatformModelOption[]>([]);
const catalogLoading = ref(false);
const catalogLoaded = ref(false);

interface Section {
  key: string;
  title: string;
  subtitle: string;
  ids: string[];
}

const SECTIONS: Section[] = [
  {
    key: 'actor',
    title: '角色侧',
    subtitle: '对话、互动与自主唤醒',
    ids: ['dialogue', 'interaction', 'wake'],
  },
  {
    key: 'world',
    title: '世界侧',
    subtitle: '世界逻辑、事件与导演',
    ids: ['worldLogic', 'events', 'showrunner', 'director'],
  },
  {
    key: 'summary',
    title: '归纳侧',
    subtitle: '纪事、时间线与滚动摘要',
    ids: ['chronicle', 'timeline', 'summary'],
  },
  {
    key: 'perception',
    title: '感知与检索',
    subtitle: '识图、向量化与重排',
    ids: ['vision', 'embeddings', 'ranking'],
  },
];

const PIPELINE_META: Record<string, { icon: Component; tone: string }> = {
  dialogue: { icon: ChatLineRound, tone: 'blue' },
  interaction: { icon: User, tone: 'teal' },
  wake: { icon: Bell, tone: 'amber' },
  worldLogic: { icon: Cpu, tone: 'violet' },
  events: { icon: Flag, tone: 'rose' },
  showrunner: { icon: VideoCamera, tone: 'amber' },
  director: { icon: Guide, tone: 'indigo' },
  chronicle: { icon: Document, tone: 'green' },
  timeline: { icon: Clock, tone: 'cyan' },
  summary: { icon: List, tone: 'orange' },
  vision: { icon: View, tone: 'violet' },
  embeddings: { icon: Grid, tone: 'teal' },
  ranking: { icon: Sort, tone: 'amber' },
};

/** 服务端在 LlmPipelineRegistry 新加、这里还没归组的管线，不能因为没写进分组就看不见。 */
const sections = computed(() => {
  const pipelines = status.value?.pipelines ?? [];
  const byId = new Map(pipelines.map((pipeline) => [pipeline.id, pipeline]));
  const grouped = new Set(SECTIONS.flatMap((section) => section.ids));

  const result = SECTIONS.map((section) => ({
    ...section,
    pipelines: section.ids
      .map((id) => byId.get(id))
      .filter((pipeline): pipeline is LlmPipelineAdmin => pipeline != null),
  }));

  const rest = pipelines.filter((pipeline) => !grouped.has(pipeline.id));
  if (rest.length > 0) {
    result.push({
      key: 'other',
      title: '其他',
      subtitle: '尚未归组的管线',
      ids: rest.map((pipeline) => pipeline.id),
      pipelines: rest,
    });
  }

  return result.filter((section) => section.pipelines.length > 0);
});

const isDirty = computed(() => {
  for (const pipeline of status.value?.pipelines ?? []) {
    const current = draft[pipeline.id] ?? null;
    const saved = snapshot.value[pipeline.id] ?? null;
    if (current !== saved) return true;
  }
  return false;
});

function applyStatus(next: LlmPlatformSettingsAdmin): void {
  status.value = next;
  const configured: Record<string, string | null> = {};
  for (const pipeline of next.pipelines) {
    configured[pipeline.id] = pipeline.configured;
    draft[pipeline.id] = pipeline.configured;
  }
  snapshot.value = { ...configured };
}

function pipelineValue(pipelineId: string): { channel: string; name: string } | null {
  const configured = draft[pipelineId] ?? null;
  return configured ? splitModelId(configured) : null;
}

/** 已保存的 id 在目录里找不到：供应商下线、改了渠道名，或者模型被撤。调用时会直接失败。 */
function isMissingFromCatalog(pipelineId: string): boolean {
  const configured = draft[pipelineId] ?? null;
  if (!configured || !catalogLoaded.value) return false;
  return !catalog.value.some((model) => sameModelId(model.id, configured));
}

function isExplicitlySet(pipelineId: string): boolean {
  return draft[pipelineId] != null;
}

function isPipelineDirty(pipelineId: string): boolean {
  return (draft[pipelineId] ?? null) !== (snapshot.value[pipelineId] ?? null);
}

async function loadCatalog(): Promise<void> {
  if (catalogLoading.value) return;
  catalogLoading.value = true;
  try {
    const r = await port.listCatalog();
    if (r.success) {
      catalog.value = r.data;
      catalogLoaded.value = true;
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    catalogLoading.value = false;
  }
}

function openPicker(pipeline: LlmPipelineAdmin): void {
  pickerPipeline.value = pipeline;
  pickerVisible.value = true;
  if (!catalogLoaded.value) void loadCatalog();
}

function applyPick(value: string | null): void {
  if (!pickerPipeline.value) return;
  draft[pickerPipeline.value.id] = value;
}

async function loadSettings(): Promise<void> {
  loading.value = true;
  try {
    const r = await port.get();
    if (r.success) {
      applyStatus(r.data);
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    loading.value = false;
  }
}

function load(): void {
  void loadSettings();
  void loadCatalog();
}

function reset(): void {
  for (const [id, value] of Object.entries(snapshot.value)) {
    draft[id] = value;
  }
}

async function save(): Promise<void> {
  if (!status.value || !isDirty.value) return;

  saving.value = true;
  try {
    const pipelines: Record<string, string | null> = {};
    for (const pipeline of status.value.pipelines) {
      pipelines[pipeline.id] = draft[pipeline.id] ?? null;
    }
    const r = await port.update({ pipelines });
    if (r.success) {
      applyStatus(r.data);
      ElMessage.success('已保存');
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div
    v-loading="loading"
    class="pipeline-settings"
    :class="{ 'pipeline-settings--dirty': isDirty }"
  >
    <PageHeader
      title="管线设置"
      description="为每条职能管线指定平台全局默认模型；世界与演员可在各自层级覆盖。"
    >
      <template #actions>
        <el-button
          :icon="Refresh"
          :disabled="loading || saving"
          @click="load"
        >
          刷新
        </el-button>
      </template>
    </PageHeader>

    <div class="pipeline-settings__body">
      <section
        v-for="section in sections"
        :key="section.key"
        class="pipeline-settings__section"
      >
        <header class="pipeline-settings__section-head">
          <h2 class="pipeline-settings__section-title">{{ section.title }}</h2>
          <p class="pipeline-settings__section-sub">{{ section.subtitle }}</p>
        </header>

        <div class="pipeline-settings__card">
          <button
            v-for="(pipeline, index) in section.pipelines"
            :key="pipeline.id"
            type="button"
            class="pipeline-settings__cell"
            :class="{
              'pipeline-settings__cell--set': isExplicitlySet(pipeline.id),
              'pipeline-settings__cell--dirty': isPipelineDirty(pipeline.id),
            }"
            @click="openPicker(pipeline)"
          >
            <span
              v-if="index > 0"
              class="pipeline-settings__divider"
              aria-hidden="true"
            />
            <span
              class="pipeline-settings__icon"
              :class="`pipeline-settings__icon--${PIPELINE_META[pipeline.id]?.tone ?? 'blue'}`"
            >
              <el-icon :size="18">
                <component :is="PIPELINE_META[pipeline.id]?.icon ?? ChatLineRound" />
              </el-icon>
            </span>
            <span class="pipeline-settings__cell-main">
              <span class="pipeline-settings__cell-title">{{ pipeline.label }}</span>
              <span class="pipeline-settings__cell-hint">{{ pipeline.hint }}</span>
              <span
                v-if="pipelineValue(pipeline.id)"
                class="pipeline-settings__cell-value pipeline-settings__cell-value--set"
              >
                <span
                  v-if="pipelineValue(pipeline.id)!.channel"
                  class="pipeline-settings__channel"
                >{{ pipelineValue(pipeline.id)!.channel }}</span>
                <span class="pipeline-settings__model">{{ pipelineValue(pipeline.id)!.name }}</span>
                <span
                  v-if="isMissingFromCatalog(pipeline.id)"
                  class="pipeline-settings__missing"
                >不在目录</span>
              </span>
              <span
                v-else
                class="pipeline-settings__cell-value"
              >自动</span>
            </span>
            <el-icon
              class="pipeline-settings__chev"
              :size="16"
            >
              <ArrowRight />
            </el-icon>
          </button>
        </div>
      </section>

      <p
        v-if="status"
        class="pipeline-settings__meta"
      >
        最近更新 {{ formatDateTime(status.updatedAtUtc) }} · 「自动」表示这条管线不指定模型 ·
        「不在目录」表示已保存的模型当前没有供应商发布，调用会失败
      </p>
    </div>

    <transition name="pipeline-settings-bar">
      <footer
        v-if="isDirty"
        class="pipeline-settings__bar"
      >
        <span class="pipeline-settings__bar-text">有未保存的更改</span>
        <div class="pipeline-settings__bar-actions">
          <el-button
            :disabled="saving"
            @click="reset"
          >
            撤销
          </el-button>
          <el-button
            type="primary"
            :loading="saving"
            @click="save"
          >
            保存
          </el-button>
        </div>
      </footer>
    </transition>

    <PipelineModelDialog
      v-model="pickerVisible"
      :pipeline="pickerPipeline"
      :catalog="catalog"
      :loading="catalogLoading"
      :value="pickerPipeline ? (draft[pickerPipeline.id] ?? null) : null"
      :saved="pickerPipeline ? (snapshot[pickerPipeline.id] ?? null) : null"
      @confirm="applyPick"
    >
      <template #header>
        <div
          v-if="pickerPipeline"
          class="pipeline-settings__dialog-head"
        >
          <span
            class="pipeline-settings__dialog-icon"
            :class="`pipeline-settings__icon--${PIPELINE_META[pickerPipeline.id]?.tone ?? 'blue'}`"
          >
            <el-icon :size="20">
              <component :is="PIPELINE_META[pickerPipeline.id]?.icon ?? ChatLineRound" />
            </el-icon>
          </span>
          <div class="pipeline-settings__dialog-copy">
            <h3 class="pipeline-settings__dialog-title">{{ pickerPipeline.label }}</h3>
            <p class="pipeline-settings__dialog-sub">{{ pickerPipeline.hint }}</p>
          </div>
        </div>
      </template>
    </PipelineModelDialog>
  </div>
</template>

<style scoped>
.pipeline-settings {
  padding: 0 4px 24px;
}

.pipeline-settings--dirty {
  padding-bottom: 88px;
}

.pipeline-settings__body {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.pipeline-settings__section-head {
  margin-bottom: 10px;
}

.pipeline-settings__section-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.pipeline-settings__section-sub {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.pipeline-settings__card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  overflow: hidden;
  background: var(--el-bg-color);
}

.pipeline-settings__cell {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 14px 16px;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.15s;
}

.pipeline-settings__cell:hover {
  background: var(--el-fill-color-light);
}

.pipeline-settings__cell--dirty {
  background: color-mix(in srgb, var(--el-color-primary) 6%, transparent);
}

.pipeline-settings__divider {
  position: absolute;
  top: 0;
  right: 16px;
  left: 66px;
  height: 1px;
  background: var(--el-border-color-lighter);
}

.pipeline-settings__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 10px;
  flex-shrink: 0;
}

.pipeline-settings__icon--blue {
  color: #3b82f6;
  background: rgba(59, 130, 246, 0.12);
}

.pipeline-settings__icon--teal {
  color: #14b8a6;
  background: rgba(20, 184, 166, 0.12);
}

.pipeline-settings__icon--amber {
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.14);
}

.pipeline-settings__icon--violet {
  color: #8b5cf6;
  background: rgba(139, 92, 246, 0.12);
}

.pipeline-settings__icon--rose {
  color: #f43f5e;
  background: rgba(244, 63, 94, 0.12);
}

.pipeline-settings__icon--indigo {
  color: #6366f1;
  background: rgba(99, 102, 241, 0.12);
}

.pipeline-settings__icon--green {
  color: #22c55e;
  background: rgba(34, 197, 94, 0.12);
}

.pipeline-settings__icon--cyan {
  color: #06b6d4;
  background: rgba(6, 182, 212, 0.12);
}

.pipeline-settings__icon--orange {
  color: #f97316;
  background: rgba(249, 115, 22, 0.12);
}

.pipeline-settings__cell-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.pipeline-settings__cell-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.pipeline-settings__cell-hint {
  font-size: 12px;
  line-height: 1.45;
  color: var(--el-text-color-secondary);
}

.pipeline-settings__cell-value {
  margin-top: 4px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.pipeline-settings__cell-value--set {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  color: var(--el-color-primary);
  font-weight: 500;
}

.pipeline-settings__channel {
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 400;
  color: var(--el-text-color-regular);
  background: var(--el-fill-color);
}

.pipeline-settings__model {
  word-break: break-all;
}

.pipeline-settings__missing {
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 400;
  color: var(--el-color-warning-dark-2);
  background: color-mix(in srgb, var(--el-color-warning) 14%, transparent);
}

.pipeline-settings__chev {
  flex-shrink: 0;
  color: var(--el-text-color-placeholder);
}

.pipeline-settings__meta {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.pipeline-settings__bar {
  position: fixed;
  right: 24px;
  bottom: 24px;
  left: calc(var(--meeko-sider-width, 220px) + 24px);
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  background: var(--el-bg-color);
  box-shadow: var(--el-box-shadow-light);
}

.pipeline-settings__bar-text {
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.pipeline-settings__bar-actions {
  display: flex;
  gap: 8px;
}

.pipeline-settings-bar-enter-active,
.pipeline-settings-bar-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.pipeline-settings-bar-enter-from,
.pipeline-settings-bar-leave-to {
  opacity: 0;
  transform: translateY(12px);
}

.pipeline-settings__dialog-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
}

.pipeline-settings__dialog-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  flex-shrink: 0;
}

.pipeline-settings__dialog-copy {
  min-width: 0;
}

.pipeline-settings__dialog-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.pipeline-settings__dialog-sub {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}
</style>
