<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Ticket } from '@element-plus/icons-vue';

import { formatMoney } from '@/shared/lib/money';

import { getDemuxaiRedemptionPort } from '../services';

const visible = defineModel<boolean>('visible', { required: true });

const port = getDemuxaiRedemptionPort();
const submitting = ref(false);

const form = ref({
  name: '兑换码',
  amount: 1,
  maxRedemptions: 1,
  count: 10,
  expiredAt: null as string | null,
});

const isShared = computed(() => form.value.maxRedemptions > 1);
const previewAmount = computed(() => formatMoney(form.value.amount, { currency: 'CNY' }));

const previewSummary = computed(() => {
  if (isShared.value) {
    return `1 个活动码 · 最多 ${form.value.maxRedemptions} 次 · 每次 ${previewAmount.value}`;
  }
  if (form.value.count > 1) {
    return `${form.value.count} 个独立码 · 各领 1 次 · 每次 ${previewAmount.value}`;
  }
  return `1 个码 · 领 1 次 · ${previewAmount.value}`;
});

watch(visible, (open) => {
  if (open) {
    form.value = { name: '兑换码', amount: 1, maxRedemptions: 1, count: 10, expiredAt: null };
  }
});

watch(
  () => form.value.maxRedemptions,
  (max) => {
    if (max > 1) form.value.count = 1;
  },
);

const emit = defineEmits<{
  (e: 'created', payload: { keys: string[]; batchName: string }): void;
}>();

async function submit(): Promise<void> {
  submitting.value = true;
  try {
    const maxRedemptions = Math.floor(form.value.maxRedemptions);
    const count = maxRedemptions > 1 ? 1 : Math.floor(form.value.count);
    const expiredAtUtc = form.value.expiredAt
      ? new Date(`${form.value.expiredAt}T23:59:59Z`).toISOString()
      : null;

    const r = await port.create({
      name: form.value.name,
      amount: form.value.amount,
      count,
      maxRedemptions,
      expiredAtUtc,
    });
    if (r.success && r.data.keys.length) {
      visible.value = false;
      emit('created', { keys: r.data.keys, batchName: form.value.name.trim() });
    } else if (!r.success) {
      ElMessage.error(r.error.message);
    }
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <el-drawer
    v-model="visible"
    title="发布激活码"
    size="480px"
    append-to-body
    class="redemption-create-drawer"
  >
    <div class="drawer-body">
      <el-form label-position="top" class="drawer-form" @submit.prevent="submit">
        <el-form-item label="批次 / 活动名称" required>
          <el-input
            v-model="form.name"
            placeholder="如：2026 春节活动"
            maxlength="64"
            show-word-limit
          />
        </el-form-item>

        <div class="drawer-form__row">
          <el-form-item label="每次领取额度（元）" required class="drawer-form__half">
            <el-input-number
              v-model="form.amount"
              :min="0.01"
              :max="99999"
              :precision="2"
              :step="1"
              controls-position="right"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item label="每码可领次数" required class="drawer-form__half">
            <el-input-number
              v-model="form.maxRedemptions"
              :min="1"
              :max="10000"
              :step="1"
              controls-position="right"
              style="width: 100%"
            />
            <div class="field-hint">=1 为一次性码；&gt;1 为活动码（仅 1 个 Key）</div>
          </el-form-item>
        </div>

        <el-form-item label="生成 Key 数量" :required="!isShared">
          <el-input-number
            v-model="form.count"
            :min="1"
            :max="100"
            :step="1"
            :disabled="isShared"
            controls-position="right"
            style="width: 100%"
          />
          <div v-if="isShared" class="field-hint">活动码固定生成 1 个 Key</div>
        </el-form-item>

        <el-form-item label="截止领取日期">
          <el-date-picker
            v-model="form.expiredAt"
            type="date"
            placeholder="不填则长期有效"
            value-format="YYYY-MM-DD"
            style="width: 100%"
            clearable
          />
        </el-form-item>

        <div class="drawer-preview">
          <Ticket class="drawer-preview__icon" />
          <div>
            <div class="drawer-preview__label">发布预览</div>
            <div class="drawer-preview__value">{{ previewSummary }}</div>
          </div>
        </div>
      </el-form>
    </div>

    <template #footer>
      <div class="drawer-footer">
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" native-type="submit" @click="submit">
          发布
        </el-button>
      </div>
    </template>
  </el-drawer>
</template>

<style scoped>
.drawer-body {
  padding: 0 4px;
}
.drawer-form__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.drawer-form__half {
  margin-bottom: 18px;
}
.field-hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  line-height: 1.5;
}
.drawer-preview {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 10px;
  background: linear-gradient(135deg, #f0f7ff 0%, #f8fafc 100%);
  border: 1px solid var(--el-color-primary-light-8);
}
.drawer-preview__icon {
  width: 28px;
  height: 28px;
  color: var(--el-color-primary);
  flex-shrink: 0;
}
.drawer-preview__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.drawer-preview__value {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-top: 2px;
  line-height: 1.45;
}
.drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
