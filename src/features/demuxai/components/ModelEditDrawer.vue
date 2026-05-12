<script setup lang="ts">
/**
 * 模型元数据编辑抽屉（**编辑模式专用**）。
 *
 * 设计要点：
 *  - Model 的创建 / 删除完全由 Provider mapping 驱动 —— 本抽屉**没有新建态**，
 *    `modelId` 视为只读。
 *  - 不存在 `enabled` 开关：启停一律在 Provider 层面操作。
 *  - 「承载于」是反向派生（来自父组件传入的 `carriedBy`），只读展示，
 *    点击 chip 可跳转到对应 Provider 编辑。
 */
import { computed, ref, watch } from 'vue';
import type { FormInstance, FormRules } from 'element-plus';

import {
  modelCapabilityValues,
  ModelCapabilityLabel,
  modelFamilyValues,
  ModelFamilyLabel,
  type ModelCapability,
  type ModelFamily,
} from '../model/enums';
import type { Model, UpdateModelInput } from '../model/model.types';

interface CarriedByEntry {
  providerUid: string;
  providerName: string;
  /** 上游 model 技术名（provider_model.model_name） */
  modelName: string;
  mappingWeight: number;
  enabled: boolean;
}

interface Props {
  modelValue: boolean;
  /** null = 抽屉关闭/未就绪；非 null = 编辑该 Model */
  model: Model | null;
  loading: boolean;
  /** 「承载于」反向派生 —— 由父组件根据 providers.modelMappings 计算 */
  carriedBy: CarriedByEntry[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'submit', payload: { update: UpdateModelInput }): void;
  (e: 'jump-to-provider', providerUid: string): void;
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

interface FormState {
  displayName: string;
  family: ModelFamily;
  capabilities: ModelCapability[];
  visibleMinTier: number;
  maxContextTokens: number;
  maxOutputTokens: number | null;
  supportsStreaming: boolean;
  supportsFunctionCall: boolean;
  description: string;
}

const emptyForm = (): FormState => ({
  displayName: '',
  family: 'gpt',
  capabilities: ['chat'],
  visibleMinTier: 1,
  maxContextTokens: 8192,
  maxOutputTokens: null,
  supportsStreaming: true,
  supportsFunctionCall: false,
  description: '',
});

const form = ref<FormState>(emptyForm());
const formRef = ref<FormInstance | null>(null);

const rules: FormRules<FormState> = {
  displayName: [{ required: true, message: '请填写展示名', trigger: 'blur' }],
  family: [{ required: true, message: '请选择模型族', trigger: 'change' }],
  capabilities: [{ required: true, message: '至少选择一项能力', trigger: 'change' }],
  visibleMinTier: [
    { required: true, type: 'number', min: 1, max: 99, message: '1..99', trigger: 'blur' },
  ],
  maxContextTokens: [
    {
      required: true,
      type: 'number',
      min: 1,
      message: '上下文 tokens 必须 > 0',
      trigger: 'blur',
    },
  ],
};

watch(
  () => [props.modelValue, props.model] as const,
  ([open, m]) => {
    if (!open || !m) return;
    form.value = {
      displayName: m.displayName,
      family: m.family,
      capabilities: [...m.capabilities],
      visibleMinTier: m.visibleMinTier,
      maxContextTokens: m.maxContextTokens,
      maxOutputTokens: m.maxOutputTokens ?? null,
      supportsStreaming: m.supportsStreaming,
      supportsFunctionCall: m.supportsFunctionCall,
      description: m.description ?? '',
    };
  },
  { immediate: true },
);

async function onSubmit(): Promise<void> {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  const f = form.value;
  const patch: UpdateModelInput = {
    displayName: f.displayName,
    family: f.family,
    capabilities: f.capabilities,
    visibleMinTier: f.visibleMinTier,
    maxContextTokens: f.maxContextTokens,
    maxOutputTokens: f.maxOutputTokens,
    supportsStreaming: f.supportsStreaming,
    supportsFunctionCall: f.supportsFunctionCall,
    description: f.description.trim() || null,
  };
  emit('submit', { update: patch });
}
</script>

<template>
  <el-drawer
    v-model="visible"
    :title="`编辑模型 · ${model?.displayName ?? ''}`"
    direction="rtl"
    size="600px"
    :close-on-click-modal="false"
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="124px"
      label-position="right"
      @submit.prevent
    >
      <el-form-item label="modelId">
        <el-input :model-value="model?.modelId ?? ''" disabled />
        <div class="form-hint">
          modelId 是计费/配额主键，由 Provider mapping 派生，**不可修改**。
        </div>
      </el-form-item>

