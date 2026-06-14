<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';

import { formatDateTime } from '@/shared/lib/date';
import { formatMoney } from '@/shared/lib/money';
import { useListQuery } from '@/shared/composables/useListQuery';
import { ok } from '@/shared/api/httpTypes';
import {
  UserVoucherStatus,
  deductKindLabels,
  userVoucherStatusLabels,
  type UserVoucher,
  type VoucherRedemption,
} from '@/features/vouchers/model/voucher.types';
import { getVoucherPort } from '@/features/vouchers/services';

import { AccountDetailKey } from '../../../composables/accountDetailContext';

const ctx = inject(AccountDetailKey);
const port = getVoucherPort();

const accountUid = computed(() => ctx?.account.value?.uid ?? '');
const filter = computed(() => accountUid.value);

const voucherList = useListQuery({
  filter,
  filterKey: () => filter.value,
  fetcher: ({ page, pageSize, filter: uid }) => {
    if (!uid) return Promise.resolve(ok({ items: [], total: 0 }));
    return port.listUserVouchers({ page, pageSize, accountUid: uid });
  },
  pageSize: 20,
});

const loading = ref(false);
const loaded = ref(false);
const redemptions = ref<VoucherRedemption[]>([]);
const tab = ref('vouchers');

const vouchers = computed(() => voucherList.items.value?.items ?? []);

const statusTagType: Record<number, string> = {
  [UserVoucherStatus.Unused]: 'success',
  [UserVoucherStatus.Used]: 'info',
  [UserVoucherStatus.Expired]: 'warning',
  [UserVoucherStatus.Revoked]: 'danger',
};

async function loadRedemptions(uid: string): Promise<void> {
  const r = await port.listRedemptions(uid);
  if (r.success) redemptions.value = r.data;
}

function billLabel(row: VoucherRedemption): string {
  if (row.referenceId) return `订单 ${row.referenceId}`;
  return row.holdId ? `账单 #${row.holdId}` : '—';
}

const drillVisible = ref(false);
const drillTitle = ref('');
const drillLoading = ref(false);
const drillRows = ref<VoucherRedemption[]>([]);

async function openDrill(title: string, loader: () => Promise<typeof drillRows.value | null>): Promise<void> {
  drillTitle.value = title;
  drillVisible.value = true;
  drillLoading.value = true;
  drillRows.value = [];
  try {
    const rows = await loader();
    if (rows) drillRows.value = rows;
  } finally {
    drillLoading.value = false;
  }
}

function drillByBill(row: VoucherRedemption): void {
  if (!row.holdId) return;
  void openDrill(`${billLabel(row)} · 券抵扣明细`, async () => {
    const r = await port.listRedemptionsByBill(row.holdId);
    return r.success ? r.data : null;
  });
}

function drillByVoucher(userVoucherId: string): void {
  if (!userVoucherId) return;
  void openDrill(`券 #${userVoucherId} · 核销流水`, async () => {
    const r = await port.listRedemptionsByVoucher(userVoucherId);
    return r.success ? r.data : null;
  });
}

watch(
  accountUid,
  (uid) => {
    if (!uid) return;
    loaded.value = false;
    void loadRedemptions(uid).finally(() => {
      loaded.value = true;
    });
  },
  { immediate: true },
);

async function revoke(row: UserVoucher): Promise<void> {
  try {
    await ElMessageBox.confirm('确定作废这张未使用的券？', '作废代金券', {
      type: 'warning',
      confirmButtonText: '作废',
      cancelButtonText: '取消',
    });
  } catch {
    return;
  }
  const r = await port.revoke(row.id);
  if (r.success) {
    ElMessage.success('已作废');
    voucherList.refresh();
  } else ElMessage.error(r.error.message);
}
</script>

