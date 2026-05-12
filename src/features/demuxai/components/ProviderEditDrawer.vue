<script setup lang="ts">
/**
 * 供应商编辑抽屉（新模型）。
 *
 * 数据模型上承 `provider.types.ts`：
 *  - **供应商模型** `providerModels[]`：本 Provider 下登记的「上游模型实体」
 *    （`modelName` + family + capabilities + ctx/out 上限 + 最低可见 LV）
 *  - **对外上架** `modelMappings[]`：把某个供应商模型用 `displayName` 上架，
 *    支持权重 / 启停 / 排序；同一 providerModel 可以挂多条不同 displayName
 *    的映射（套餐 / 灰度等场景）
 *
 * 编辑流程典型路径：
 *  1. 填基础信息 + 调度参数
 *  2. 「拉取上游模型」→ 候选池里点「添加」进 `providerModels`
 *  3. 在卡片里精修 family / capabilities / 上下文上限
 *  4. 在「对外上架」表里挂 `displayName`（一键自动上架 / 手工新增均可）
 */
import { computed, ref, watch } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import {
  CirclePlus,
  Delete,
  DocumentCopy,
  Download,
  Edit,
  InfoFilled,
  Top,
} from '@element-plus/icons-vue';

import { fromNow } from '@/shared/lib/date';

import {
  apiTypeValues,
  ApiTypeLabel,
  modelCapabilityValues,
  ModelCapabilityLabel,
  modelFamilyValues,
  ModelFamilyLabel,
  type ApiType,
} from '../model/enums';
import type {
  CreateProviderInput,
  Provider,
  ProviderModelDraft,
  ProviderModelMappingDraft,
  UpdateProviderInput,
} from '../model/provider.types';
import { getDemuxaiProviderPort } from '../services';
import {
  defaultCapabilitiesForFamily,
  inferFamily,
} from '../services/mock/data';

