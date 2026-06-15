<script setup lang="ts">
/**
 * 单条账单详情抽屉（只读，懒加载）。
 *
 * 与调用日志详情抽屉一致：列表行点击「详情」后才按流水号异步拉单条，
 * 抽屉先以 loading 占位，加载完成再渲染。展示扣款明细（逐张代金券：
 * 券名 / 序列号 / 类型 / 抵扣额 + 钱包余额 + 应扣合计）、账户与关联业务信息。
 */
import { ref, watch } from 'vue';

import StatusTag from '@/shared/ui/StatusTag.vue';
import { formatMoney } from '@/shared/lib/money';
import { formatDateTime } from '@/shared/lib/date';

import {
  BillFailureCodeLabel,
  BillReversedCodeLabel,
  BillStatusLabel,
  BillStatusTone,
  BillSubTypeLabel,
  VoucherDeductKindLabel,
  type BillingEntry,
} from '../model/billing.types';
import { getBillingPort } from '../services';
import { getDemuxaiLogsPort } from '@/features/demuxai/services';

interface Props {
  modelValue: boolean;
  billId: string | null;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
}>();

const billingPort = getBillingPort();
const demuxaiLogsPort = getDemuxaiLogsPort();

const loading = ref(false);
const errorMsg = ref<string | null>(null);
const bill = ref<BillingEntry | null>(null);

type VoucherItem = NonNullable<BillingEntry['deduction']>['voucherItems'][number];

function kindLabel(v: VoucherItem): string {
  return v.deductKind ? VoucherDeductKindLabel[v.deductKind] : '代金券';
}

/** 满减/折扣券的规则副标题，无门槛券返回空串。 */
function ruleText(v: VoucherItem, currency: string): string {
  if (v.deductKind === 'fullReduction' && v.thresholdAmount) {
    return `满 ${formatMoney(v.thresholdAmount, { currency })} 可用`;
  }
  if (v.deductKind === 'discount' && v.discountRate != null) {
    return `${(v.discountRate * 10).toFixed(1)} 折`;
  }
  return '';
}

function close(): void {
  emit('update:modelValue', false);
}

async function load(serial: string): Promise<void> {
  loading.value = true;
  errorMsg.value = null;
  bill.value = null;
  const r = await billingPort.getBill(serial);
  if (r.success) {
    bill.value = r.data;
    void resolveOriginLog(r.data);
  } else {
    errorMsg.value = r.error.message;
  }
  loading.value = false;
}

/**
 * 「业务号」跨域回填：账单域只持有 requestId（= 调用日志的 RequestId），不感知产品域日志号。
 * 据 requestId 反查发起扣费的调用日志号（= 调用日志页的「日志编号」），异步填入。
 * 后端已返回 originLogId 时跳过；解析失败静默（详情仍可用，仅业务号留空）。
 */
async function resolveOriginLog(entry: BillingEntry): Promise<void> {
  const { requestId, originLogId } = entry.business;
  if (originLogId || !requestId) return;
  const r = await demuxaiLogsPort.resolveLogIds([requestId]);
  if (!r.success) return;
  const logId = r.data[requestId];
  // 期间可能已切到别的账单，校验当前展示的仍是同一条再写回。
  if (logId && bill.value?.id === entry.id) {
    bill.value = { ...bill.value, business: { ...bill.value.business, originLogId: logId } };
  }
}

watch(
  () => [props.modelValue, props.billId] as const,
  ([open, id]) => {
    if (open && id) {
      void load(id);
    }
    if (!open) {
      bill.value = null;
      errorMsg.value = null;
    }
  },
  { immediate: true },
);
</script>