      <el-form-item label="展示名" prop="displayName">
        <el-input v-model="form.displayName" placeholder="GPT-4o" />
      </el-form-item>

      <el-form-item label="模型族" prop="family">
        <el-select v-model="form.family" style="width: 100%">
          <el-option
            v-for="f in modelFamilyValues"
            :key="f"
            :label="ModelFamilyLabel[f]"
            :value="f"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="能力" prop="capabilities">
        <el-select v-model="form.capabilities" multiple style="width: 100%">
          <el-option
            v-for="c in modelCapabilityValues"
            :key="c"
            :label="ModelCapabilityLabel[c]"
            :value="c"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="上下文 (tokens)" prop="maxContextTokens">
        <el-input-number
          v-model="form.maxContextTokens"
          :min="1024"
          :max="2_000_000"
          :step="1024"
          style="width: 200px"
        />
      </el-form-item>

      <el-form-item label="输出上限">
        <el-input-number
          v-model="form.maxOutputTokens"
          :min="1"
          :max="form.maxContextTokens"
          placeholder="留空 = 上下文上限"
          style="width: 200px"
        />
      </el-form-item>

      <el-form-item label="最低可见 LV" prop="visibleMinTier">
        <el-input-number v-model="form.visibleMinTier" :min="1" :max="99" style="width: 180px" />
        <div class="form-hint">用户 LV 低于此值时不会在列表中看到该模型。</div>
      </el-form-item>

      <el-form-item label="支持流式">
        <el-switch v-model="form.supportsStreaming" />
      </el-form-item>

      <el-form-item label="支持函数调用">
        <el-switch v-model="form.supportsFunctionCall" />
      </el-form-item>

      <el-form-item label="承载于">
        <div class="carried-by">
          <el-tag
            v-for="entry in carriedBy"
            :key="`${entry.providerUid}|${entry.modelName}`"
            class="carried-chip"
            :type="entry.enabled ? 'info' : 'warning'"
            effect="plain"
            @click="emit('jump-to-provider', entry.providerUid)"
          >
            {{ entry.providerName }} <span class="carried-arrow">←</span>
            <span class="carried-upstream">{{ entry.modelName }}</span>
            <span
              v-if="entry.enabled && entry.mappingWeight !== 100"
              class="carried-weight"
            >
              · w{{ entry.mappingWeight }}
            </span>
            <span v-else-if="!entry.enabled" class="carried-weight">（停用）</span>
          </el-tag>
          <span v-if="carriedBy.length === 0" class="carried-empty">
            当前没有任何模型渠道上架此 displayName（理论上应被自动清理）
          </span>
        </div>
        <div class="form-hint">
          反向派生于 Provider.modelMappings × providerModels —— 仅展示。
          新增 / 移除请编辑对应模型渠道。
        </div>
      </el-form-item>

      <el-form-item label="简介">
        <el-input
          v-model="form.description"
          type="textarea"
          :rows="3"
          maxlength="240"
          show-word-limit
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <div class="drawer-footer">
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" :loading="loading" @click="onSubmit">保存</el-button>
      </div>
    </template>
  </el-drawer>
</template>

<style scoped>
.form-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}
.drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.carried-by {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.carried-chip {
  cursor: pointer;
  user-select: none;
}
.carried-arrow {
  margin: 0 4px;
  color: var(--el-text-color-secondary);
}
.carried-upstream {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  color: var(--el-text-color-regular);
}
.carried-weight {
  margin-left: 4px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.carried-empty {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