interface Props {
  modelValue: boolean;
  provider: Provider | null;
  loading: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (
    e: 'submit',
    payload: { create?: CreateProviderInput; update?: UpdateProviderInput },
  ): void;
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const isEdit = computed(() => props.provider !== null);

interface FormState {
  name: string;
  apiType: ApiType;
  baseUrl: string;
  apiKey: string;
  notes: string;
  providerModels: ProviderModelDraft[];
  modelMappings: ProviderModelMappingDraft[];
}

const emptyForm = (): FormState => ({
  name: '',
  apiType: 'openai',
  baseUrl: '',
  apiKey: '',
  notes: '',
  providerModels: [],
  modelMappings: [],
});

const form = ref<FormState>(emptyForm());
const formRef = ref<FormInstance | null>(null);

const upstreamCandidates = ref<string[]>([]);
const upstreamFetchedAt = ref<string | null>(null);
const fetchingUpstream = ref(false);

/** 当前正在编辑详情的 ProviderModel uid（null = 全部折叠） */
const editingPmUid = ref<string | null>(null);

let tmpPmSeq = 0;
let tmpMpSeq = 0;
function newTmpPmUid(): string {
  tmpPmSeq += 1;
  return `tmp-pm-${tmpPmSeq}`;
}
function newTmpMpUid(): string {
  tmpMpSeq += 1;
  return `tmp-mp-${tmpMpSeq}`;
}

const rules: FormRules<FormState> = {
  name: [{ required: true, min: 1, max: 64, message: '名称 1..64 字符', trigger: 'blur' }],
  apiType: [{ required: true, message: '请选择协议类型', trigger: 'change' }],
  baseUrl: [{ required: true, message: '请填写 baseUrl', trigger: 'blur' }],
  apiKey: [
    {
      validator: (_r, value: string, cb) => {
        if (isEdit.value && (!value || value.trim() === '')) return cb();
        if (!value || value.trim().length < 8) return cb(new Error('API Key 至少 8 位'));
        cb();
      },
      trigger: 'blur',
    },
  ],
};

watch(
  () => [props.modelValue, props.provider] as const,
  ([open, p]) => {
    if (!open) return;
    tmpPmSeq = 0;
    tmpMpSeq = 0;
    editingPmUid.value = null;
    if (p) {
      form.value = {
        name: p.name,
        apiType: p.apiType,
        baseUrl: p.baseUrl,
        apiKey: '',
        notes: p.notes ?? '',
        providerModels: p.providerModels.map((m) => ({
          uid: m.uid,
          modelName: m.modelName,
          family: m.family,
          capabilities: [...m.capabilities],
          visibleMinTier: m.visibleMinTier,
          maxContextTokens: m.maxContextTokens,
          maxOutputTokens: m.maxOutputTokens ?? null,
        })),
        modelMappings: p.modelMappings.map((m) => ({
          uid: m.uid,
          providerModelUid: m.providerModelUid,
          displayName: m.displayName,
          enabled: m.enabled,
          notes: m.notes ?? null,
        })),
      };
      void onFetchUpstream({ silent: true });
    } else {
      form.value = emptyForm();
      upstreamCandidates.value = [];
      upstreamFetchedAt.value = null;
    }
  },
  { immediate: true },
);

function onApiTypeChange(): void {
  upstreamCandidates.value = [];
  upstreamFetchedAt.value = null;
}

async function copyText(text: string): Promise<void> {
  const t = text.trim();
  if (!t) return;
  try {
    await navigator.clipboard.writeText(t);
    ElMessage.success('已复制');
  } catch {
    ElMessage.error('复制失败');
  }
}

async function onFetchUpstream(opts?: { silent?: boolean }): Promise<void> {
  if (!form.value.baseUrl.trim()) {
    if (!opts?.silent) ElMessage.warning('请先填写 baseUrl');
    return;
  }
  if (!isEdit.value && (!form.value.apiKey || form.value.apiKey.trim().length < 8)) {
    if (!opts?.silent) ElMessage.warning('请先填写 API Key');
    return;
  }
  fetchingUpstream.value = true;
  try {
    const port = getDemuxaiProviderPort();
    const res = await port.fetchUpstreamModels({
      apiType: form.value.apiType,
      baseUrl: form.value.baseUrl,
      apiKey: form.value.apiKey || undefined,
      providerUid: isEdit.value ? props.provider?.uid : undefined,
    });
    if (!res.success) {
      if (!opts?.silent) ElMessage.error(res.error.message);
      return;
    }
    upstreamCandidates.value = [...res.data.upstreamModelNames];
    upstreamFetchedAt.value = new Date().toISOString();
    if (!opts?.silent) {
      ElMessage.success(`已拉取 ${res.data.upstreamModelNames.length} 个上游模型`);
    }
  } finally {
    fetchingUpstream.value = false;
  }
}

const hasUpstreamFetched = computed(() => upstreamCandidates.value.length > 0);

const registeredModelNames = computed(
  () => new Set(form.value.providerModels.map((m) => m.modelName.trim()).filter(Boolean)),
);

const unregisteredCandidates = computed(() =>
  upstreamCandidates.value.filter((n) => !registeredModelNames.value.has(n)),
);

const pmByUid = computed(() => {
  const m = new Map<string, ProviderModelDraft>();
  for (const it of form.value.providerModels) m.set(it.uid, it);
  return m;
});

const mappingCountByPm = computed(() => {
  const m = new Map<string, number>();
  for (const it of form.value.modelMappings) {
    m.set(it.providerModelUid, (m.get(it.providerModelUid) ?? 0) + 1);
  }
  return m;
});

/** 同一 displayName 的多条映射（同 Provider 内），用于提示"加权分流" */
const displayNameCount = computed(() => {
  const m = new Map<string, number>();
  for (const it of form.value.modelMappings) {
    const key = it.displayName.trim();
    if (!key) continue;
    m.set(key, (m.get(key) ?? 0) + 1);
  }
  return m;
});

function addProviderModelFromUpstream(modelName: string): void {
  if (registeredModelNames.value.has(modelName)) {
    ElMessage.warning(`供应商模型 "${modelName}" 已登记`);
    return;
  }
  const family = inferFamily(modelName);
  const uid = newTmpPmUid();
  form.value.providerModels.push({
    uid,
    modelName,
    family,
    capabilities: defaultCapabilitiesForFamily(family),
    visibleMinTier: 1,
    maxContextTokens: 8192,
    maxOutputTokens: null,
  });
}

function addEmptyProviderModel(): void {
  const uid = newTmpPmUid();
  form.value.providerModels.push({
    uid,
    modelName: '',
    family: 'gpt',
    capabilities: ['chat'],
    visibleMinTier: 1,
    maxContextTokens: 8192,
    maxOutputTokens: null,
  });
  editingPmUid.value = uid;
}

function removeProviderModel(uid: string): void {
  const cascade = form.value.modelMappings.filter((m) => m.providerModelUid === uid);
  if (cascade.length > 0) {
    const names = cascade.map((c) => `「${c.displayName || '<未命名>'}」`).join('、');
    ElMessage.warning(`已同步移除 ${cascade.length} 条上架映射：${names}`);
  }
  form.value.providerModels = form.value.providerModels.filter((m) => m.uid !== uid);
  form.value.modelMappings = form.value.modelMappings.filter(
    (m) => m.providerModelUid !== uid,
  );
  if (editingPmUid.value === uid) editingPmUid.value = null;
}

function toggleEdit(uid: string): void {
  editingPmUid.value = editingPmUid.value === uid ? null : uid;
}

function onPmModelNameBlur(pm: ProviderModelDraft): void {
  const trimmed = pm.modelName.trim();
  if (!trimmed) return;
  const family = inferFamily(trimmed);
  if (pm.family === 'gpt' && family !== 'gpt') pm.family = family;
}

function addMappingForModel(pmUid: string, opts?: { displayName?: string }): void {
  const pm = pmByUid.value.get(pmUid);
  if (!pm) return;
  form.value.modelMappings.push({
    uid: newTmpMpUid(),
    providerModelUid: pmUid,
    displayName: opts?.displayName ?? pm.modelName,
    enabled: true,
    notes: null,
  });
}

function autoFillMappings(): void {
  const referenced = new Set(form.value.modelMappings.map((m) => m.providerModelUid));
  let count = 0;
  for (const pm of form.value.providerModels) {
    if (referenced.has(pm.uid)) continue;
    if (!pm.modelName.trim()) continue;
    addMappingForModel(pm.uid);
    count += 1;
  }
  if (count === 0) {
    ElMessage.info('所有供应商模型都已有上架映射');
  } else {
    ElMessage.success(`已为 ${count} 个供应商模型生成默认上架`);
  }
}

function addEmptyMapping(): void {
  const first = form.value.providerModels[0];
  if (!first) {
    ElMessage.warning('请先在「供应商模型」里登记至少一个 modelName');
    return;
  }
  addMappingForModel(first.uid, { displayName: '' });
}

function removeMapping(uid: string): void {
  form.value.modelMappings = form.value.modelMappings.filter((m) => m.uid !== uid);
}

function validateLists(): string | null {
  const seenNames = new Set<string>();
  for (let i = 0; i < form.value.providerModels.length; i += 1) {
    const m = form.value.providerModels[i]!;
    const name = m.modelName.trim();
    if (!name) return `供应商模型第 ${i + 1} 行：modelName 不能为空`;
    if (seenNames.has(name)) {
      return `供应商模型 "${name}" 重复（同一 Provider 内 modelName 必须唯一）`;
    }
    seenNames.add(name);
    if (!Number.isFinite(m.maxContextTokens) || m.maxContextTokens <= 0) {
      return `供应商模型 "${name}" 的上下文上限必须 > 0`;
    }
    if (
      m.maxOutputTokens !== null &&
      m.maxOutputTokens !== undefined &&
      m.maxOutputTokens > m.maxContextTokens
    ) {
      return `供应商模型 "${name}" 的输出上限不能大于上下文上限`;
    }
    if (!m.capabilities.length) {
      return `供应商模型 "${name}" 至少选择一项能力`;
    }
  }
  const known = new Set(form.value.providerModels.map((m) => m.uid));
  for (let i = 0; i < form.value.modelMappings.length; i += 1) {
    const m = form.value.modelMappings[i]!;
    if (!m.displayName.trim()) return `对外上架第 ${i + 1} 行：displayName 不能为空`;
    if (!known.has(m.providerModelUid)) {
      return `对外上架 "${m.displayName}" 引用的供应商模型不存在`;
    }
  }
  return null;
}

async function onSubmit(): Promise<void> {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;

  const err = validateLists();
  if (err) {
    ElMessage.error(err);
    return;
  }

  const providerModels: ProviderModelDraft[] = form.value.providerModels.map((m) => ({
    uid: m.uid,
    modelName: m.modelName.trim(),
    family: m.family,
    capabilities: [...m.capabilities],
    visibleMinTier: m.visibleMinTier,
    maxContextTokens: m.maxContextTokens,
    maxOutputTokens: m.maxOutputTokens ?? null,
  }));
  const modelMappings: ProviderModelMappingDraft[] = form.value.modelMappings.map((m) => ({
    uid: m.uid,
    providerModelUid: m.providerModelUid,
    displayName: m.displayName.trim(),
    enabled: m.enabled,
    notes: m.notes?.trim() || null,
  }));

  if (isEdit.value) {
    const patch: UpdateProviderInput = {
      name: form.value.name,
      baseUrl: form.value.baseUrl,
      notes: form.value.notes || null,
      providerModels,
      modelMappings,
    };
    if (form.value.apiKey.trim() !== '') patch.apiKey = form.value.apiKey;
    emit('submit', { update: patch });
  } else {
    const create: CreateProviderInput = {
      name: form.value.name,
      apiType: form.value.apiType,
      baseUrl: form.value.baseUrl,
      apiKey: form.value.apiKey,
      notes: form.value.notes || null,
      providerModels,
      modelMappings,
    };
    emit('submit', { create });
  }
}

const familyOptions = modelFamilyValues.map((f) => ({ value: f, label: ModelFamilyLabel[f] }));
const capabilityOptions = modelCapabilityValues.map((c) => ({
  value: c,
  label: ModelCapabilityLabel[c],
}));

function tokensLabel(n: number): string {
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(n);
}

/**
 * 显示用排序：当前 MVP 阶段没有 sortOrder 字段，回退到 displayName 字典序。
 * 后续把 sortOrder 加回来时只需替换比较函数。
 */
const sortedMappings = computed<ProviderModelMappingDraft[]>(() =>
  [...form.value.modelMappings].sort((a, b) => a.displayName.localeCompare(b.displayName)),
);
</script>

<template>
  <el-drawer
    v-model="visible"
    :title="isEdit ? `编辑供应商 · ${provider?.name ?? ''}` : '新建供应商'"
    direction="rtl"
    size="980px"
    :close-on-click-modal="false"
  >
    <div class="drawer-body">
      <!-- ============ ① 基础信息 ============ -->
      <section class="section">
        <h3 class="section__title">基础信息</h3>
        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          label-width="100px"
          label-position="right"
          @submit.prevent
        >
          <el-form-item label="名称" prop="name">
            <el-input
              v-model="form.name"
              placeholder="OpenAI 直连（主）"
              maxlength="64"
              show-word-limit
            />
          </el-form-item>

