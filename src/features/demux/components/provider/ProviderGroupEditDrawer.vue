<script setup lang="ts">
/**
 * 渠道设置：对外名称（slug）和渠道倍率放在同一处改。
 * slug 走目录接口；倍率走定价接口，改完会重算该渠道下「渠道定价」的别名。
 */
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';

import { ProviderGroupLabel } from '@demux/common';
import type { ProviderGroup } from '../../model/catalog.types';
import { isValidVendorSlug, normalizeVendorSlug } from '../../model/vendorSlug';
import { formatMultiplier } from '../../model/rateSummary';
import { getDemuxCatalogPort, getDemuxPricingPort } from '../../services';
import { notifyCompile } from '../pricing/compileFeedback';

interface Props {
  modelValue: boolean;
  group: ProviderGroup | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'refresh'): void;
}>();

const catalogPort = getDemuxCatalogPort();
const pricingPort = getDemuxPricingPort();

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const formRef = ref<FormInstance>();
const saving = ref(false);

const form = reactive({
  vendorSlug: '',
  multiplier: 1,
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
  form.multiplier = props.group?.priceMultiplier ?? 1;
  formRef.value?.clearValidate();
}

async function onSubmit(): Promise<void> {
  if (!props.group) return;
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;

  const trimmed = form.vendorSlug.trim();
  const slug = trimmed ? normalizeVendorSlug(trimmed) : null;
  const prevSlug = props.group.vendorSlug?.trim() || null;
  const slugChanged = slug !== prevSlug;
  const multiplierChanged = form.multiplier !== props.group.priceMultiplier;

  if (!slugChanged && !multiplierChanged) {
    visible.value = false;
    return;
  }

  saving.value = true;
  try {
    if (slugChanged) {
      const r = await catalogPort.updateVendorSlug(props.group.id, slug);
      if (!r.success) {
        ElMessage.error(r.error.message);
        return;
      }
    }
    if (multiplierChanged) {
      const r = await pricingPort.setVendorMultiplier({
        vendorId: props.group.id,
        multiplier: form.multiplier,
        reason: 'console vendor settings',
      });
      if (!r.success) {
        ElMessage.error(r.error.message);
        return;
      }
      notifyCompile(`渠道倍率已设为 ${formatMultiplier(form.multiplier)}`, r.data);
    } else {
      ElMessage.success(slug ? `渠道名称已设为「${slug}」` : '已清空渠道名称');
    }
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
        <span class="vs-id__mult">{{ formatMultiplier(form.multiplier) }}</span>
      </div>

      <el-form-item label="渠道名称" prop="vendorSlug">
        <el-input
          v-model="form.vendorSlug"
          class="vs-slug"
          clearable
          maxlength="63"
        />
      </el-form-item>

      <el-form-item label="渠道倍率">
        <el-input-number
          v-model="form.multiplier"
          :min="0"
          :max="1000"
          :precision="4"
          :step="0.05"
          controls-position="right"
          class="vs-mult"
        />
      </el-form-item>
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
.vs-id__mult {
  flex-shrink: 0;
  font-size: 22px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.04em;
  line-height: 1;
  color: var(--el-text-color-primary);
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

.vs-mult {
  width: 100%;
}
.vs-mult :deep(.el-input__wrapper) {
  width: 100%;
}
.vs-mult :deep(.el-input__inner) {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.vs-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
