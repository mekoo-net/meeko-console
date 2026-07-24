<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import {
  ArrowRight,
  Bell,
  ChatLineRound,
  Check,
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
  View,
} from '@element-plus/icons-vue';
import type { Component } from 'vue';

import PageHeader from '@/shared/ui/PageHeader.vue';
import { formatDateTime } from '@/shared/lib/date';
import type { LlmPipelineAdmin, LlmPlatformSettingsAdmin } from '../model/llmSettings.types';
import { getTavernLlmSettingsPort } from '../services';

const FOLLOW_VALUE = '__follow__';

const port = getTavernLlmSettingsPort();
const loading = ref(false);
const saving = ref(false);
const status = ref<LlmPlatformSettingsAdmin | null>(null);
const draft = reactive<Record<string, string | null>>({});
const snapshot = ref<Record<string, string | null>>({});

const pickerPipeline = ref<LlmPipelineAdmin | null>(null);
const drawerVisible = ref(false);

const SECTIONS = [
  { key: 'actor', title: '角色侧', subtitle: '对话、互动与自主唤醒' },
  { key: 'world', title: '世界侧', subtitle: '世界逻辑、事件与导演' },
  { key: 'summary', title: '归纳侧', subtitle: '纪事、时间线与滚动摘要' },
  { key: 'perception', title: '感知与检索', subtitle: '识图、向量化与重排' },
] as const;

const SECTION_IDS: Record<(typeof SECTIONS)[number]['key'], string[]> = {
  actor: ['dialogue', 'interaction', 'wake'],
  world: ['worldLogic', 'events', 'director'],
  summary: ['chronicle', 'timeline', 'summary'],
  perception: ['vision', 'embeddings', 'ranking'],
};

const PIPELINE_META: Record<string, { icon: Component; tone: string }> = {
  dialogue: { icon: ChatLineRound, tone: 'blue' },
  interaction: { icon: User, tone: 'teal' },
  wake: { icon: Bell, tone: 'amber' },
  worldLogic: { icon: Cpu, tone: 'violet' },
  events: { icon: Flag, tone: 'rose' },
  director: { icon: Guide, tone: 'indigo' },
  chronicle: { icon: Document, tone: 'green' },
  timeline: { icon: Clock, tone: 'cyan' },
  summary: { icon: List, tone: 'orange' },
  vision: { icon: View, tone: 'violet' },
  embeddings: { icon: Grid, tone: 'teal' },
  ranking: { icon: Sort, tone: 'amber' },
};

const pipelineById = computed(() => {
  const map = new Map<string, LlmPipelineAdmin>();
  for (const pipeline of status.value?.pipelines ?? []) {
    map.set(pipeline.id, pipeline);
  }
  return map;
});

const modelLabelById = computed(() => {
  const map = new Map<string, string>();
  for (const model of status.value?.models ?? []) {
    map.set(model.id, model.label);
  }
  return map;
});

const isDirty = computed(() => {
  for (const pipeline of status.value?.pipelines ?? []) {
    const current = draft[pipeline.id] ?? null;
    const saved = snapshot.value[pipeline.id] ?? null;
    if (current !== saved) return true;
  }
  return false;
});

const pickerValue = computed({
  get: () => {
    if (!pickerPipeline.value) return FOLLOW_VALUE;
    return draft[pickerPipeline.value.id] ?? FOLLOW_VALUE;
  },
  set: (value: string) => {
    if (!pickerPipeline.value) return;
    draft[pickerPipeline.value.id] = value === FOLLOW_VALUE ? null : value;
  },
});

const pickerAutoHint = computed(() => {
  const pipeline = pickerPipeline.value;
  if (!pipeline) return '暂无候选模型';
  const first = pipeline.candidates[0];
  return first
    ? `不单独指定时，使用已发布目录首个候选：${modelLabel(first)}`
    : '暂无候选模型';
});

function selectPickerValue(value: string): void {
  pickerValue.value = value;
}

function modelLabel(id: string | null | undefined): string {
  if (!id) return '—';
  return modelLabelById.value.get(id) ?? id;
}

function applyStatus(next: LlmPlatformSettingsAdmin): void {
  status.value = next;
  const configured: Record<string, string | null> = {};
  for (const pipeline of next.pipelines) {
    configured[pipeline.id] = pipeline.configured;
    draft[pipeline.id] = pipeline.configured;
  }
  snapshot.value = { ...configured };
}

function effectiveFor(pipeline: LlmPipelineAdmin): string | null {
  const configured = draft[pipeline.id] ?? null;
  if (configured && pipeline.candidates.includes(configured)) return configured;
  return pipeline.candidates[0] ?? null;
}

function pipelineValueLabel(pipeline: LlmPipelineAdmin): string {
  const configured = draft[pipeline.id] ?? null;
  if (configured) return modelLabel(configured);
  const effective = effectiveFor(pipeline);
  return effective ? `自动 · ${modelLabel(effective)}` : '自动';
}

function isExplicitlySet(pipelineId: string): boolean {
  return draft[pipelineId] != null;
}

function isPipelineDirty(pipelineId: string): boolean {
  return (draft[pipelineId] ?? null) !== (snapshot.value[pipelineId] ?? null);
}

function sectionPipelines(key: (typeof SECTIONS)[number]['key']): LlmPipelineAdmin[] {
  return SECTION_IDS[key]
    .map((id) => pipelineById.value.get(id))
    .filter((pipeline): pipeline is LlmPipelineAdmin => pipeline != null);
}

function openPicker(pipeline: LlmPipelineAdmin): void {
  if (pipeline.candidates.length === 0) {
    ElMessage.warning('该管线暂无可用候选模型');
    return;
  }
  pickerPipeline.value = pipeline;
  drawerVisible.value = true;
}