          <el-form-item label="协议类型" prop="apiType">
            <el-select
              v-model="form.apiType"
              :disabled="isEdit"
              placeholder="上游 API 协议（单选）"
              filterable
              style="width: 100%"
              @change="onApiTypeChange"
            >
              <el-option
                v-for="p in apiTypeValues"
                :key="p"
                :label="ApiTypeLabel[p]"
                :value="p"
              />
            </el-select>
            <div v-if="isEdit" class="form-hint">协议不可更改，如需变更请新建供应商。</div>
          </el-form-item>

          <el-form-item label="Base URL" prop="baseUrl">
            <el-input v-model="form.baseUrl" placeholder="https://api.openai.com/v1" />
          </el-form-item>

          <el-form-item label="API Key" prop="apiKey">
            <el-input
              v-model="form.apiKey"
              type="password"
              show-password
              :placeholder="isEdit ? '留空表示不变' : 'sk-…'"
              autocomplete="new-password"
            />
            <div v-if="isEdit" class="form-hint">
              当前：<span class="form-key">{{ provider?.apiKeyMasked }}</span
              >，输入新值才覆盖。
            </div>
          </el-form-item>

          <el-form-item label="备注">
            <el-input
              v-model="form.notes"
              type="textarea"
              :rows="2"
              placeholder="可选，记录联系方式、SLA、停用原因等"
              maxlength="500"
              show-word-limit
            />
          </el-form-item>
        </el-form>
      </section>

