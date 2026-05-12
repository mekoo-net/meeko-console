<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RefreshLeft, Search } from '@element-plus/icons-vue';

import StatusTag from '@/shared/ui/StatusTag.vue';
import { formatMoney } from '@/shared/lib/money';
import { formatDateTime } from '@/shared/lib/date';

import {
  ConsumptionStatusLabel,
  ConsumptionStatusTone,
  ConsumptionTypeLabel,
  consumptionStatusValues,
  consumptionTypeValues,
  RechargeStatusLabel,
  RechargeStatusTone,
  rechargeStatusValues,
  type ConsumptionRecord,
  type ConsumptionStatus,
  type ConsumptionType,
  type RechargeRecord,
  type RechargeStatus,
} from '../model/billing.types';
import { PaymentProviderLabel } from '../model/paymentChannel.types';
import { getBillingPort } from '../services';

const props = defineProps<{ accountUid: string }>();

const billingPort = getBillingPort();

const rechargeStatus = ref<RechargeStatus | 'all'>('all');
const rechargeItems = ref<RechargeRecord[]>([]);
const rechargeLoading = ref(false);

const consumptionType = ref<ConsumptionType | 'all'>('all');
const consumptionStatus = ref<ConsumptionStatus | 'all'>('all');
const consumptionItems = ref<ConsumptionRecord[]>([]);
const consumptionLoading = ref(false);

async function fetchRecharges(): Promise<void> {
  rechargeLoading.value = true;
  try {
    const r = await billingPort.listRecharges({
      page: 1,
      pageSize: 100,
      filter: { accountUid: props.accountUid, status: rechargeStatus.value },
    });
    if (r.success) rechargeItems.value = r.data.items;
  } finally {
    rechargeLoading.value = false;
  }
}

async function fetchConsumptions(): Promise<void> {
  consumptionLoading.value = true;
  try {
    const r = await billingPort.listConsumptions({
      page: 1,
      pageSize: 100,
      filter: {
        accountUid: props.accountUid,
        type: consumptionType.value,
        status: consumptionStatus.value,
      },
    });
    if (r.success) consumptionItems.value = r.data.items;
  } finally {
    consumptionLoading.value = false;
  }
}

function resetRecharge(): void {
  rechargeStatus.value = 'all';
}
function resetConsumption(): void {
  consumptionType.value = 'all';
  consumptionStatus.value = 'all';
}

watch(rechargeStatus, () => void fetchRecharges());
watch([consumptionType, consumptionStatus], () => void fetchConsumptions());
watch(
  () => props.accountUid,
  () => {
    void fetchRecharges();
    void fetchConsumptions();
  },
);

onMounted(() => {
  void fetchRecharges();
  void fetchConsumptions();
});

const totalRecharge = computed(() => rechargeItems.value.length);
const totalConsumption = computed(() => consumptionItems.value.length);
</script>

<template>
  <div class="billing-tab">
    <!-- 上半：充值订单 -->
    <section class="billing-section">
      <div class="billing-section__head">
        <h4 class="billing-section__title">
          充值订单
          <span class="billing-section__count">共 {{ totalRecharge }} 条</span>
        </h4>
      </div>

      <div class="tab-filter">
        <el-form :inline="true" @submit.prevent>
          <el-form-item label="状态">
            <el-select v-model="rechargeStatus" style="width: 200px">
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
        row-key="uid"
        size="small"
        class="compact-table"
        empty-text="暂无充值订单"
      >
        <el-table-column label="金额" width="140" align="right">
          <template #default="{ row }: { row: RechargeRecord }">
            <span class="cell-money">{{ formatMoney(row.amount, { currency: row.currency }) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="渠道" width="120">
          <template #default="{ row }: { row: RechargeRecord }">
            {{ (PaymentProviderLabel as Record<string, string>)[row.provider] ?? row.provider }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }: { row: RechargeRecord }">
            <StatusTag :label="RechargeStatusLabel[row.status]" :tone="RechargeStatusTone[row.status]" />
          </template>
        </el-table-column>
        <el-table-column label="单号" min-width="200">
          <template #default="{ row }: { row: RechargeRecord }">
            <span class="cell-trade-no">{{ row.outTradeNo }}</span>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="170">
          <template #default="{ row }: { row: RechargeRecord }">
            <span class="cell-date">{{ formatDateTime(row.createdAtUtc) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="支付时间" width="170">
          <template #default="{ row }: { row: RechargeRecord }">
            <span v-if="row.paidAtUtc" class="cell-date">{{ formatDateTime(row.paidAtUtc) }}</span>
            <span v-else class="cell-muted">—</span>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <!-- 下半：消费记录 -->
    <section class="billing-section">
      <div class="billing-section__head">
        <h4 class="billing-section__title">
          消费记录
          <span class="billing-section__count">共 {{ totalConsumption }} 条</span>
        </h4>
      </div>

      <div class="tab-filter">
        <el-form :inline="true" @submit.prevent>
          <el-form-item label="类型">
            <el-select v-model="consumptionType" style="width: 200px">
              <el-option label="全部类型" value="all" />
              <el-option
                v-for="t in consumptionTypeValues"
                :key="t"
                :label="ConsumptionTypeLabel[t]"
                :value="t"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="状态">
            <el-select v-model="consumptionStatus" style="width: 200px">
              <el-option label="全部状态" value="all" />
              <el-option
                v-for="s in consumptionStatusValues"
                :key="s"
                :label="ConsumptionStatusLabel[s]"
                :value="s"
              />
            </el-select>
          </el-form-item>
        </el-form>
        <div class="tab-filter__actions">
          <el-button type="primary" :icon="Search" :loading="consumptionLoading" @click="fetchConsumptions()">
            查询
          </el-button>
          <el-button :icon="RefreshLeft" @click="resetConsumption()">重置</el-button>
        </div>
      </div>

      <el-table
        v-loading="consumptionLoading"
        :data="consumptionItems"
        row-key="uid"
        size="small"
        class="compact-table"
        empty-text="暂无消费记录"
      >
        <el-table-column label="项目" min-width="220">
          <template #default="{ row }: { row: ConsumptionRecord }">
            <div class="cell-item">
              <span class="cell-item__desc">{{ row.description ?? row.productCode }}</span>
              <span class="cell-item__code">{{ row.productCode }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="120">
          <template #default="{ row }: { row: ConsumptionRecord }">
            {{ ConsumptionTypeLabel[row.type] }}
          </template>
        </el-table-column>
        <el-table-column label="金额" width="140" align="right">
          <template #default="{ row }: { row: ConsumptionRecord }">
            <span class="cell-money cell-money--danger">
              {{ formatMoney(row.amount, { currency: row.currency }) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }: { row: ConsumptionRecord }">
            <StatusTag
              :label="ConsumptionStatusLabel[row.status]"
              :tone="ConsumptionStatusTone[row.status]"
            />
          </template>
        </el-table-column>
        <el-table-column label="发生时间" width="170">
          <template #default="{ row }: { row: ConsumptionRecord }">
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
.cell-money--danger {
  color: #dc2626;
}
.cell-item {
  display: flex;
  flex-direction: column;
  line-height: 1.35;
}
.cell-item__desc {
  font-weight: 500;
  color: var(--el-text-color-primary);
}
.cell-item__code {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  margin-top: 2px;
}
</style>
