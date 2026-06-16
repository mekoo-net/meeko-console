<script setup lang="ts">
/**
 * 单条充值记录详情抽屉（只读，懒加载）。
 *
 * 与账单详情抽屉一致：列表行点击「详情」后才按流水号异步拉单条，
 * 抽屉先以 loading 占位。展示渠道 / 业务单号 / 金额，以及详情接口返回的
 * 支付凭证（三方交易号、付款人、确认方式）与入账审计（操作管理员、确认时间、备注）。
 */
import { ref, watch } from 'vue';

import StatusTag from '@/shared/ui/StatusTag.vue';
import { formatMoney } from '@/shared/lib/money';
import { formatDateTime } from '@/shared/lib/date';

import {
  RechargeConfirmationModeLabel,
  RechargeProviderLabel,
  RechargeRefNoLabel,
  RechargeStatusLabel,
  RechargeStatusTone,
  type RechargeProvider,
  type RechargeRecord,
} from '../model/billing.types';
import { getBillingPort } from '../services';

interface Props {
  modelValue: boolean;
  rechargeId: string | null;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
}>();

const billingPort = getBillingPort();

const loading = ref(false);
const errorMsg = ref<string | null>(null);
const record = ref<RechargeRecord | null>(null);

function providerLabel(p: RechargeProvider): string {
  return RechargeProviderLabel[p] ?? p;
}

function refNoLabel(p: RechargeProvider): string {
  return RechargeRefNoLabel[p] ?? '业务单号';
}

/** 操作管理员展示：优先操作人展示名 / uid，回落审计确认人 uid。 */
function operatorText(r: RechargeRecord): string {
  if (r.operator) return r.operator.displayName?.trim() || String(r.operator.iamUserUid);
  if (r.audit?.confirmedByStaffUid) return String(r.audit.confirmedByStaffUid);
  return '—';
}

function close(): void {
  emit('update:modelValue', false);
}

async function load(serial: string): Promise<void> {
  loading.value = true;
  errorMsg.value = null;
  record.value = null;
  const r = await billingPort.getRecharge(serial);
  if (r.success) {
    record.value = r.data;
  } else {
    errorMsg.value = r.error.message;
  }
  loading.value = false;
}

watch(
  () => [props.modelValue, props.rechargeId] as const,
  ([open, id]) => {
    if (open && id) {
      void load(id);
    }
    if (!open) {
      record.value = null;
      errorMsg.value = null;
    }
  },
  { immediate: true },
);
</script>

