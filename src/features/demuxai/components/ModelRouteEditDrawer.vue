<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { FormInstance, FormRules } from 'element-plus';

import {
  ProviderGroupLabel,
  modelRouteStatusValues,
  ModelRouteStatusLabel,
  type ModelRouteStatus,
} from '../model/enums';
import type {
  CreateModelRouteInput,
  ModelRoute,
  UpdateModelRouteInput,
} from '../model/modelRoute.types';
import type { ProviderGroup, ProviderUpstreamModel } from '../model/catalog.types';
import { getDemuxaiCatalogPort } from '../services';

interface Props {
  modelValue: boolean;
  route: ModelRoute | null;
  loading: boolean;
  providerGroups: ProviderGroup[];
  initialChannelKey?: string;
  /** 从供应商组展开行创建时锁定 QueueGroup */
  fixedChannelKey?: string;
  /** 从上游模型行创建时锁定注册名 */
  fixedUpstreamModelId?: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'submit', payload: { create?: CreateModelRouteInput; update?: UpdateModelRouteInput }): void;
}>();

const catalogPort = getDemuxaiCatalogPort();

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const isEdit = computed(() => props.route !== null);

const channelLocked = computed(
  () => isEdit.value || Boolean(props.fixedChannelKey),
);
const upstreamLocked = computed(
  () => isEdit.value || Boolean(props.fixedUpstreamModelId),
);

interface FormState {
  alias: string;
  channelKey: string;
  upstreamModelId: string;
  weight: number;
  priority: number;
  status: ModelRouteStatus;
  notes: string;
}

const emptyForm = (): FormState => ({
  alias: '',
  channelKey: '',
  upstreamModelId: '',
  weight: 100,
  priority: 100,
  status: 'enabled',
  notes: '',
});

const form = ref<FormState>(emptyForm());
const formRef = ref<FormInstance | null>(null);
const upstreamOptions = ref<ProviderUpstreamModel[]>([]);
const upstreamLoading = ref(false);

const rules: FormRules<FormState> = {
  alias: [{ required: true, message: '请填写对外别名', trigger: 'blur' }],
  channelKey: [{ required: true, message: '请选择供应商组', trigger: 'change' }],
  upstreamModelId: [{ required: true, message: '请选择上游模型', trigger: 'change' }],
  weight: [{ required: true, type: 'number', min: 1, message: '权重 ≥ 1', trigger: 'blur' }],
};

const channelSelectOptions = computed(() =>
  props.providerGroups.map((c) => ({
    value: c.queueGroup,
    label: ProviderGroupLabel[c.queueGroup] ?? c.displayName,
  })),
);

async function loadUpstream(channelKey: string): Promise<void> {
  if (!channelKey) {
    upstreamOptions.value = [];
    return;
  }
  upstreamLoading.value = true;
  try {
    const r = await catalogPort.listUpstreamModels(channelKey);
    upstreamOptions.value = r.success ? r.data : [];
  } finally {
    upstreamLoading.value = false;
  }
}

watch(
  () => props.modelValue,
  async (open) => {
    if (!open) return;
    if (props.route) {
      form.value = {
        alias: props.route.alias,
        channelKey: props.route.channelKey,
        upstreamModelId: props.route.upstreamModelId,
        weight: props.route.weight,
        priority: props.route.priority,
        status: props.route.status,
        notes: props.route.notes ?? '',
      };
      await loadUpstream(props.route.channelKey);
    } else {
      const channelKey =
        props.fixedChannelKey ?? props.initialChannelKey ?? '';
      form.value = {
        ...emptyForm(),
        channelKey,
        upstreamModelId: props.fixedUpstreamModelId ?? '',
      };
      if (channelKey) await loadUpstream(channelKey);
    }
  },
);

watch(
  () => form.value.channelKey,
  (key, prev) => {
    if (key === prev) return;
    form.value.upstreamModelId = '';
    void loadUpstream(key);
  },
);

function onSubmit(): void {
  formRef.value?.validate((valid) => {
    if (!valid) return;
    const body = {
      alias: form.value.alias.trim(),
      channelKey: form.value.channelKey,
      upstreamModelId: form.value.upstreamModelId,
      weight: form.value.weight,
      priority: form.value.priority,
      status: form.value.status,
      notes: form.value.notes.trim() || null,
    };
    if (isEdit.value) emit('submit', { update: body });
    else emit('submit', { create: body });
  });
}
</script>

<template>
  <el-drawer
    v-model="visible"
    :title="isEdit ? '编辑别名路由' : '创建对外别名'"
    size="480px"
    destroy-on-close
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="100px" @submit.prevent>
      <el-form-item label="对外别名" prop="alias">
        <el-input
          v-model="form.alias"
          placeholder="用户请求 model 字段，如 demux-gpt-4o"
          :disabled="isEdit"
        />
        <div v-if="isEdit" class="field-hint">别名创建后不可改（计费主键）</div>
      </el-form-item>

      <el-form-item label="供应商组" prop="channelKey">
        <el-select
          v-model="form.channelKey"
          placeholder="选择 QueueGroup"
          style="width: 100%"
          :disabled="channelLocked"
        >
          <el-option
            v-for="opt in channelSelectOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="上游模型" prop="upstreamModelId">
        <el-select
          v-model="form.upstreamModelId"
          filterable
          placeholder="从网关目录选择注册名"
          style="width: 100%"
          :loading="upstreamLoading"
          :disabled="!form.channelKey || upstreamLocked"
        >
          <el-option
            v-for="m in upstreamOptions"
            :key="m.upstreamModelId"
            :label="m.label ?? m.upstreamModelId"
            :value="m.upstreamModelId"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="权重" prop="weight">
        <el-input-number v-model="form.weight" :min="1" :max="10000" />
        <div class="field-hint">同一别名多条路由时按权重分流</div>
      </el-form-item>

      <el-form-item label="优先级" prop="priority">
        <el-input-number v-model="form.priority" :min="0" :max="999" />
      </el-form-item>

      <el-form-item label="状态" prop="status">
        <el-select v-model="form.status" style="width: 100%">
          <el-option
            v-for="s in modelRouteStatusValues"
            :key="s"
            :label="ModelRouteStatusLabel[s]"
            :value="s"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="备注">
        <el-input v-model="form.notes" type="textarea" :rows="2" />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="loading" @click="onSubmit">保存</el-button>
    </template>
  </el-drawer>
</template>

<style scoped>
.field-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}
</style>
