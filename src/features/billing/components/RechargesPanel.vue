<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue';
import { RefreshLeft, Search, View } from '@element-plus/icons-vue';

import StatusTag from '@/shared/ui/StatusTag.vue';
import { formatMoney } from '@/shared/lib/money';
import { formatDateTime } from '@/shared/lib/date';

import {
  rechargeProviderValues,
  rechargeStatusValues,
  RechargeProviderLabel,
  RechargeStatusLabel,
  RechargeStatusTone,
  type RechargeProvider,
  type RechargeRecord,
  type RechargeStatus,
} from '../model/billing.types';
import { getBillingPort } from '../services';
import RechargeDetailDrawer from './RechargeDetailDrawer.vue';
import ConfirmRechargeDialog from './ConfirmRechargeDialog.vue';

const props = defineProps<{
  accountUid: string;
  highlightRechargeId?: string | null;
}>();

const billingPort = getBillingPort();

const rechargeProvider = ref<RechargeProvider | 'all'>('all');
const rechargeStatus = ref<RechargeStatus | 'all'>('all');
const rechargeItems = ref<RechargeRecord[]>([]);
const rechargeLoading = ref(false);
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);

async function fetchRecharges(): Promise<void> {
  rechargeLoading.value = true;
  try {
    const r = await billingPort.listRecharges({
      page: page.value,
      pageSize: pageSize.value,
      filter: {
        accountUid: props.accountUid,
        provider: rechargeProvider.value,
        status: rechargeStatus.value,
      },
    });
    if (r.success) {
      rechargeItems.value = r.data.items;
      total.value = r.data.total;
    }
  } finally {
    rechargeLoading.value = false;
  }
}

function resetRecharge(): void {
  rechargeProvider.value = 'all';
  rechargeStatus.value = 'all';
  page.value = 1;
}

watch([rechargeProvider, rechargeStatus], () => {
  page.value = 1;
  void fetchRecharges();
});
watch([page, pageSize], () => void fetchRecharges());
watch(() => props.accountUid, () => {
  page.value = 1;
  void fetchRecharges();
});

onMounted(() => void fetchRecharges());

function isInternalProvider(p: RechargeProvider): boolean {
  return (
    p === 'cs_compensation' ||
    p === 'marketing_reward' ||
    p === 'manual' ||
    p === 'referral_rebate'
  );
}

function rechargeRowClassName({ row }: { row: RechargeRecord }): string {
  return row.id === props.highlightRechargeId ? 'row-highlight' : '';
}

