<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
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
  type BillingEntry,
  type BillStatus,
  type BillSubType,
} from '../model/billing.types';
import { getBillingPort } from '../services';

const props = defineProps<{ accountUid: string }>();

const billingPort = getBillingPort();

const billSubType = ref<BillSubType | 'all'>('all');
const billStatus = ref<BillStatus | 'all'>('all');
const billItems = ref<BillingEntry[]>([]);
const billLoading = ref(false);
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);

async function fetchBills(): Promise<void> {
  billLoading.value = true;
  try {
    const r = await billingPort.listBills({
      page: page.value,
      pageSize: pageSize.value,
      filter: {
        accountUid: props.accountUid,
        productCode: 'all',
        subType: billSubType.value,
        status: billStatus.value,
      },
    });
    if (r.success) {
      billItems.value = r.data.items;
      total.value = r.data.total;
    }
  } finally {
    billLoading.value = false;
  }
}

function resetBill(): void {
  billSubType.value = 'all';
  billStatus.value = 'all';
  page.value = 1;
}

watch([billSubType, billStatus], () => {
  page.value = 1;
  void fetchBills();
});
watch([page, pageSize], () => void fetchBills());
watch(() => props.accountUid, () => {
  page.value = 1;
  void fetchBills();
});

onMounted(() => void fetchBills());
</script>

<template>
  <div class="acc-page">
    <div class="acc-page__head">
      <h4 class="acc-page__title">
        账单流水
        <span class="acc-page__count">共 {{ total }} 条</span>
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

    <div class="acc-table-wrap">
      <el-table
        v-loading="billLoading"
        :data="billItems"
        row-key="id"
        size="small"
        height="100%"
        class="compact-table"
        empty-text="暂无账单记录"
      >
        <el-table-column label="流水号" min-width="180" prop="id">
          <template #default="{ row }: { row: BillingEntry }">
            <span class="cell-uid">{{ row.id }}</span>
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
    </div>

    <div class="pagination-bar">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        background
      />
    </div>
  </div>
</template>

<style scoped>
.tab-filter {
  display: flex;
  align-items: center;
  flex-shrink: 0;
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
