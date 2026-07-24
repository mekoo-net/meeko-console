<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';

import type { ProviderGroup } from '../../model/catalog.types';
import { isValidVendorSlug, normalizeVendorSlug } from '../../model/vendorSlug';
import { getDemuxCatalogPort } from '../../services';
import { demuxPlatformPaths } from '@/features/demux/api/routes';

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

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const formRef = ref<FormInstance>();
const saving = ref(false);

const form = reactive({
  vendorSlug: '',
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

  saving.value = true;
  try {
    const r = await catalogPort.updateVendorSlug(props.group.id, slug);
    if (r.success) {
      ElMessage.success(slug ? `对外通道 slug 已设为「${slug}」` : '已清空对外通道 slug');
      visible.value = false;
      emit('refresh');
    } else {
      ElMessage.error(r.error.message);
    }
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
    title="编辑对外通道 slug"
    size="420px"
    :close-on-click-modal="false"
    destroy-on-close
  >
    <template v-if="group">
      <p class="drawer-desc">
        对外通道 slug 用于公开定价页分组展示。未设置时该组不会出现在
        <code>{{ demuxPlatformPaths.publicPricing }}</code>。
      </p>

      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-form-item label="QueueGroup（只读）">
          <el-input :model-value="group.queueGroup" disabled />
        </el-form-item>

        <el-form-item label="对外通道 slug" prop="vendorSlug">
          <el-input
            v-model="form.vendorSlug"
            placeholder="如 nai / pa / rong"
            clearable
            maxlength="63"
          />
          <p class="field-hint">
            留空表示清空 slug，该组将不再参与公开定价。
          </p>
        </el-form-item>
      </el-form>
    </template>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="onSubmit">保存</el-button>
    </template>
  </el-drawer>
</template>

<style scoped>
.drawer-desc {
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}
.drawer-desc code {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
}
.field-hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
