<script setup lang="ts">
/**
 * 渠道设置：对外名称（slug）。
 *
 * 这里没有定价：渠道不管价格。价格定在渠道里每个模型家族的分组上，在「模型定价」页每个家族的标题上改。
 */
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';

import { ProviderGroupLabel } from '@yomi/common';
import type { ProviderGroup } from '../../model/catalog.types';
import { isValidVendorSlug, normalizeVendorSlug } from '../../model/vendorSlug';
import { getYomiCatalogPort } from '../../services';

interface Props {
  modelValue: boolean;
  group: ProviderGroup | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'refresh'): void;
}>();

const catalogPort = getYomiCatalogPort();

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const formRef = ref<FormInstance>();
const saving = ref(false);

const form = reactive({
  vendorSlug: '',
});

const groupTitle = computed(() => {
  const g = props.group;
  if (!g) return '';
  return ProviderGroupLabel[g.queueGroup] ?? g.queueGroup;
});

const showQueueGroup = computed(() => {
  const qg = props.group?.queueGroup ?? '';
  return qg.length > 0 && qg !== groupTitle.value;
});

const rules: FormRules = {
  vendorSlug: [
    {
      validator: (_rule, value: string, callback) => {
        const trimmed = (value ?? '').trim();
        if (!trimmed) {
          callback();
          return;
        }
        if (!isValidVendorSlug(trimmed)) {
          callback(new Error('须小写字母开头，仅含 a-z、0-9、_、-，长度 2–63'));
          return;
        }
        callback();
      },
      trigger: 'blur',
    },
  ],
};

function resetForm(): void {
  form.vendorSlug = props.group?.vendorSlug?.trim() ?? '';
  formRef.value?.clearValidate();
}

async function onSubmit(): Promise<void> {
  if (!props.group) return;
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;

  const trimmed = form.vendorSlug.trim();
  const slug = trimmed ? normalizeVendorSlug(trimmed) : null;
  const prevSlug = props.group.vendorSlug?.trim() || null;
  if (slug === prevSlug) {
    visible.value = false;
    return;
  }

  saving.value = true;
  try {
    const r = await catalogPort.updateVendorSlug(props.group.id, slug);
    if (!r.success) {
      ElMessage.error(r.error.message);
      return;
    }
    ElMessage.success(slug ? `渠道名称已设为「${slug}」` : '已清空渠道名称');
    visible.value = false;
    emit('refresh');
  } finally {
    saving.value = false;
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) resetForm();
  },
);

watch(
  () => props.group?.id,
  () => {
    if (props.modelValue) resetForm();
  },
);
</script>

<template>
  <el-drawer
    v-model="visible"
    size="420px"
    :close-on-click-modal="false"
    destroy-on-close
    header-class="vendor-settings-header"
    body-class="vendor-settings-body"
    footer-class="vendor-settings-footer"
  >
    <template #header>
      <span class="vh-title">渠道设置</span>
    </template>

    <el-form
      v-if="group"
      ref="formRef"
      :model="form"
      :rules="rules"
      label-position="top"
      class="vs-form"
      @submit.prevent
    >
      <div class="vs-id">
        <div class="vs-id__text">
          <span class="vs-id__name">{{ groupTitle }}</span>
          <span v-if="showQueueGroup" class="vs-id__qg">{{ group.queueGroup }}</span>
        </div>
      </div>

      <el-form-item label="渠道名称" prop="vendorSlug">
        <el-input
          v-model="form.vendorSlug"
          class="vs-slug"
          clearable
          maxlength="63"
        />
      </el-form-item>

      <p class="vs-note">
        价格不在渠道上设：在「模型定价」页按模型家族分组定（倍率 / 按次 / 积分单价）。
      </p>
    </el-form>

    <template #footer>
      <div class="vs-foot">
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSubmit">保存</el-button>
      </div>
    </template>
  </el-drawer>
</template>

<style>
.vendor-settings-header {
  margin-bottom: 0 !important;
  padding: 16px 20px 14px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.vendor-settings-body {
  padding: 20px;
}
.vendor-settings-footer {
  padding: 12px 20px 16px;
  border-top: 1px solid var(--el-border-color-lighter);
}
</style>

<style scoped>
.vh-title {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.3;
}

.vs-id {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 22px;
  padding: 14px 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  background: var(--el-fill-color-extra-light);
}
.vs-id__text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.vs-id__name {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
}
.vs-id__qg {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.vs-form :deep(.el-form-item) {
  margin-bottom: 18px;
}
.vs-form :deep(.el-form-item:last-child) {
  margin-bottom: 0;
}
.vs-form :deep(.el-form-item__label) {
  margin-bottom: 6px !important;
  font-weight: 500;
  color: var(--el-text-color-regular);
}

.vs-slug :deep(.el-input__inner) {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 13px;
}


.vs-note {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}

.vs-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
