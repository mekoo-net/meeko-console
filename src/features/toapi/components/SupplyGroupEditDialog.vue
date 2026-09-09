<script setup lang="ts">
/**
 * 编辑已接入分组：key 与供应商一对一不可改，只改显示名 / 状态 / 排序 / 备注。
 * 新建走 VendorConnectDialog。
 */
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';

import {
  CatalogStatusLabel,
  catalogStatusValues,
  type SupplyGroup,
  type UpsertSupplyGroupInput,
} from '../model/pricing.types';
import { ChannelBillingKindLabel, resolveChannel } from '../model/channel.types';
import { getToApiPricingPort } from '../services';

const visible = defineModel<boolean>('visible', { required: true });

const props = defineProps<{ group: SupplyGroup | null }>();
const emit = defineEmits<{ (e: 'saved', group: SupplyGroup): void }>();

const port = getToApiPricingPort();
const submitting = ref(false);

const form = ref<UpsertSupplyGroupInput>({ key: '', name: '', status: 'live', sortOrder: 0, notes: '' });

const channel = computed(() => (props.group ? resolveChannel(props.group.key) : null));

watch(visible, (open) => {
  if (!open || !props.group) return;
  form.value = {
    key: props.group.key,
    name: props.group.name,
    status: props.group.status,
    sortOrder: props.group.sortOrder,
    notes: props.group.notes ?? '',
  };
});

const canSubmit = computed(() => form.value.name.trim().length > 0);

async function submit(): Promise<void> {
  if (!canSubmit.value) return;
  submitting.value = true;
  try {
    const r = await port.upsertGroup({
      ...form.value,
      notes: form.value.notes?.trim() || null,
    });
    if (r.success) {
      ElMessage.success('已保存');
      visible.value = false;
      emit('saved', r.data);
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="`编辑分组 · ${group?.name ?? ''}`"
    width="520px"
    align-center
    append-to-body
    :close-on-click-modal="false"
  >
    <el-form
      label-position="top"
      @submit.prevent="submit"
    >
      <el-form-item label="供应商">
        <div class="vendor-box">
          <code class="vendor-box__key">{{ form.key }}</code>
          <span
            v-if="channel"
            class="vendor-box__meta"
          >
            {{ channel.protocol }} · {{ ChannelBillingKindLabel[channel.billingKind] }}
          </span>
          <span
            v-else
            class="vendor-box__meta"
          >目录外的自定义分组</span>
        </div>
        <div class="field-hint">
          一个供应商只有一个分组，key 建后不可改。
        </div>
      </el-form-item>

      <el-form-item
        label="显示名"
        required
      >
        <el-input
          v-model="form.name"
          maxlength="96"
          show-word-limit
          placeholder="定价页原样显示"
        />
      </el-form-item>

      <div class="form-row">
        <el-form-item
          label="状态"
          class="form-row__half"
        >
          <el-select
            v-model="form.status"
            style="width: 100%"
          >
            <el-option
              v-for="s in catalogStatusValues"
              :key="s"
              :label="CatalogStatusLabel[s]"
              :value="s"
            />
          </el-select>
        </el-form-item>
        <el-form-item
          label="排序"
          class="form-row__half"
        >
          <el-input-number
            v-model="form.sortOrder"
            :min="0"
            :max="9999"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
      </div>

      <el-form-item label="备注">
        <el-input
          v-model="form.notes"
          type="textarea"
          :rows="2"
          maxlength="1024"
          placeholder="仅管理面可见"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">
        取消
      </el-button>
      <el-button
        type="primary"
        :loading="submitting"
        :disabled="!canSubmit"
        @click="submit"
      >
        保存
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.vendor-box {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
}
.vendor-box__key {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 13px;
  font-weight: 600;
}
.vendor-box__meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.field-hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  line-height: 1.5;
}
</style>