<template>
  <el-tabs
    v-model="tab"
    class="voucher-tabs"
  >
    <el-tab-pane
      label="持有券"
      name="vouchers"
    >
      <el-table
        v-loading="voucherList.loading.value"
        :data="vouchers"
        size="small"
        class="compact-table"
        :empty-text="loaded ? '该账户暂无券' : '加载中…'"
      >
        <el-table-column
          label="券号"
          min-width="140"
        >
          <template #default="{ row }: { row: UserVoucher }">
            {{ row.serialNo ?? row.id }}
          </template>
        </el-table-column>
        <el-table-column
          label="类型"
          width="80"
        >
          <template #default="{ row }: { row: UserVoucher }">
            <el-tag
              size="small"
              effect="plain"
            >
              {{ deductKindLabels[row.deductKind] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          label="剩余 / 面额"
          width="140"
        >
          <template #default="{ row }: { row: UserVoucher }">
            {{ formatMoney(row.remainingValue) }} / {{ formatMoney(row.faceValue) }}
          </template>
        </el-table-column>
        <el-table-column
          label="有效期至"
          width="170"
        >
          <template #default="{ row }: { row: UserVoucher }">
            {{ formatDateTime(row.validToUtc) }}
          </template>
        </el-table-column>
        <el-table-column
          label="状态"
          width="90"
        >
          <template #default="{ row }: { row: UserVoucher }">
            <el-tag
              size="small"
              :type="statusTagType[row.status] as never"
            >
              {{ userVoucherStatusLabels[row.status] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          label="操作"
          width="90"
          fixed="right"
        >
          <template #default="{ row }: { row: UserVoucher }">
            <el-button
              v-if="row.status === UserVoucherStatus.Unused"
              link
              type="danger"
              @click="revoke(row)"
            >
              作废
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="voucher-pager">
        <el-pagination
          v-model:current-page="voucherList.pagination.state.page"
          v-model:page-size="voucherList.pagination.state.pageSize"
          :total="voucherList.pagination.state.total"
          :page-sizes="voucherList.pagination.pageSizes"
          layout="total, sizes, prev, pager, next"
          background
          small
        />
      </div>
    </el-tab-pane>

    <el-tab-pane
      label="核销记录"
      name="redemptions"
    >
      <el-table
        v-loading="loading"
        :data="redemptions"
        size="small"
        class="compact-table"
        :empty-text="loaded ? '暂无核销记录' : '加载中…'"
      >
        <el-table-column
          label="时间"
          width="170"
        >
          <template #default="{ row }: { row: VoucherRedemption }">
            {{ formatDateTime(row.occurredAtUtc) }}
          </template>
        </el-table-column>
        <el-table-column
          label="产品"
          min-width="120"
        >
          <template #default="{ row }: { row: VoucherRedemption }">
            {{ row.productCode }}
          </template>
        </el-table-column>
        <el-table-column
          label="抵扣 / 账单金额"
          width="170"
        >
          <template #default="{ row }: { row: VoucherRedemption }">
            <span class="amount-deduct">{{ formatMoney(row.amountDeducted) }}</span>
            <span class="amount-bill"> / {{ formatMoney(row.billAmount) }}</span>
          </template>
        </el-table-column>
        <el-table-column
          label="账单"
          min-width="140"
        >
          <template #default="{ row }: { row: VoucherRedemption }">
            <el-button
              link
              type="primary"
              :disabled="!row.holdId"
              @click="drillByBill(row)"
            >
              {{ billLabel(row) }}
            </el-button>
          </template>
        </el-table-column>
        <el-table-column
          label="券号"
          min-width="120"
        >
          <template #default="{ row }: { row: VoucherRedemption }">
            <el-button
              link
              type="primary"
              @click="drillByVoucher(row.userVoucherId)"
            >
              {{ row.userVoucherId }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-tab-pane>
  </el-tabs>

  <el-dialog
    v-model="drillVisible"
    :title="drillTitle"
    width="640px"
    append-to-body
  >
    <el-table
      v-loading="drillLoading"
      :data="drillRows"
      size="small"
      class="compact-table"
      :empty-text="'暂无记录'"
      max-height="420"
    >
      <el-table-column
        label="时间"
        width="160"
      >
        <template #default="{ row }: { row: VoucherRedemption }">
          {{ formatDateTime(row.occurredAtUtc) }}
        </template>
      </el-table-column>
      <el-table-column
        label="产品"
        min-width="100"
      >
        <template #default="{ row }: { row: VoucherRedemption }">
          {{ row.productCode }}
        </template>
      </el-table-column>
      <el-table-column
        label="抵扣 / 账单金额"
        width="160"
      >
        <template #default="{ row }: { row: VoucherRedemption }">
          <span class="amount-deduct">{{ formatMoney(row.amountDeducted) }}</span>
          <span class="amount-bill"> / {{ formatMoney(row.billAmount) }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="账单"
        min-width="120"
      >
        <template #default="{ row }: { row: VoucherRedemption }">
          {{ billLabel(row) }}
        </template>
      </el-table-column>
      <el-table-column
        label="券号"
        width="90"
      >
        <template #default="{ row }: { row: VoucherRedemption }">
          {{ row.userVoucherId }}
        </template>
      </el-table-column>
    </el-table>
  </el-dialog>
</template>

<style scoped>
.voucher-tabs {
  height: 100%;
}
.voucher-pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}
.amount-deduct {
  font-weight: 600;
  color: var(--el-color-primary);
}
.amount-bill {
  color: var(--el-text-color-secondary);
}
</style>
