<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';

import { formatMoney } from '@/shared/lib/money';

import { refundPayoutOf, type BalanceRefund } from '../model/billing.types';
import { getBillingPort } from '../services';

/** 后台余额退款：只扣钱包余额，财务按折损比例线下打款给用户。 */
const visible = defineModel<boolean>('visible', { required: true });
const props = defineProps<{
  accountUid: string;
  accountLabel?: string;
  /** 当前可用余额，退款金额不能超过它。 */
  available: number;
}>();
const emit = defineEmits<{ success: [refund: BalanceRefund] }>();

const port = getBillingPort();
const submitting = ref(false);
const amount = ref<number | undefined>(undefined);
const lossRate = ref<number | undefined>(undefined);
const note = ref('');
/** 每次打开生成一个：双击或超时重试不会重复扣款。 */
const idempotencyKey = ref('');

watch(visible, (open) => {
  if (!open) return;
  amount.value = undefined;
  lossRate.value = undefined;
  note.value = '';
  idempotencyKey.value = crypto.randomUUID();
});

const money = (v: number) => formatMoney(v, { currency: 'CNY' });
const targetLabel = computed(() => props.accountLabel?.trim() || props.accountUid);
const payout = computed(() =>
  amount.value && lossRate.value !== undefined ? refundPayoutOf(amount.value, lossRate.value) : null,
);

async function submit(): Promise<void> {
  if (!amount.value || amount.value <= 0) {
    ElMessage.warning('请输入扣减金额');
    return;
  }
  if (amount.value > props.available) {
    ElMessage.warning(`扣减金额不能超过可用余额 ${money(props.available)}`);
    return;
  }
  if (lossRate.value === undefined) {
    ElMessage.warning('请输入折损比例');
    return;
  }
  submitting.value = true;
  try {
    const r = await port.createBalanceRefund({
      accountUid: props.accountUid,
      amount: amount.value,
      lossRatePercent: lossRate.value,
      note: note.value.trim() || undefined,
      idempotencyKey: idempotencyKey.value,
    });
    if (!r.success) {
      ElMessage.error(r.error.message);
      return;
    }
    ElMessage.success(`退款成功，请线下打款 ${money(r.data.payoutAmount)}`);
    visible.value = false;
    emit('success', r.data);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <el-drawer
    v-model="visible"
    title="退款"
    size="480px"
    append-to-body
    :close-on-click-modal="false"
  >
    <el-form
      label-position="top"
      @submit.prevent="submit"
    >
      <el-form-item label="目标账户">
        <el-input
          :model-value="targetLabel"
          disabled
        />
      </el-form-item>
      <el-form-item label="可用余额">
        <span class="balance">{{ money(available) }}</span>
      </el-form-item>
      <el-form-item
        label="扣减金额（元）"
        required
      >
        <el-input-number
          v-model="amount"
          :min="0.01"
          :max="available"
          :precision="2"
          :controls="false"
          placeholder="从钱包扣减"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item
        label="折损比例（%）"
        required
      >
        <el-input-number
          v-model="lossRate"
          :min="0"
          :max="99.99"
          :precision="2"
          :controls="false"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item label="实退金额">
        <span
          v-if="payout !== null"
          class="payout"
        >{{ money(payout) }}</span>
        <span
          v-else
          class="muted"
        >填写扣减金额和折损比例后自动计算</span>
      </el-form-item>
      <el-form-item label="备注">
        <el-input
          v-model="note"
          type="textarea"
          :rows="3"
          maxlength="200"
          show-word-limit
          placeholder="可选，如收款账户、退款原因"
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
        @click="submit"
      >
        确认退款
      </el-button>
    </template>
  </el-drawer>
</template>

<style scoped>
.balance {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  font-variant-numeric: tabular-nums;
}
.payout {
  font-size: 18px;
  font-weight: 600;
  color: var(--el-color-danger);
  font-variant-numeric: tabular-nums;
}
.muted {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
</style>