function closePicker(): void {
  drawerVisible.value = false;
  pickerPipeline.value = null;
}

async function load(): Promise<void> {
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

onMounted(() => {
  void load();
});
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
        v-for="section in SECTIONS"
        :key="section.key"
        class="pipeline-settings__section"
      >
        <header class="pipeline-settings__section-head">
          <h2 class="pipeline-settings__section-title">{{ section.title }}</h2>
          <p class="pipeline-settings__section-sub">{{ section.subtitle }}</p>
        </header>

        <div class="pipeline-settings__card">
          <button
            v-for="(pipeline, index) in sectionPipelines(section.key)"
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
                class="pipeline-settings__cell-value"
                :class="{ 'pipeline-settings__cell-value--set': isExplicitlySet(pipeline.id) }"
              >
                {{ pipelineValueLabel(pipeline) }}
              </span>
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
        最近更新 {{ formatDateTime(status.updatedAtUtc) }} · 选「自动」时，使用该管线在已发布目录中的首个候选模型
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

    <el-drawer
      v-model="drawerVisible"
      size="400px"
      destroy-on-close
      class="pipeline-settings__drawer"
      @closed="closePicker"
    >
      <template #header>
        <div
          v-if="pickerPipeline"
          class="pipeline-settings__drawer-head"
        >
          <span
            class="pipeline-settings__drawer-icon"
            :class="`pipeline-settings__icon--${PIPELINE_META[pickerPipeline.id]?.tone ?? 'blue'}`"
          >
            <el-icon :size="20">
              <component :is="PIPELINE_META[pickerPipeline.id]?.icon ?? ChatLineRound" />
            </el-icon>
          </span>
          <div class="pipeline-settings__drawer-copy">
            <h3 class="pipeline-settings__drawer-title">{{ pickerPipeline.label }}</h3>
            <p class="pipeline-settings__drawer-sub">{{ pickerPipeline.hint }}</p>
          </div>
        </div>
      </template>

      <div
        v-if="pickerPipeline"
        class="pipeline-settings__picker"
      >
        <button
          type="button"
          class="pipeline-settings__pick"
          :class="{ 'pipeline-settings__pick--active': pickerValue === FOLLOW_VALUE }"
          @click="selectPickerValue(FOLLOW_VALUE)"
        >
          <span class="pipeline-settings__pick-main">
            <span class="pipeline-settings__pick-label">自动</span>
            <span class="pipeline-settings__pick-hint">{{ pickerAutoHint }}</span>
          </span>
          <el-icon
            v-if="pickerValue === FOLLOW_VALUE"
            class="pipeline-settings__pick-check"
            :size="18"
          >
            <Check />
          </el-icon>
        </button>

        <p class="pipeline-settings__pick-section">指定模型</p>

        <div class="pipeline-settings__pick-list">
          <button
            v-for="id in pickerPipeline.candidates"
            :key="id"
            type="button"
            class="pipeline-settings__pick"
            :class="{ 'pipeline-settings__pick--active': pickerValue === id }"
            @click="selectPickerValue(id)"
          >
            <span class="pipeline-settings__pick-main">
              <span class="pipeline-settings__pick-label">{{ modelLabel(id) }}</span>
              <span class="pipeline-settings__pick-hint">{{ id }}</span>
            </span>
            <el-icon
              v-if="pickerValue === id"
              class="pipeline-settings__pick-check"
              :size="18"
            >
              <Check />
            </el-icon>
          </button>
        </div>
      </div>

      <template #footer>
        <div class="pipeline-settings__drawer-foot">
          <el-button @click="drawerVisible = false">取消</el-button>
          <el-button
            type="primary"
            @click="drawerVisible = false"
          >
            完成
          </el-button>
        </div>
      </template>
    </el-drawer>
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
  color: var(--el-color-primary);
  font-weight: 500;
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

.pipeline-settings__drawer :deep(.el-drawer__header) {
  margin-bottom: 0;
  padding-bottom: 12px;
}

.pipeline-settings__drawer :deep(.el-drawer__body) {
  padding-top: 4px;
}

.pipeline-settings__drawer-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
}

.pipeline-settings__drawer-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  flex-shrink: 0;
}

.pipeline-settings__drawer-copy {
  min-width: 0;
}

.pipeline-settings__drawer-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.pipeline-settings__drawer-sub {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}

.pipeline-settings__picker {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pipeline-settings__pick-section {
  margin: 6px 0 0;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--el-text-color-secondary);
}

.pipeline-settings__pick-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: calc(100vh - 320px);
  overflow-y: auto;
  padding-right: 2px;
}

.pipeline-settings__pick {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  background: var(--el-bg-color);
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.15s,
    background-color 0.15s,
    box-shadow 0.15s;
}

.pipeline-settings__pick:hover {
  border-color: var(--el-color-primary-light-5);
  background: var(--el-fill-color-light);
}

.pipeline-settings__pick--active {
  border-color: var(--el-color-primary-light-3);
  background: color-mix(in srgb, var(--el-color-primary) 8%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--el-color-primary) 12%, transparent);
}

.pipeline-settings__pick-main {
  flex: 1;
  min-width: 0;
}

.pipeline-settings__pick-label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.pipeline-settings__pick--active .pipeline-settings__pick-label {
  color: var(--el-color-primary);
}

.pipeline-settings__pick-hint {
  display: block;
  margin-top: 3px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--el-text-color-secondary);
  word-break: break-all;
}

.pipeline-settings__pick-check {
  flex-shrink: 0;
  color: var(--el-color-primary);
}

.pipeline-settings__drawer-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