<template>
  <el-drawer
    :model-value="modelValue"
    title="充值详情"
    direction="rtl"
    size="560px"
    @update:model-value="close"
  >
    <div
      v-loading="loading"
      class="rc-detail"
    >
      <el-empty
        v-if="errorMsg"
        :description="errorMsg"
      />

      <template v-else-if="record">
        <el-descriptions
          :column="2"
          border
          size="small"
          class="rc-detail__summary"
        >
          <el-descriptions-item
            label="流水号"
            :span="2"
          >
            <span class="mono">{{ record.id }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <StatusTag
              :label="RechargeStatusLabel[record.status]"
              :tone="RechargeStatusTone[record.status]"
            />
          </el-descriptions-item>
          <el-descriptions-item label="入账渠道">
            {{ providerLabel(record.source.provider) }}
          </el-descriptions-item>
          <el-descriptions-item label="到账金额">
            <span class="amount-in">
              +{{ formatMoney(record.amount.value, { currency: record.amount.currency }) }}
            </span>
          </el-descriptions-item>
          <el-descriptions-item :label="refNoLabel(record.source.provider)">
            <span class="mono">{{ record.source.refNo || '—' }}</span>
          </el-descriptions-item>
          <el-descriptions-item
            label="创建时间"
            :span="2"
          >
            {{ formatDateTime(record.createdAtUtc, 'YYYY-MM-DD HH:mm:ss') }}
          </el-descriptions-item>
          <el-descriptions-item
            label="入账时间"
            :span="2"
          >
            <span v-if="record.paidAtUtc">
              {{ formatDateTime(record.paidAtUtc, 'YYYY-MM-DD HH:mm:ss') }}
            </span>
            <span
              v-else
              class="muted"
            >—</span>
          </el-descriptions-item>
        </el-descriptions>

        <el-divider />

        <h4 class="section-title">
          账户
        </h4>
        <div class="rc-detail__row">
          <span class="label">主账户</span>
          <span>{{ record.owner.displayName?.trim() || record.owner.accountUid }}</span>
        </div>
        <div class="rc-detail__row">
          <span class="label">联系方式</span>
          <span>{{ record.owner.email?.trim() || '—' }} · {{ record.owner.phone?.trim() || '—' }}</span>
        </div>
        <div class="rc-detail__row">
          <span class="label">账户 UID</span>
          <span class="mono">{{ record.owner.accountUid }}</span>
        </div>

        <el-divider />

        <h4 class="section-title">
          支付信息
        </h4>
        <template v-if="record.payment">
          <div class="rc-detail__row">
            <span class="label">商户单号</span>
            <span class="mono">{{ record.payment.outTradeNo || '—' }}</span>
          </div>
          <div class="rc-detail__row">
            <span class="label">交易流水号</span>
            <span class="mono">{{ record.payment.providerTradeNo || '—' }}</span>
          </div>
          <div class="rc-detail__row">
            <span class="label">实付金额</span>
            <span
              v-if="record.payment.paidAmount != null"
              class="num"
            >
              {{ formatMoney(record.payment.paidAmount, { currency: record.amount.currency }) }}
            </span>
            <span
              v-else
              class="muted"
            >—</span>
          </div>
          <div class="rc-detail__row">
            <span class="label">付款人</span>
            <span>{{ record.payment.payerName?.trim() || '—' }}</span>
          </div>
          <div class="rc-detail__row">
            <span class="label">付款账号</span>
            <span class="mono">{{ record.payment.payerAccount?.trim() || '—' }}</span>
          </div>
          <div class="rc-detail__row">
            <span class="label">确认方式</span>
            <span v-if="record.payment.confirmationMode">
              {{ RechargeConfirmationModeLabel[record.payment.confirmationMode] }}
            </span>
            <span
              v-else
              class="muted"
            >—</span>
          </div>
        </template>
        <el-empty
          v-else
          :image-size="48"
          description="暂无支付凭证（待支付或未回调）"
        />

        <template v-if="record.audit">
          <el-divider />
          <h4 class="section-title">
            入账审计
          </h4>
          <div class="rc-detail__row">
            <span class="label">操作管理员</span>
            <span class="mono">{{ operatorText(record) }}</span>
          </div>
          <div class="rc-detail__row">
            <span class="label">确认时间</span>
            <span v-if="record.audit.confirmedAtUtc">
              {{ formatDateTime(record.audit.confirmedAtUtc, 'YYYY-MM-DD HH:mm:ss') }}
            </span>
            <span
              v-else
              class="muted"
            >—</span>
          </div>
          <div
            v-if="record.audit.expiresAtUtc"
            class="rc-detail__row"
          >
            <span class="label">过期时间</span>
            <span>{{ formatDateTime(record.audit.expiresAtUtc, 'YYYY-MM-DD HH:mm:ss') }}</span>
          </div>
          <div
            v-if="record.audit.failureReason"
            class="rc-detail__row"
          >
            <span class="label">失败原因</span>
            <span class="fail-reason">{{ record.audit.failureReason }}</span>
          </div>
          <div
            v-if="record.audit.remark"
            class="rc-detail__row rc-detail__row--col"
          >
            <span class="label">备注</span>
            <span class="remark">{{ record.audit.remark }}</span>
          </div>
        </template>
      </template>
    </div>
  </el-drawer>
</template>

<style scoped>
.rc-detail {
  font-size: 13px;
  line-height: 1.6;
  min-height: 200px;
}
.rc-detail__summary {
  margin-bottom: 4px;
}
.rc-detail__summary :deep(.el-descriptions__label) {
  width: 84px;
}
.rc-detail__row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
}
.rc-detail__row--col {
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}
.label {
  width: 84px;
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
  font-size: 12.5px;
}
.mono,
.num {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
}
.muted {
  color: var(--el-text-color-placeholder);
}
.amount-in {
  font-weight: 600;
  color: var(--el-color-success);
  font-variant-numeric: tabular-nums;
}
.section-title {
  margin: 6px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}
.fail-reason {
  color: var(--el-color-danger);
}
.remark {
  width: 100%;
  padding: 8px 10px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  font-size: 12.5px;
  color: var(--el-text-color-regular);
  word-break: break-all;
  white-space: pre-wrap;
}
</style>
