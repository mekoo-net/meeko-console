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

interface Props {
  modelValue: boolean;
  billId: string | null;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
}>();

const billingPort = getBillingPort();

const loading = ref(false);
const errorMsg = ref<string | null>(null);
const bill = ref<BillingEntry | null>(null);

const RefTypeLabel: Record<string, string> = {
  recharge: '充值',
  hold: '用量预占',
  manual: '人工调账',
};

interface DeductionRow {
  tag: string;
  name: string;
  sub: string;
  amount: number;
  kind: 'voucher' | 'balance';
}

function deductionRows(row: BillingEntry): DeductionRow[] {
  const d = row.deduction;
  if (!d) return [];
  const rows: DeductionRow[] = [];
  for (const v of d.voucherItems) {
    const tag = v.deductKind ? VoucherDeductKindLabel[v.deductKind] : '代金券';
    rows.push({
      tag,
      name: v.name?.trim() || tag,
      sub: v.serialNo ?? `#${v.userVoucherId}`,
      amount: v.amountDeducted,
      kind: 'voucher',
    });
  }
  if (d.voucherItems.length === 0 && d.voucherDeducted > 0) {
    rows.push({ tag: '券', name: '代金券抵扣', sub: '', amount: d.voucherDeducted, kind: 'voucher' });
  }
  rows.push({ tag: '余额', name: '钱包余额', sub: '', amount: d.balanceDeducted, kind: 'balance' });
  return rows;
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
  } else {
    errorMsg.value = r.error.message;
  }
  loading.value = false;
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
          <el-descriptions-item label="状态">
            <StatusTag :label="BillStatusLabel[bill.status]" :tone="BillStatusTone[bill.status]" />
          </el-descriptions-item>
          <el-descriptions-item label="类型">
            <span v-if="bill.subType">{{ BillSubTypeLabel[bill.subType] }}</span>
            <span v-else class="muted">—</span>
          </el-descriptions-item>
          <el-descriptions-item label="产品">
            <span v-if="bill.productCode" class="mono">{{ bill.productCode }}</span>
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
          <span>{{ bill.ownerDisplayName?.trim() || bill.ownerAccountUid }}</span>
        </div>
        <div class="bill-detail__row">
          <span class="label">联系方式</span>
          <span>{{ bill.ownerEmail?.trim() || '—' }} · {{ bill.ownerPhone?.trim() || '—' }}</span>
        </div>
        <div class="bill-detail__row">
          <span class="label">账户 UID</span>
          <span class="mono">{{ bill.ownerAccountUid }}</span>
        </div>
        <div v-if="bill.operatorAccountUid !== bill.ownerAccountUid" class="bill-detail__row">
          <span class="label">实操(IAM)</span>
          <span class="mono">{{ bill.operatorAccountUid }}</span>
        </div>

        <el-divider />

        <h4 class="section-title">金额</h4>
        <div class="bill-detail__row">
          <span class="label">原始金额</span>
          <span class="num">{{ formatMoney(bill.originalAmount, { currency: bill.currency }) }}</span>
        </div>
        <div class="bill-detail__row">
          <span class="label">实际扣费</span>
          <span class="num cost-total">
            {{ formatMoney(bill.actualAmount, { currency: bill.currency }) }}
          </span>
        </div>
        <div v-if="bill.balanceAfter != null" class="bill-detail__row">
          <span class="label">扣后余额</span>
          <span class="num">{{ formatMoney(bill.balanceAfter, { currency: bill.currency }) }}</span>
        </div>

        <template v-if="bill.deduction">
          <el-divider />
          <h4 class="section-title">
            扣款明细
            <span v-if="bill.deduction.voucherDeducted > 0" class="saved-hint">
              代金券共抵 {{ formatMoney(bill.deduction.voucherDeducted, { currency: bill.currency }) }}
            </span>
          </h4>
          <div
            v-for="(d, i) in deductionRows(bill)"
            :key="i"
            class="deduct-row"
          >
            <span
              class="deduct-row__tag"
              :class="d.kind === 'voucher' ? 'is-voucher' : 'is-balance'"
            >
              {{ d.tag }}
            </span>
            <span class="deduct-row__name">
              {{ d.name }}
              <span v-if="d.sub" class="deduct-row__serial mono">{{ d.sub }}</span>
            </span>
            <span class="deduct-row__amount num">
              -{{ formatMoney(d.amount, { currency: bill.currency }) }}
            </span>
          </div>
          <div class="deduct-total">
            应扣合计 {{ formatMoney(bill.deduction.total, { currency: bill.currency }) }}
          </div>
        </template>

        <el-divider />

        <h4 class="section-title">关联业务</h4>
        <div class="bill-detail__row">
          <span class="label">关联类型</span>
          <span>{{ bill.refType ? (RefTypeLabel[bill.refType] ?? bill.refType) : '—' }}</span>
        </div>
        <div class="bill-detail__row">
          <span class="label">关联单号</span>
          <span class="mono">{{ bill.refId ?? '—' }}</span>
        </div>

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

        <template v-if="bill.reversedCode || bill.reversedAtUtc">
          <el-divider />
          <h4 class="section-title">驳回 / 退还</h4>
          <div class="bill-detail__row">
            <span class="label">原因</span>
            <span>{{ bill.reversedCode ? BillReversedCodeLabel[bill.reversedCode] : '—' }}</span>
          </div>
          <div class="bill-detail__row">
            <span class="label">时间</span>
            <span>{{ bill.reversedAtUtc ? formatDateTime(bill.reversedAtUtc, 'YYYY-MM-DD HH:mm:ss') : '—' }}</span>
          </div>
          <div class="bill-detail__row">
            <span class="label">操作人</span>
            <span class="mono">{{ bill.reversedByIamId ?? '—' }}</span>
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
</style>