async function scrollToHighlight(): Promise<void> {
  if (!props.highlightRechargeId) return;
  await nextTick();
  const el = document.querySelector('.recharge-table .row-highlight');
  el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

watch(
  () => props.highlightRechargeId,
  () => {
    if (props.highlightRechargeId && rechargeItems.value.some((r) => r.id === props.highlightRechargeId)) {
      void scrollToHighlight();
    }
  },
);

watch(rechargeItems, () => {
  if (props.highlightRechargeId && rechargeItems.value.some((r) => r.id === props.highlightRechargeId)) {
    void scrollToHighlight();
  }
});

const detailOpen = ref(false);
const detailRechargeId = ref<string | null>(null);

function openDetail(row: RechargeRecord): void {
  detailRechargeId.value = row.id;
  detailOpen.value = true;
}

const confirmOpen = ref(false);
const confirmTarget = ref<RechargeRecord | null>(null);

function openConfirm(row: RechargeRecord): void {
  confirmTarget.value = row;
  confirmOpen.value = true;
}

function onConfirmSuccess(updated: RechargeRecord): void {
  const idx = rechargeItems.value.findIndex((r) => r.id === updated.id);
  if (idx !== -1) rechargeItems.value[idx] = updated;
}
</script>

<template>
  <div class="acc-page">
    <div class="acc-page__head">
      <h4 class="acc-page__title">
        充值记录
        <span class="acc-page__count">共 {{ total }} 条</span>
      </h4>
    </div>

    <div class="tab-filter">
      <el-form
        :inline="true"
        @submit.prevent
      >
        <el-form-item label="付款方式">
          <el-select
            v-model="rechargeProvider"
            style="width: 180px"
          >
            <el-option
              label="全部付款方式"
              value="all"
            />
            <el-option
              v-for="p in rechargeProviderValues"
              :key="p"
              :label="RechargeProviderLabel[p]"
              :value="p"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select
            v-model="rechargeStatus"
            style="width: 180px"
          >
            <el-option
              label="全部状态"
              value="all"
            />
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
        <el-button
          type="primary"
          :icon="Search"
          :loading="rechargeLoading"
          @click="fetchRecharges()"
        >
          查询
        </el-button>
        <el-button
          :icon="RefreshLeft"
          @click="resetRecharge()"
        >
          重置
        </el-button>
      </div>
    </div>

    <div class="acc-table-wrap">
      <el-table
        v-loading="rechargeLoading"
        :data="rechargeItems"
        row-key="id"
        size="small"
        height="100%"
        class="compact-table recharge-table"
        :row-class-name="rechargeRowClassName"
        empty-text="暂无充值记录"
      >
        <el-table-column
          label="详情"
          width="52"
          align="center"
          fixed
        >
          <template #default="{ row }: { row: RechargeRecord }">
            <el-button
              :icon="View"
              link
              type="primary"
              title="查看详情"
              @click="openDetail(row)"
            />
          </template>
        </el-table-column>
        <el-table-column
          label="流水号"
          min-width="180"
          prop="id"
        >
          <template #default="{ row }: { row: RechargeRecord }">
            <span class="cell-uid">{{ row.id }}</span>
          </template>
        </el-table-column>
        <el-table-column
          label="付款方式"
          width="130"
        >
          <template #default="{ row }: { row: RechargeRecord }">
            <el-tag
              size="small"
              :type="isInternalProvider(row.source.provider) ? 'warning' : 'success'"
              effect="plain"
              round
            >
              {{ RechargeProviderLabel[row.source.provider] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          label="业务单号"
          min-width="220"
        >
          <template #default="{ row }: { row: RechargeRecord }">
            <div class="cell-biz">
              <span
                v-if="row.source.productCode"
                class="cell-biz__product"
              >{{ row.source.productCode }}</span>
              <span
                v-else
                class="cell-biz__product cell-muted"
              >—</span>
              <span class="cell-refno">{{ row.source.refNo }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column
          label="金额"
          width="140"
          align="right"
        >
          <template #default="{ row }: { row: RechargeRecord }">
            <span class="cell-money cell-money--in">
              +{{ formatMoney(row.amount.value, { currency: row.amount.currency }) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column
          label="状态"
          width="100"
        >
          <template #default="{ row }: { row: RechargeRecord }">
            <StatusTag
              :label="RechargeStatusLabel[row.status]"
              :tone="RechargeStatusTone[row.status]"
            />
          </template>
        </el-table-column>
        <el-table-column
          label="日期"
          width="170"
        >
          <template #default="{ row }: { row: RechargeRecord }">
            <span class="cell-date">{{ formatDateTime(row.paidAtUtc ?? row.createdAtUtc) }}</span>
          </template>
        </el-table-column>
        <el-table-column
          label="操作"
          width="84"
          align="center"
          fixed="right"
        >
          <template #default="{ row }: { row: RechargeRecord }">
            <el-button
              v-if="row.status === 'pending' || row.status === 'expired'"
              link
              type="primary"
              @click="openConfirm(row)"
            >
              入账
            </el-button>
            <span
              v-else
              class="cell-muted"
            >—</span>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <RechargeDetailDrawer
      v-model="detailOpen"
      :recharge-id="detailRechargeId"
    />
    <ConfirmRechargeDialog
      v-model:visible="confirmOpen"
      :recharge="confirmTarget"
      @success="onConfirmSuccess"
    />

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
.cell-biz {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  line-height: 1.35;
  gap: 2px;
}
.cell-biz__product {
  font-size: 12.5px;
  color: var(--el-text-color-primary);
}
.cell-refno {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
}
.cell-money--in {
  color: var(--el-color-success);
}
.cell-muted {
  color: var(--el-text-color-placeholder);
}
:deep(.recharge-table .row-highlight > td) {
  background: var(--el-color-primary-light-9) !important;
}
</style>
