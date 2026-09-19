<script setup lang="ts">
/**
 * 价格表用的基准价对话框。计量方式跟模型走，不在这里挑。
 * 模型定价的渠道定价 / 自定义走 RouteRateDrawer。
 */
import { computed, ref } from 'vue';

import type { BillingType, ModelCapabilities } from '@demux/common';
import RateBodyForm, { type RateDraft } from './RateBodyForm.vue';

export type { RateDraft };

interface Props {
  modelValue: boolean;
  subjectKey: string;
  initial: RateDraft | null;
  loading: boolean;
  titleNoun?: string;
  billingType?: BillingType;
  capabilities?: ModelCapabilities | null;
}

const props = withDefaults(defineProps<Props>(), {
  titleNoun: '定价',
  billingType: 'per_token',
  capabilities: null,
});

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'submit', payload: RateDraft): void;
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const formRef = ref<{ buildRateBody: () => RateDraft } | null>(null);

function onSubmit(): void {
  const body = formRef.value?.buildRateBody();
  if (body) emit('submit', body);
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :width="billingType === 'per_token' ? '560px' : '520px'"
    :close-on-click-modal="false"
    align-center
    class="rate-dialog"
  >
    <template #header>
      <div class="dlg-head">
        <div class="dlg-head__noun">{{ initial ? '编辑' : '新建' }}{{ titleNoun }}</div>
        <div class="dlg-head__key">{{ subjectKey }}</div>
      </div>
    </template>

    <RateBodyForm
      ref="formRef"
      :active="visible"
      :subject-key="subjectKey"
      :initial="initial"
      :billing-type="billingType"
      :capabilities="capabilities"
    />

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="loading" @click="onSubmit">保存</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.rate-dialog :deep(.el-dialog__header) {
  margin-right: 0;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.rate-dialog :deep(.el-dialog__body) {
  padding-top: 18px;
}
.dlg-head {
  min-width: 0;
  padding-right: 24px;
}
.dlg-head__noun {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.3;
}
.dlg-head__key {
  margin-top: 3px;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
