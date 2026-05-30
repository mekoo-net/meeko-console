<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';

import {
  RechargeProviderLabel,
  type RechargeProvider,
} from '../model/billing.types';
import { useAccountDirectory } from '../composables/useAccountDirectory';
import { getBillingPort } from '../services';

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void;
  (e: 'success'): void;
}>();

const internalSources: RechargeProvider[] = ['manual', 'cs_compensation', 'marketing_reward'];

const dir = useAccountDirectory();
const billingPort = getBillingPort();
const submitting = ref(false);

const ownerAccountUid = ref('');
const amount = ref<number | null>(null);
const source = ref<RechargeProvider>('manual');
const note = ref('');
const idempotencyKey = ref('');

const dialogVisible = computed({
  get: () => props.visible,
  set: (v) => emit('update:visible', v),
});

const accountOptions = computed(() => dir.data.value?.items ?? []);

function resetForm(): void {
  ownerAccountUid.value = '';
  amount.value = null;
  source.value = 'manual';
  note.value = '';
  idempotencyKey.value = '';
}

watch(
  () => props.visible,
  (open) => {
    if (open) resetForm();
  },
);

async function handleSubmit(): Promise<void> {
  if (!ownerAccountUid.value.trim()) {
    ElMessage.warning('请选择目标账户');
    return;
  }
  if (amount.value == null || amount.value <= 0) {
    ElMessage.warning('请输入大于 0 的入账金额');
    return;
  }

  submitting.value = true;
  try {
    const r = await billingPort.createInternalRecharge({
      ownerAccountUid: ownerAccountUid.value.trim(),
      amount: amount.value,
      source: source.value,
      note: note.value.trim() || undefined,
      idempotencyKey: idempotencyKey.value.trim() || undefined,
    });
    if (r.success) {
      ElMessage.success('人工入账成功');
      emit('success');
      dialogVisible.value = false;
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
    v-model="dialogVisible"
    title="人工入账"
    width="520px"
    destroy-on-close
    :close-on-click-modal="false"
  >
    <el-form label-width="96px" label-position="right" @submit.prevent="handleSubmit">
      <el-form-item label="目标账户" required>
        <el-select
          v-model="ownerAccountUid"
          placeholder="选择账户"
          filterable
          style="width: 100%"
        >
          <el-option
            v-for="a in accountOptions"
            :key="a.uid"
            :label="`${a.displayName} (${a.uid})`"
            :value="a.uid"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="入账金额" required>
        <el-input-number
          v-model="amount"
          :min="0.01"
          :precision="2"
          :step="10"
          controls-position="right"
          style="width: 100%"
        />
      </el-form-item>

      <el-form-item label="入账来源" required>
        <el-select v-model="source" style="width: 100%">
          <el-option
            v-for="s in internalSources"
            :key="s"
            :label="RechargeProviderLabel[s]"
            :value="s"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="备注">
        <el-input
          v-model="note"
          type="textarea"
          :rows="3"
          maxlength="200"
          show-word-limit
          placeholder="可选，如审批单说明"
        />
      </el-form-item>

      <el-form-item label="幂等键">
        <el-input
          v-model="idempotencyKey"
          maxlength="64"
          placeholder="可选，重复提交时防重复入账"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">确认入账</el-button>
    </template>
  </el-dialog>
</template>