      <!-- ============ ③ 供应商模型（provider_model） ============ -->
      <section class="section">
        <div class="section__head">
          <h3 class="section__title">
            供应商模型
            <span class="section__count">{{ form.providerModels.length }}</span>
          </h3>
          <span class="section__hint">
            登记本 Provider 下的上游模型实体；上游请求体里的 <code>model</code> 字段就用这里的
            <code>modelName</code>。
          </span>
        </div>

        <div class="mapping-toolbar">
          <el-button
            type="primary"
            :icon="Download"
            :loading="fetchingUpstream"
            @click="onFetchUpstream()"
          >
            {{ hasUpstreamFetched ? '重新拉取上游目录' : '拉取上游目录' }}
          </el-button>
          <el-button :icon="CirclePlus" plain @click="addEmptyProviderModel">
            手工新增模型
          </el-button>
          <div class="fetch-status">
            <template v-if="hasUpstreamFetched">
              <el-tag size="small" type="success" effect="plain">
                上游目录：{{ upstreamCandidates.length }} 个
              </el-tag>
              <span v-if="upstreamFetchedAt" class="fetch-status__ago">
                · {{ fromNow(upstreamFetchedAt) }}
              </span>
            </template>
            <span v-else class="fetch-status__hint">先拉取目录可一键添加常用模型</span>
          </div>
        </div>

