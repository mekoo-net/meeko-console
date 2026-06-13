<script setup lang="ts">
import { inject, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';

import { formatDateTime } from '@/shared/lib/date';
import { formatMoney } from '@/shared/lib/money';
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

const loading = ref(false);
const loaded = ref(false);
const vouchers = ref<UserVoucher[]>([]);
const redemptions = ref<VoucherRedemption[]>([]);
const tab = ref('vouchers');

const statusTagType: Record<number, string> = {
  [UserVoucherStatus.Unused]: 'success',
  [UserVoucherStatus.Used]: 'info',
  [UserVoucherStatus.Expired]: 'warning',
  [UserVoucherStatus.Revoked]: 'danger',
};

async function load(uid: string): Promise<void> {
  loading.value = true;
  try {
    const [v, r] = await Promise.all([port.listUserVouchers(uid), port.listRedemptions(uid)]);
    if (v.success) vouchers.value = v.data;
    else ElMessage.error(v.error.message);
    if (r.success) redemptions.value = r.data;
    loaded.value = true;
  } finally {
    loading.value = false;
  }
}

watch(
  () => ctx?.account.value?.uid,
  (uid) => {
    if (uid) void load(uid);
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
    const uid = ctx?.account.value?.uid;
    if (uid) await load(uid);
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
        v-loading="loading"
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
          label="抵扣金额"
          width="120"
        >
          <template #default="{ row }: { row: VoucherRedemption }">
            {{ formatMoney(row.amountDeducted) }}
          </template>
        </el-table-column>
        <el-table-column
          label="券号"
          min-width="120"
        >
          <template #default="{ row }: { row: VoucherRedemption }">
            {{ row.userVoucherId }}
          </template>
        </el-table-column>
      </el-table>
    </el-tab-pane>
  </el-tabs>
</template>

<style scoped>
.voucher-tabs {
  height: 100%;
}
</style>
