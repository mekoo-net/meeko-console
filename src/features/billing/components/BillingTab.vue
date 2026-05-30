<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RefreshLeft, Search } from '@element-plus/icons-vue';

import StatusTag from '@/shared/ui/StatusTag.vue';
import { formatMoney } from '@/shared/lib/money';
import { formatDateTime } from '@/shared/lib/date';

import {
  billStatusValues,
  billSubTypeValues,
  BillStatusLabel,
  BillStatusTone,
  BillSubTypeLabel,
  BusinessCodeLabel,
  rechargeProviderValues,
  rechargeStatusValues,
  RechargeProviderLabel,
  RechargeStatusLabel,
  RechargeStatusTone,
  type BillingEntry,
  type BillStatus,
  type BillSubType,
  type RechargeProvider,
  type RechargeRecord,
  type RechargeStatus,
} from '../model/billing.types';
import { getBillingPort } from '../services';

const props = defineProps<{ accountUid: string }>();

const billingPort = getBillingPort();

const rechargeProvider = ref<RechargeProvider | 'all'>('all');
const rechargeStatus = ref<RechargeStatus | 'all'>('all');
const rechargeItems = ref<RechargeRecord[]>([]);
const rechargeLoading = ref(false);

const billSubType = ref<BillSubType | 'all'>('all');
const billStatus = ref<BillStatus | 'all'>('all');
const billItems = ref<BillingEntry[]>([]);
const billLoading = ref(false);

async function fetchRecharges(): Promise<void> {
  rechargeLoading.value = true;
  try {
    const r = await billingPort.listRecharges({
      page: 1,
      pageSize: 100,
      filter: {
        accountUid: props.accountUid,
        provider: rechargeProvider.value,
        status: rechargeStatus.value,
      },
    });
    if (r.success) rechargeItems.value = r.data.items;
  } finally {
    rechargeLoading.value = false;
  }
}

async function fetchBills(): Promise<void> {
  billLoading.value = true;
  try {
    const r = await billingPort.listBills({
      page: 1,
      pageSize: 100,
      filter: {
        accountUid: props.accountUid,
        business: 'all',
        subType: billSubType.value,
        status: billStatus.value,
      },
    });
    if (r.success) billItems.value = r.data.items;
  } finally {
    billLoading.value = false;
  }
}

function resetRecharge(): void {
  rechargeProvider.value = 'all';
  rechargeStatus.value = 'all';
}
function resetBill(): void {
  billSubType.value = 'all';
  billStatus.value = 'all';
}

watch([rechargeProvider, rechargeStatus], () => void fetchRecharges());
watch([billSubType, billStatus], () => void fetchBills());
watch(
  () => props.accountUid,
  () => {
    void fetchRecharges();
    void fetchBills();
  },
);

onMounted(() => {
  void fetchRecharges();
  void fetchBills();
});

const totalRecharge = computed(() => rechargeItems.value.length);
const totalBill = computed(() => billItems.value.length);

function isInternalProvider(p: RechargeProvider): boolean {
  return p === 'cs_compensation' || p === 'marketing_reward' || p === 'manual';
}
</script>