        <!-- 上游候选池 -->
        <div
          v-if="hasUpstreamFetched && unregisteredCandidates.length > 0"
          class="upstream-pool"
        >
          <div class="upstream-pool__head">
            <span class="upstream-pool__title">
              上游目录未登记 · {{ unregisteredCandidates.length }} 个
            </span>
          </div>
          <div class="upstream-pool__body">
            <div
              v-for="upstream in unregisteredCandidates"
              :key="upstream"
              class="upstream-item"
            >
              <span class="upstream-item__name mono">{{ upstream }}</span>
              <el-button
                size="small"
                text
                type="primary"
                @click="addProviderModelFromUpstream(upstream)"
              >
                添加
              </el-button>
              <el-button size="small" text @click="copyText(upstream)">复制</el-button>
            </div>
          </div>
        </div>

        <!-- 已登记的 ProviderModel 卡片列表 -->
        <div v-if="form.providerModels.length === 0" class="empty-state">
          <el-icon class="empty-state__icon"><InfoFilled /></el-icon>
          <div>
            <div class="empty-state__title">尚未登记任何供应商模型</div>
            <div class="empty-state__desc">
              拉取上游目录后点击「添加」，或「手工新增模型」。
            </div>
          </div>
        </div>

        <div v-else class="pm-list">
          <div
            v-for="pm in form.providerModels"
            :key="pm.uid"
            class="pm-card"
            :class="{ 'pm-card--editing': editingPmUid === pm.uid }"
          >
            <!-- 折叠态：摘要 -->
            <div class="pm-card__head">
              <div class="pm-card__title">
                <span class="pm-card__name mono">{{ pm.modelName || '（未命名）' }}</span>
                <el-tag size="small" type="info" effect="plain" round>
                  {{ ModelFamilyLabel[pm.family] }}
                </el-tag>
                <el-tag
                  v-if="(mappingCountByPm.get(pm.uid) ?? 0) > 0"
                  size="small"
                  type="primary"
                  effect="plain"
                  round
                >
                  已上架 {{ mappingCountByPm.get(pm.uid) }} 条
                </el-tag>
                <el-tag v-else size="small" type="warning" effect="plain" round>
                  仅入库
                </el-tag>
              </div>
              <div class="pm-card__actions">
                <el-button
                  size="small"
                  text
                  type="primary"
                  :icon="CirclePlus"
                  @click="addMappingForModel(pm.uid)"
                >
                  上架
                </el-button>
                <el-button
                  size="small"
                  text
                  :icon="Edit"
                  :type="editingPmUid === pm.uid ? 'primary' : 'default'"
                  @click="toggleEdit(pm.uid)"
                >
                  {{ editingPmUid === pm.uid ? '收起' : '编辑' }}
                </el-button>
                <el-button
                  size="small"
                  text
                  type="danger"
                  :icon="Delete"
                  @click="removeProviderModel(pm.uid)"
                />
              </div>
            </div>

