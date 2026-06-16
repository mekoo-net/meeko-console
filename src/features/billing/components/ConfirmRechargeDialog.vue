<script setup lang="ts">
/**
 * 管理员手工入账确认对话框。
 *
 * 适用场景：
 *  - 手工充值单（provider=manual）尚处「待支付」，财务核对到款后入账。
 *  - 自动充值（支付宝 / 微信）三方掉单，管理员凭后台交易记录补录入账。
 *
 * 确认后调用 confirmRecharge，待支付 → 已支付；后端按当前管理员记录入账操作人。
 * 表单采集支付凭证：交易流水号、付款人、付款账号、备注（均可选，便于对账）。
 */
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';

import { formatMoney } from '@/shared/lib/money';

import {
  RechargeProviderLabel,
  type ConfirmManualRechargeInput,
  type RechargeProvider,
  type RechargeRecord,
} from '../model/billing.types';
import { getBillingPort } from '../services';

const props = defineProps<{
  visible: boolean;
  recharge: RechargeRecord | null;
}>();
const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void;
  (e: 'success', updated: RechargeRecord): void;
}>();

const billingPort = getBillingPort();
const submitting = ref(false);

const providerTradeNo = ref('');
const payerName = ref('');
const payerAccount = ref('');
const remark = ref('');

const dialogVisible = computed({
  get: () => props.visible,
  set: (v) => emit('update:visible', v),
});

function providerLabel(p: RechargeProvider): string {
  return RechargeProviderLabel[p] ?? p;
}

const amountText = computed(() => {
  const r = props.recharge;
  if (!r) return '—';
  return formatMoney(r.amount.value, { currency: r.amount.currency });
});

function resetForm(): void {
  providerTradeNo.value = '';
  payerName.value = '';
  payerAccount.value = '';
  remark.value = '';
}

watch(
  () => props.visible,
  (open) => {
    if (open) resetForm();
  },
);

async function handleSubmit(): Promise<void> {
  const r = props.recharge;
  if (!r) {
    ElMessage.warning('缺少充值单');
    return;
  }
  if (r.status !== 'pending') {
    ElMessage.warning('该充值单当前状态不可入账');
    return;
  }

  const input: ConfirmManualRechargeInput = {
    providerTradeNo: providerTradeNo.value.trim() || undefined,
    payerName: payerName.value.trim() || undefined,
    payerAccount: payerAccount.value.trim() || undefined,
    remark: remark.value.trim() || undefined,
  };

  submitting.value = true;
  try {
    const res = await billingPort.confirmRecharge(r.id, input);
    if (res.success) {
      ElMessage.success('入账成功');
      emit('success', res.data);
      dialogVisible.value = false;
    } else {
      ElMessage.error(res.error.message);
    }
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    title="确认入账"
    width="520px"
    destroy-on-close
    :close-on-click-modal="false"
  >
    <template v-if="recharge">
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="确认后该充值单将由「待支付」变为「已支付」并给账户钱包加余额，操作不可撤销。"
        class="confirm-recharge__alert"
      />

      <el-descriptions
        :column="1"
        border
        size="small"
        class="confirm-recharge__summary"
      >
        <el-descriptions-item label="充值单号">
          <span class="mono">{{ recharge.id }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="入账渠道">
          {{ providerLabel(recharge.source.provider) }}
        </el-descriptions-item>
        <el-descriptions-item label="到账账户">
          <span class="mono">{{ recharge.owner.displayName?.trim() || recharge.owner.accountUid }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="到账金额">
          <span class="confirm-recharge__amount">+{{ amountText }}</span>
        </el-descriptions-item>
      </el-descriptions>

      <el-form
        label-width="92px"
        label-position="right"
        @submit.prevent="handleSubmit"
      >
        <el-form-item label="交易流水号">
          <el-input
            v-model="providerTradeNo"
            maxlength="64"
            placeholder="三方支付交易号 / 银行流水号（可选）"
            clearable
          />
        </el-form-item>
        <el-form-item label="付款人">
          <el-input
            v-model="payerName"
            maxlength="64"
            placeholder="付款人姓名（可选）"
            clearable
          />
        </el-form-item>
        <el-form-item label="付款账号">
          <el-input
            v-model="payerAccount"
            maxlength="64"
            placeholder="支付宝账号 / 微信 openid / 银行卡尾号（可选）"
            clearable
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="remark"
            type="textarea"
            :rows="3"
            maxlength="200"
            show-word-limit
            placeholder="可选，如核对说明 / 审批单号"
          />
        </el-form-item>
      </el-form>
    </template>

    <template #footer>
      <el-button @click="dialogVisible = false">
        取消
      </el-button>
      <el-button
        type="primary"
        :loading="submitting"
        @click="handleSubmit"
      >
        确认入账
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.confirm-recharge__alert {
  margin-bottom: 14px;
}
.confirm-recharge__summary {
  margin-bottom: 16px;
}
.confirm-recharge__summary :deep(.el-descriptions__label) {
  width: 92px;
}
.confirm-recharge__amount {
  font-weight: 600;
  color: var(--el-color-success);
  font-variant-numeric: tabular-nums;
}
.mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
}
</style>
