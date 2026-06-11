<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { FormInstance, FormRules } from 'element-plus';

import { ProviderGroupLabel } from '@demux/common';
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
  initialVendorKey?: string;
  /** 从供应商组展开行创建时锁定 QueueGroup */
  fixedVendorKey?: string;
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

// 别名是对外名，创建后不可改；供应商组 / 上游模型即使在编辑态也允许改绑定
// （后端走「软删旧别名快照 + 新建 + 迁移定价」的追加语义）。
// fixedVendorKey / fixedUpstreamModelId 只用于「从某上游模型行新建别名」时预填并锁定作用域，
// 编辑态下不应锁定，否则无法改绑上游模型。
const vendorLocked = computed(() => !isEdit.value && Boolean(props.fixedVendorKey));
const upstreamLocked = computed(() => !isEdit.value && Boolean(props.fixedUpstreamModelId));

interface FormState {
  alias: string;
  vendorKey: string;
  vendorModel: string;
  isPublished: boolean;
  notes: string;
}

const emptyForm = (): FormState => ({
  alias: '',
  vendorKey: '',
  vendorModel: '',
  isPublished: true,
  notes: '',
});

const form = ref<FormState>(emptyForm());
const formRef = ref<FormInstance | null>(null);
const upstreamOptions = ref<ProviderUpstreamModel[]>([]);
const upstreamLoading = ref(false);
/** 打开抽屉回填表单期间，抑制 vendorKey 联动清空 vendorModel。 */
const hydrating = ref(false);

const rules: FormRules<FormState> = {
  alias: [{ required: true, message: '请填写对外别名', trigger: 'blur' }],
  vendorKey: [{ required: true, message: '请选择供应商组', trigger: 'change' }],
  vendorModel: [{ required: true, message: '请选择上游模型', trigger: 'change' }],
};

const vendorSelectOptions = computed(() =>
  props.providerGroups.map((c) => ({
    value: c.queueGroup,
    label: c.vendorSlug?.trim() || ProviderGroupLabel[c.queueGroup] || c.queueGroup,
  })),
);

async function loadUpstream(vendorKey: string): Promise<void> {
  if (!vendorKey) {
    upstreamOptions.value = [];
    return;
  }
  upstreamLoading.value = true;
  try {
    const r = await catalogPort.listUpstreamModels(vendorKey);
    upstreamOptions.value = r.success ? r.data : [];
  } finally {
    upstreamLoading.value = false;
  }
}

watch(
  () => props.modelValue,
  async (open) => {
    if (!open) return;
    hydrating.value = true;
    if (props.route) {
      form.value = {
        alias: props.route.alias,
        vendorKey: props.route.vendorKey,
        vendorModel: props.route.vendorModel,
        isPublished: props.route.isPublished,
        notes: props.route.notes ?? '',
      };
      await loadUpstream(props.route.vendorKey);
    } else {
      const vendorKey =
        props.fixedVendorKey ?? props.initialVendorKey ?? '';
      form.value = {
        ...emptyForm(),
        vendorKey,
        vendorModel: props.fixedUpstreamModelId ?? '',
      };
      if (vendorKey) await loadUpstream(vendorKey);
    }
    hydrating.value = false;
  },
);

watch(
  () => form.value.vendorKey,
  (key, prev) => {
    if (hydrating.value || key === prev) return;
    // 用户主动切换渠道：清空上游绑定并重新拉取该渠道目录。
    form.value.vendorModel = '';
    void loadUpstream(key);
  },
);

function onSubmit(): void {
  formRef.value?.validate((valid) => {
    if (!valid) return;
    const body = {
      alias: form.value.alias.trim(),
      vendorKey: form.value.vendorKey,
      vendorModel: form.value.vendorModel,
      isPublished: form.value.isPublished,
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
    :title="isEdit ? '编辑别名绑定' : '创建对外别名'"
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
        <div v-if="isEdit" class="field-hint">对外别名创建后不可改；改渠道/上游会生成新的绑定快照</div>
      </el-form-item>

      <el-form-item label="供应商组" prop="vendorKey">
        <el-select
          v-model="form.vendorKey"
          placeholder="选择 QueueGroup"
          style="width: 100%"
          :disabled="vendorLocked"
        >
          <el-option
            v-for="opt in vendorSelectOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="上游模型" prop="vendorModel">
        <el-select
          v-model="form.vendorModel"
          filterable
          placeholder="从网关目录选择注册名"
          style="width: 100%"
          :loading="upstreamLoading"
          :disabled="!form.vendorKey || upstreamLocked"
        >
          <el-option
            v-for="m in upstreamOptions"
            :key="m.vendorModel"
            :label="m.label ?? m.vendorModel"
            :value="m.vendorModel"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="上线">
        <el-switch v-model="form.isPublished" active-text="已上线" inactive-text="已下线" />
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