            <div class="pm-card__meta">
              <span class="pm-card__meta-item">
                ctx <strong>{{ tokensLabel(pm.maxContextTokens) }}</strong>
              </span>
              <span class="pm-card__meta-item">
                out
                <strong>
                  {{ pm.maxOutputTokens ? tokensLabel(pm.maxOutputTokens) : '—' }}
                </strong>
              </span>
              <span class="pm-card__meta-item">最低 LV {{ pm.visibleMinTier }}</span>
              <span
                v-for="c in pm.capabilities"
                :key="c"
                class="pm-card__cap"
              >
                {{ ModelCapabilityLabel[c] }}
              </span>
            </div>

            <!-- 展开态：完整编辑器 -->
            <div v-if="editingPmUid === pm.uid" class="pm-card__editor">
              <div class="pm-form-row">
                <label>modelName</label>
                <el-input
                  v-model="pm.modelName"
                  placeholder="gpt-4o（上游 /v1/models 一致）"
                  maxlength="128"
                  @blur="onPmModelNameBlur(pm)"
                >
                  <template #append>
                    <el-button :icon="DocumentCopy" @click="copyText(pm.modelName)" />
                  </template>
                </el-input>
              </div>

              <div class="pm-form-row pm-form-row--split">
                <div class="pm-form-cell">
                  <label>family</label>
                  <el-select v-model="pm.family" filterable>
                    <el-option
                      v-for="f in familyOptions"
                      :key="f.value"
                      :label="f.label"
                      :value="f.value"
                    />
                  </el-select>
                </div>
                <div class="pm-form-cell">
                  <label>最低可见 LV</label>
                  <el-input-number
                    v-model="pm.visibleMinTier"
                    :min="1"
                    :max="99"
                    controls-position="right"
                  />
                </div>
              </div>

              <div class="pm-form-row">
                <label>capabilities</label>
                <el-select
                  v-model="pm.capabilities"
                  multiple
                  collapse-tags
                  collapse-tags-tooltip
                  placeholder="选择能力（至少一项）"
                  style="width: 100%"
                >
                  <el-option
                    v-for="c in capabilityOptions"
                    :key="c.value"
                    :label="c.label"
                    :value="c.value"
                  />
                </el-select>
              </div>

              <div class="pm-form-row pm-form-row--split">
                <div class="pm-form-cell">
                  <label>上下文 (tokens)</label>
                  <el-input-number
                    v-model="pm.maxContextTokens"
                    :min="1024"
                    :max="2_000_000"
                    :step="1024"
                    controls-position="right"
                  />
                </div>
                <div class="pm-form-cell">
                  <label>输出上限 (tokens)</label>
                  <el-input-number
                    v-model="pm.maxOutputTokens"
                    :min="1"
                    :max="pm.maxContextTokens"
                    :step="1024"
                    controls-position="right"
                    placeholder="留空 = 上下文上限"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ============ ④ 对外上架（provider_model_mappings） ============ -->
      <section class="section">
        <div class="section__head">
          <h3 class="section__title">
            对外上架
            <span class="section__count">{{ form.modelMappings.length }}</span>
          </h3>
          <span class="section__hint">
            把已登记的供应商模型用 <code>displayName</code> 上架；同一模型可挂多条
            <code>displayName</code> 的映射（套餐 / 灰度名）。
          </span>
        </div>

