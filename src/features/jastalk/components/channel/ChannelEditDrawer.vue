<script setup lang="ts">
/**
 * 渠道设置：名称和倍率放在一处改（照 Yomi 的渠道设置抽屉）。
 * 倍率留空 = 这个渠道不按牌价算：只有一个数，不另摆一个开关。
 * 保存以后后端当场把这个渠道跟牌价走的价重算一遍，结果跟着回来，在这里提示。
 */
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';

import { confirmDanger } from '@/shared/composables/useConfirm';

import { multiplierText } from '../../model/channelPricing';
import { notifyCompile } from '../../model/compileFeedback';
import { MULTIPLIER_MAX, type Channel } from '../../model/jastalk.types';
import { getJastalkAdminPort } from '../../services';

import './drawer.css';

const props = defineProps<{
  modelValue: boolean;
  channel: Channel | null;
  /** 这个渠道现在有几个模型的价是跟牌价算出来的：倍率清空时它们的价会被删掉，确认时说个数。 */
  compiledCount: number;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'saved'): void;
}>();

const port = getJastalkAdminPort();

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const form = reactive({
  vendorName: '',
  /** 清空了是 null（el-input-number 清空时给的也可能是 undefined，存的时候一并当 null）。 */
  multiplier: null as number | null | undefined,
});
const saving = ref(false);

const draft = computed(() => form.multiplier ?? null);

function reset(): void {
  form.vendorName = props.channel?.vendorName ?? '';
  form.multiplier = props.channel?.multiplier ?? null;
}

async function submit(): Promise<void> {
  const channel = props.channel;
  if (!channel) return;
  const name = form.vendorName.trim();
  const next = draft.value;
  // 名称不填后端用渠道的键顶上，比的时候也这么算
  const nameChanged = (name || channel.vendorKey) !== channel.vendorName;
  const multiplierChanged = next !== channel.multiplier;
  if (!nameChanged && !multiplierChanged) {
    visible.value = false;
    return;
  }

  if (channel.multiplier !== null && next === null) {
    const okp = await confirmDanger({
      title: '清空倍率',
      message:
        props.compiledCount > 0
          ? `清空以后「${channel.vendorName}」不再按牌价算，${props.compiledCount} 个模型算出来的价会删掉，改照默认价算；默认价用不上的，用户就选不了了。`
          : `清空以后「${channel.vendorName}」不再按牌价算，它的模型只认单独定的价和默认价。`,
      confirmText: '清空并保存',
    });
    if (!okp) return;
  }

  saving.value = true;
  try {
    const r = await port.saveChannel(channel.vendorKey, { vendorName: name || null, multiplier: next });
    if (!r.success) {
      ElMessage.error(r.error.message);
      return;
    }
    // 只改了名字时重算的结果和这次改动无关，不拿出来说
    if (multiplierChanged) notifyCompile(next === null ? '倍率已清空' : `渠道倍率已设为 ${multiplierText(next)}`, r.data.compile);
    else ElMessage.success('已保存');
    visible.value = false;
    emit('saved');
  } finally {
    saving.value = false;
  }
}

watch(
  () => [props.modelValue, props.channel?.vendorKey] as const,
  ([open]) => {
    if (open) reset();
  },
);
</script>

<template>
  <el-drawer
    v-model="visible"
    size="420px"
    :close-on-click-modal="false"
    destroy-on-close
    header-class="jastalk-drawer-header"
    body-class="jastalk-drawer-body"
    footer-class="jastalk-drawer-footer"
  >
    <template #header>
      <span class="cs-title">渠道设置</span>
    </template>

    <el-form
      v-if="channel"
      :model="form"
      label-position="top"
      class="cs-form"
      @submit.prevent
    >
      <div class="cs-id">
        <div class="cs-id__text">
          <span class="cs-id__name">{{ form.vendorName.trim() || channel.vendorKey }}</span>
          <span class="cs-id__key">{{ channel.vendorKey }}</span>
        </div>
        <span
          class="cs-id__mult"
          :class="{ 'cs-id__mult--unset': draft === null }"
        >{{ multiplierText(draft) }}</span>
      </div>

      <el-form-item label="渠道名称">
        <el-input
          v-model="form.vendorName"
          maxlength="64"
          clearable
          :placeholder="channel.vendorKey"
        />
      </el-form-item>

      <el-form-item label="渠道倍率">
        <el-input-number
          v-model="form.multiplier"
          :min="0"
          :max="MULTIPLIER_MAX"
          :precision="4"
          :step="0.1"
          controls-position="right"
          placeholder="留空不按牌价算"
          class="cs-mult"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <div class="cs-foot">
        <el-button @click="visible = false">
          取消
        </el-button>
        <el-button
          type="primary"
          :loading="saving"
          @click="submit"
        >
          保存
        </el-button>
      </div>
    </template>
  </el-drawer>
</template>

<style scoped>
.cs-title {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.3;
}

.cs-id {
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

.cs-id__text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.cs-id__name {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.cs-id__key {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.cs-id__mult {
  flex-shrink: 0;
  font-size: 22px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.04em;
  line-height: 1;
  color: var(--el-text-color-primary);
}

/* 「未设置」是字不是数：不用数字那一档的字号和字距 */
.cs-id__mult--unset {
  font-size: 15px;
  font-weight: 500;
  letter-spacing: 0;
  color: var(--el-text-color-secondary);
}

.cs-form :deep(.el-form-item) {
  margin-bottom: 18px;
}

.cs-form :deep(.el-form-item:last-child) {
  margin-bottom: 0;
}

.cs-form :deep(.el-form-item__label) {
  margin-bottom: 6px !important;
  font-weight: 500;
  color: var(--el-text-color-regular);
}

.cs-mult {
  width: 100%;
}

.cs-mult :deep(.el-input__inner) {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  letter-spacing: -0.02em;
  text-align: left;
}

.cs-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