<template>
  <el-drawer
    :model-value="modelValue"
    title="账单详情"
    direction="rtl"
    size="560px"
    @update:model-value="close"
  >
    <div v-loading="loading" class="bill-detail">
      <el-empty v-if="errorMsg" :description="errorMsg" />

      <template v-else-if="bill">
        <el-descriptions :column="2" border size="small" class="bill-detail__summary">
          <el-descriptions-item label="流水号" :span="2">
            <span class="mono">{{ bill.id }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="业务号" :span="2">
            <span v-if="bill.business.originLogId" class="mono">{{ bill.business.originLogId }}</span>
            <span v-else class="muted">—</span>
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <StatusTag :label="BillStatusLabel[bill.status]" :tone="BillStatusTone[bill.status]" />
          </el-descriptions-item>
          <el-descriptions-item label="类型">
            <span v-if="bill.business.subType">{{ BillSubTypeLabel[bill.business.subType] }}</span>
            <span v-else class="muted">—</span>
          </el-descriptions-item>
          <el-descriptions-item label="产品">
            <span v-if="bill.business.productCode" class="mono">{{ bill.business.productCode }}</span>
            <span v-else class="muted">—</span>
          </el-descriptions-item>
          <el-descriptions-item label="发生时间">
            {{ formatDateTime(bill.occurredAtUtc, 'YYYY-MM-DD HH:mm:ss') }}
          </el-descriptions-item>
        </el-descriptions>

        <el-divider />

        <h4 class="section-title">账户</h4>
        <div class="bill-detail__row">
          <span class="label">主账户</span>
          <span>{{ bill.owner.displayName?.trim() || bill.owner.accountUid }}</span>
        </div>
        <div class="bill-detail__row">
          <span class="label">联系方式</span>
          <span>{{ bill.owner.email?.trim() || '—' }} · {{ bill.owner.phone?.trim() || '—' }}</span>
        </div>
        <div class="bill-detail__row">
          <span class="label">账户 UID</span>
          <span class="mono">{{ bill.owner.accountUid }}</span>
        </div>
        <div v-if="bill.operator.accountUid !== bill.owner.accountUid" class="bill-detail__row">
          <span class="label">实操(IAM)</span>
          <span class="mono">{{ bill.operator.accountUid }}</span>
        </div>

        <el-divider />

        <h4 class="section-title">金额</h4>
        <div class="bill-detail__row">
          <span class="label">原始金额</span>
          <span class="num">{{ formatMoney(bill.amount.original, { currency: bill.amount.currency }) }}</span>
        </div>
        <div class="bill-detail__row">
          <span class="label">实际扣费</span>
          <span class="num cost-total">
            {{ formatMoney(bill.amount.actual, { currency: bill.amount.currency }) }}
          </span>
        </div>
        <div v-if="bill.amount.balanceAfter != null" class="bill-detail__row">
          <span class="label">扣后余额</span>
          <span class="num">{{ formatMoney(bill.amount.balanceAfter, { currency: bill.amount.currency }) }}</span>
        </div>

        <template v-if="bill.deduction">
          <el-divider />
          <h4 class="section-title">
            扣款明细
            <span v-if="bill.deduction.voucherDeducted > 0" class="saved-hint">
              代金券共抵 {{ formatMoney(bill.deduction.voucherDeducted, { currency: bill.amount.currency }) }}
            </span>
          </h4>

          <!-- 逐张代金券（完整属性卡片） -->
          <div
            v-for="(v, i) in bill.deduction.voucherItems"
            :key="i"
            class="voucher-card"
          >
            <div class="voucher-card__head">
              <span class="voucher-card__tag">{{ kindLabel(v) }}</span>
              <span class="voucher-card__name">{{ v.name?.trim() || kindLabel(v) }}</span>
              <span class="voucher-card__deducted num">
                -{{ formatMoney(v.amountDeducted, { currency: bill.amount.currency }) }}
              </span>
            </div>
            <div class="voucher-card__meta">
              <span class="voucher-card__serial mono">{{ v.serialNo ?? `#${v.userVoucherId}` }}</span>
              <span v-if="ruleText(v, bill.amount.currency)" class="voucher-card__rule">
                {{ ruleText(v, bill.amount.currency) }}
              </span>
            </div>
            <div class="voucher-card__props">
              <span v-if="v.faceValue != null">
                面额 {{ formatMoney(v.faceValue, { currency: bill.amount.currency }) }}
              </span>
              <span v-if="v.remainingValue != null">
                当前剩余 {{ formatMoney(v.remainingValue, { currency: bill.amount.currency }) }}
              </span>
              <span v-if="v.validToUtc != null">
                有效期至 {{ formatDateTime(v.validToUtc, 'YYYY-MM-DD HH:mm') }}
              </span>
            </div>
          </div>

          <!-- 无逐券明细但有券抵扣合计的兜底 -->
          <div
            v-if="bill.deduction.voucherItems.length === 0 && bill.deduction.voucherDeducted > 0"
            class="deduct-row"
          >
            <span class="deduct-row__tag is-voucher">券</span>
            <span class="deduct-row__name">代金券抵扣</span>
            <span class="deduct-row__amount num">
              -{{ formatMoney(bill.deduction.voucherDeducted, { currency: bill.amount.currency }) }}
            </span>
          </div>

          <!-- 钱包余额 -->
          <div class="deduct-row">
            <span class="deduct-row__tag is-balance">余额</span>
            <span class="deduct-row__name">钱包余额</span>
            <span class="deduct-row__amount num">
              -{{ formatMoney(bill.deduction.balanceDeducted, { currency: bill.amount.currency }) }}
            </span>
          </div>

          <div class="deduct-total">
            应扣合计 {{ formatMoney(bill.deduction.total, { currency: bill.amount.currency }) }}
          </div>
        </template>

        <template v-if="bill.failureCode">
          <el-divider />
          <h4 class="section-title">失败信息</h4>
          <div class="bill-detail__row">
            <span class="label">失败原因</span>
            <el-tag size="small" type="danger" effect="plain">
              {{ BillFailureCodeLabel[bill.failureCode] }}
            </el-tag>
          </div>
        </template>

        <template v-if="bill.reversal?.code || bill.reversal?.atUtc">
          <el-divider />
          <h4 class="section-title">驳回 / 退还</h4>
          <div class="bill-detail__row">
            <span class="label">原因</span>
            <span>{{ bill.reversal.code ? BillReversedCodeLabel[bill.reversal.code] : '—' }}</span>
          </div>
          <div class="bill-detail__row">
            <span class="label">时间</span>
            <span>{{ bill.reversal.atUtc ? formatDateTime(bill.reversal.atUtc, 'YYYY-MM-DD HH:mm:ss') : '—' }}</span>
          </div>
          <div class="bill-detail__row">
            <span class="label">操作人</span>
            <span class="mono">{{ bill.reversal.byIamId ?? '—' }}</span>
          </div>
        </template>
      </template>
    </div>
  </el-drawer>
</template>

<style scoped>
.bill-detail {
  font-size: 13px;
  line-height: 1.6;
  min-height: 200px;
}
.bill-detail__summary {
  margin-bottom: 4px;
}
.bill-detail__summary :deep(.el-descriptions__label) {
  width: 84px;
}
.bill-detail__row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
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
.cost-total {
  font-weight: 600;
  color: var(--el-color-warning);
}
.section-title {
  margin: 6px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-regular);
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.saved-hint {
  font-size: 11.5px;
  font-weight: 500;
  color: var(--el-color-success);
}
.deduct-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}
.deduct-row__tag {
  flex-shrink: 0;
  font-size: 11px;
  padding: 0 5px;
  border-radius: 3px;
  border: 1px solid currentColor;
  line-height: 1.5;
}
.deduct-row__tag.is-voucher {
  color: var(--el-color-success);
}
.deduct-row__tag.is-balance {
  color: var(--el-color-warning);
}
.deduct-row__name {
  flex: 1;
  color: var(--el-text-color-regular);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.deduct-row__serial {
  margin-left: 6px;
  color: var(--el-text-color-placeholder);
  font-size: 11px;
}
.deduct-row__amount {
  flex-shrink: 0;
  color: var(--el-text-color-regular);
}
.deduct-total {
  margin-top: 6px;
  text-align: right;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.voucher-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 8px 10px;
  margin-bottom: 8px;
  background: var(--el-fill-color-blank);
}
.voucher-card__head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.voucher-card__tag {
  flex-shrink: 0;
  font-size: 11px;
  padding: 0 5px;
  border-radius: 3px;
  border: 1px solid var(--el-color-success);
  color: var(--el-color-success);
  line-height: 1.5;
}
.voucher-card__name {
  flex: 1;
  font-weight: 500;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.voucher-card__deducted {
  flex-shrink: 0;
  font-weight: 600;
  color: var(--el-color-success);
}
.voucher-card__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}
.voucher-card__serial {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}
.voucher-card__rule {
  font-size: 11px;
  color: var(--el-color-warning);
  border: 1px solid currentColor;
  border-radius: 3px;
  padding: 0 4px;
  line-height: 1.5;
}
.voucher-card__props {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin-top: 6px;
  font-size: 11.5px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}
</style>