        <div class="mapping-toolbar">
          <el-button
            type="primary"
            :icon="Top"
            plain
            :disabled="form.providerModels.length === 0"
            @click="autoFillMappings"
          >
            自动按模型生成上架
          </el-button>
          <el-button
            :icon="CirclePlus"
            plain
            :disabled="form.providerModels.length === 0"
            @click="addEmptyMapping"
          >
            手工新增上架
          </el-button>
        </div>

        <div v-if="form.modelMappings.length === 0" class="empty-state">
          <el-icon class="empty-state__icon"><InfoFilled /></el-icon>
          <div>
            <div class="empty-state__title">尚未配置任何对外上架</div>
            <div class="empty-state__desc">
              没有上架的供应商模型不会被调度命中；点击「自动按模型生成上架」一键上架全部。
            </div>
          </div>
        </div>

        <div v-else class="mapping-table">
          <div class="mapping-table__head">
            <div class="mp-col mp-col--name">对外展示名 displayName</div>
            <div class="mp-col mp-col--ref">→ 供应商模型 modelName</div>
            <div class="mp-col mp-col--toggle">启用</div>
            <div class="mp-col mp-col--actions"></div>
          </div>

          <div
            v-for="row in sortedMappings"
            :key="row.uid"
            class="mapping-table__row"
          >
            <div class="mp-col mp-col--name">
              <el-input
                v-model="row.displayName"
                placeholder="GPT-4o"
                maxlength="128"
                size="small"
              />
              <el-tag
                v-if="(displayNameCount.get(row.displayName.trim()) ?? 0) > 1"
                type="warning"
                effect="plain"
                size="small"
                round
              >
                同名
              </el-tag>
            </div>
            <div class="mp-col mp-col--ref">
              <el-select
                v-model="row.providerModelUid"
                size="small"
                placeholder="选择供应商模型"
                filterable
              >
                <el-option
                  v-for="pm in form.providerModels"
                  :key="pm.uid"
                  :label="pm.modelName || '（未命名）'"
                  :value="pm.uid"
                />
              </el-select>
            </div>
            <div class="mp-col mp-col--toggle">
              <el-switch v-model="row.enabled" />
            </div>
            <div class="mp-col mp-col--actions">
              <el-button
                size="small"
                text
                type="danger"
                :icon="Delete"
                @click="removeMapping(row.uid!)"
              />
            </div>
          </div>
        </div>
      </section>
    </div>

    <template #footer>
      <div class="drawer-footer">
        <div class="drawer-footer__summary">
          <span>{{ form.providerModels.length }} 个模型</span>
          <span class="divider">·</span>
          <span>{{ form.modelMappings.length }} 条上架</span>
        </div>
        <div class="drawer-footer__buttons">
          <el-button @click="visible = false">取消</el-button>
          <el-button type="primary" :loading="loading" @click="onSubmit">
            {{ isEdit ? '保存' : '创建' }}
          </el-button>
        </div>
      </div>
    </template>
  </el-drawer>
</template>

<style scoped>
.drawer-body {
  padding-bottom: 8px;
}

.section {
  margin-bottom: 22px;
}
.section__head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.section__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin: 0;
  padding: 0 0 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  display: flex;
  align-items: center;
  gap: 8px;
}
.section__title--gap {
  margin-top: 16px;
}
.section__head .section__title {
  border-bottom: none;
  padding-bottom: 0;
}
.section__count {
  font-size: 12px;
  font-weight: 500;
  color: var(--el-color-primary);
  background: color-mix(in srgb, var(--el-color-primary) 12%, transparent);
  padding: 1px 8px;
  border-radius: 10px;
  font-variant-numeric: tabular-nums;
}
.section__hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}
.section__hint code {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
  background: var(--el-fill-color-light);
  padding: 1px 5px;
  border-radius: 3px;
}