<template>
  <div class="billing-tab">
    <!-- 上半：充值订单 -->
    <section class="billing-section">
      <div class="billing-section__head">
        <h4 class="billing-section__title">
          充值记录
          <span class="billing-section__count">共 {{ totalRecharge }} 条</span>
        </h4>
      </div>

      <div class="tab-filter">
        <el-form :inline="true" @submit.prevent>
          <el-form-item label="渠道">
            <el-select v-model="rechargeProvider" style="width: 180px">
              <el-option label="全部渠道" value="all" />
              <el-option
                v-for="p in rechargeProviderValues"
                :key="p"
                :label="RechargeProviderLabel[p]"
                :value="p"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="状态">
            <el-select v-model="rechargeStatus" style="width: 180px">
              <el-option label="全部状态" value="all" />
              <el-option
                v-for="s in rechargeStatusValues"
                :key="s"
                :label="RechargeStatusLabel[s]"
                :value="s"
              />
            </el-select>
          </el-form-item>
        </el-form>
        <div class="tab-filter__actions">
          <el-button type="primary" :icon="Search" :loading="rechargeLoading" @click="fetchRecharges()">
            查询
          </el-button>
          <el-button :icon="RefreshLeft" @click="resetRecharge()">重置</el-button>
        </div>
      </div>

      <el-table
        v-loading="rechargeLoading"
        :data="rechargeItems"
        row-key="id"
        size="small"
        class="compact-table"
        empty-text="暂无充值记录"
      >
        <el-table-column label="流水号" min-width="180" prop="id">
          <template #default="{ row }: { row: RechargeRecord }">
            <span class="cell-uid">{{ row.id }}</span>
          </template>
        </el-table-column>
        <el-table-column label="渠道" width="130">
          <template #default="{ row }: { row: RechargeRecord }">
            <el-tag
              size="small"
              :type="isInternalProvider(row.provider) ? 'warning' : 'success'"
              effect="plain"
              round
            >
              {{ RechargeProviderLabel[row.provider] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="业务单号" min-width="220">
          <template #default="{ row }: { row: RechargeRecord }">
            <span class="cell-refno">{{ row.refNo }}</span>
          </template>
        </el-table-column>
        <el-table-column label="金额" width="140" align="right">
          <template #default="{ row }: { row: RechargeRecord }">
            <span class="cell-money cell-money--in">
              +{{ formatMoney(row.amount, { currency: row.currency }) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }: { row: RechargeRecord }">
            <StatusTag :label="RechargeStatusLabel[row.status]" :tone="RechargeStatusTone[row.status]" />
          </template>
        </el-table-column>
        <el-table-column label="日期" width="170">
          <template #default="{ row }: { row: RechargeRecord }">
            <span class="cell-date">{{ formatDateTime(row.paidAtUtc ?? row.createdAtUtc) }}</span>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <!-- 下半：账单（扣款） -->
    <section class="billing-section">
      <div class="billing-section__head">
        <h4 class="billing-section__title">
          账单流水
          <span class="billing-section__count">共 {{ totalBill }} 条</span>
        </h4>
      </div>

      <div class="tab-filter">
        <el-form :inline="true" @submit.prevent>
          <el-form-item label="类型">
            <el-select v-model="billSubType" style="width: 180px">
              <el-option label="全部类型" value="all" />
              <el-option
                v-for="t in billSubTypeValues"
                :key="t"
                :label="BillSubTypeLabel[t]"
                :value="t"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="状态">
            <el-select v-model="billStatus" style="width: 180px">
              <el-option label="全部状态" value="all" />
              <el-option
                v-for="s in billStatusValues"
                :key="s"
                :label="BillStatusLabel[s]"
                :value="s"
              />
            </el-select>
          </el-form-item>
        </el-form>
        <div class="tab-filter__actions">
          <el-button type="primary" :icon="Search" :loading="billLoading" @click="fetchBills()">
            查询
          </el-button>
          <el-button :icon="RefreshLeft" @click="resetBill()">重置</el-button>
        </div>
      </div>

      <el-table
        v-loading="billLoading"
        :data="billItems"
        row-key="id"
        size="small"
        class="compact-table"
        empty-text="暂无账单记录"
      >
        <el-table-column label="流水号" min-width="180" prop="id">
          <template #default="{ row }: { row: BillingEntry }">
            <span class="cell-uid">{{ row.id }}</span>
          </template>
        </el-table-column>
        <el-table-column label="业务" width="100">
          <template #default="{ row }: { row: BillingEntry }">
            <el-tag
              v-if="row.business != null"
              size="small"
              :type="row.business === 'demux' ? 'primary' : 'info'"
              effect="plain"
              round
            >
              {{ BusinessCodeLabel[row.business] }}
            </el-tag>
            <span v-else class="cell-muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="产品" min-width="160">
          <template #default="{ row }: { row: BillingEntry }">
            <span v-if="row.productCode" class="cell-product">{{ row.productCode }}</span>
            <span v-else class="cell-muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="140">
          <template #default="{ row }: { row: BillingEntry }">
            <div class="cell-type">
              <el-tag
                v-if="row.subType != null"
                size="small"
                :type="row.subType === 'usage' ? 'warning' : 'info'"
                effect="plain"
                round
              >
                {{ BillSubTypeLabel[row.subType] }}
              </el-tag>
              <span v-else class="cell-muted">—</span>
              <span v-if="row.operatorAccountUid !== row.ownerAccountUid" class="cell-type__iam">
                IAM
              </span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="金额" width="160" align="right">
          <template #default="{ row }: { row: BillingEntry }">
            <div class="cell-amount">
              <span
                class="cell-money"
                :class="{
                  'cell-money--reverted': row.status === 'reversed' || row.status === 'partial_refunded',
                  'cell-money--failed': row.status === 'failed',
                  'cell-money--out': row.status === 'completed' && row.refType !== 'recharge',
                  'cell-money--in': row.refType === 'recharge',
                }"
              >
                {{ row.refType === 'recharge' ? '+' : '-' }}{{ formatMoney(row.actualAmount, { currency: row.currency }) }}
              </span>
              <span
                v-if="row.actualAmount !== row.originalAmount"
                class="cell-amount__original"
              >
                原 {{ formatMoney(row.originalAmount, { currency: row.currency }) }}
              </span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }: { row: BillingEntry }">
            <StatusTag :label="BillStatusLabel[row.status]" :tone="BillStatusTone[row.status]" />
          </template>
        </el-table-column>
        <el-table-column label="日期" width="170">
          <template #default="{ row }: { row: BillingEntry }">
            <span class="cell-date">{{ formatDateTime(row.occurredAtUtc) }}</span>
          </template>
        </el-table-column>
      </el-table>
    </section>
  </div>
</template>

<style scoped>
.billing-tab {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.billing-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.billing-section__head {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.billing-section__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.billing-section__count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-weight: 400;
}
.tab-filter {
  display: flex;
  align-items: center;
  background: #fff;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 14px 18px;
}
.tab-filter :deep(.el-form) {
  flex: 1;
}
.tab-filter :deep(.el-form-item) {
  margin: 0 16px 0 0;
}
.tab-filter :deep(.el-form-item__label) {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-regular);
}
.tab-filter__actions {
  display: flex;
  gap: 10px;
  margin-left: auto;
}

.cell-type {
  display: flex;
  align-items: center;
  gap: 8px;
  line-height: 1.35;
}
.cell-type__iam {
  font-size: 11px;
  color: var(--el-color-warning);
  border: 1px solid currentColor;
  border-radius: 3px;
  padding: 0 4px;
  line-height: 1.4;
}

.cell-product {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12.5px;
  color: var(--el-text-color-primary);
}

.cell-refno {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12.5px;
  color: var(--el-text-color-primary);
}

.cell-amount {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  line-height: 1.35;
}
.cell-amount__original {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  text-decoration: line-through;
  margin-top: 2px;
}
.cell-money--in {
  color: var(--el-color-success);
}
.cell-money--out {
  color: var(--el-color-warning);
}
.cell-money--reverted {
  color: var(--el-text-color-secondary);
  text-decoration: line-through;
}
.cell-money--failed {
  color: var(--el-color-danger);
  opacity: 0.6;
}

.cell-muted {
  color: var(--el-text-color-placeholder);
  font-size: 13px;
}
</style>