:deep(.el-form-item) {
  margin-bottom: 14px;
}

.form-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}
.form-key {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  color: var(--el-text-color-regular);
}

.drawer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.drawer-footer__summary {
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
}
.drawer-footer__summary .divider {
  color: var(--el-border-color);
}
.drawer-footer__buttons {
  display: flex;
  gap: 10px;
}

.mapping-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.fetch-status {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  font-size: 12px;
}
.fetch-status__ago {
  color: var(--el-text-color-secondary);
}
.fetch-status__hint {
  color: var(--el-text-color-secondary);
}

.empty-state {
  display: flex;
  gap: 12px;
  padding: 18px;
  background: var(--el-fill-color-lighter);
  border: 1px dashed var(--el-border-color);
  border-radius: 8px;
  color: var(--el-text-color-regular);
}
.empty-state__icon {
  font-size: 22px;
  color: var(--el-color-warning);
  margin-top: 2px;
  flex-shrink: 0;
}
.empty-state__title {
  font-size: 13.5px;
  font-weight: 600;
  margin-bottom: 4px;
}
.empty-state__desc {
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
  line-height: 1.6;
}

.mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}

/* 上游候选池 */
.upstream-pool {
  margin-bottom: 14px;
  padding: 10px 12px;
  background: var(--el-fill-color-lighter);
  border: 1px dashed var(--el-border-color);
  border-radius: 6px;
}
.upstream-pool__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.upstream-pool__title {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.upstream-pool__body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 180px;
  overflow-y: auto;
}
.upstream-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
  border-bottom: 1px solid var(--el-border-color-extra-light);
}
.upstream-item:last-child {
  border-bottom: none;
}
.upstream-item__name {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  user-select: text;
  word-break: break-all;
}

/* ProviderModel 卡片列表 */
.pm-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pm-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.pm-card--editing {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--el-color-primary) 8%, transparent);
}
.pm-card__head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
}
.pm-card__title {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.pm-card__name {
  font-size: 13.5px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  word-break: break-all;
}
.pm-card__actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}
.pm-card__meta {
  padding: 0 12px 10px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 14px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  border-bottom: 1px dashed transparent;
}
.pm-card__meta strong {
  color: var(--el-text-color-regular);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.pm-card__cap {
  font-size: 11.5px;
  color: var(--el-text-color-regular);
  background: var(--el-fill-color-light);
  padding: 1px 6px;
  border-radius: 3px;
}
.pm-card--editing .pm-card__meta {
  border-bottom-color: var(--el-border-color-lighter);
}
.pm-card__editor {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--el-fill-color-lighter);
  border-radius: 0 0 8px 8px;
}
.pm-form-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.pm-form-row > label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.pm-form-row--split {
  flex-direction: row;
  gap: 12px;
}
.pm-form-row--split .pm-form-cell {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.pm-form-row--split .pm-form-cell label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.pm-form-row--split :deep(.el-input-number) {
  width: 100%;
}

/* mapping table */
.mapping-table {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  overflow: hidden;
}
.mapping-table__head,
.mapping-table__row {
  display: grid;
  grid-template-columns:
    minmax(200px, 1.6fr)
    minmax(180px, 1.4fr)
    64px
    56px;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
}
.mapping-table__head {
  background: var(--el-fill-color-light);
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-regular);
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.mapping-table__row {
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.mapping-table__row:last-child {
  border-bottom: none;
}
.mp-col {
  min-width: 0;
}
.mp-col--name {
  display: flex;
  align-items: center;
  gap: 6px;
}
.mp-col--actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 2px;
}
.mapping-table :deep(.el-input-number) {
  width: 100%;
}
.mapping-table :deep(.el-select) {
  width: 100%;
}
</style>
