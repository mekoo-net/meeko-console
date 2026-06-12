<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search } from '@element-plus/icons-vue';

import PageHeader from '@/shared/ui/PageHeader.vue';
import FillListPageLayout from '@/shared/ui/FillListPageLayout.vue';
import { formatDateTime } from '@/shared/lib/date';
import { formatMoney } from '@/shared/lib/money';

import {
  UserVoucherStatus,
  deductKindLabels,
  userVoucherStatusLabels,
  type UserVoucher,
  type VoucherRedemption,
} from '../model/voucher.types';
import { getVoucherPort } from '../services';

const port = getVoucherPort();
const accountUid = ref('');
const loading = ref(false);
const searched = ref(false);
const vouchers = ref<UserVoucher[]>([]);
const redemptions = ref<VoucherRedemption[]>([]);
const tab = ref('vouchers');

const statusTagType: Record<number, string> = {
  [UserVoucherStatus.Unused]: 'success',
  [UserVoucherStatus.Used]: 'info',
  [UserVoucherStatus.Expired]: 'warning',
  [UserVoucherStatus.Revoked]: 'danger',
};

async function search(): Promise<void> {
  const uid = accountUid.value.trim();
  if (!/^\d+$/.test(uid)) {
    ElMessage.warning('请输入有效的账户 UID');
    return;
  }
  loading.value = true;
  try {
    const [v, r] = await Promise.all([port.listUserVouchers(uid), port.listRedemptions(uid)]);
    if (v.success) vouchers.value = v.data;
    else ElMessage.error(v.error.message);
    if (r.success) redemptions.value = r.data;
    searched.value = true;
  } finally {
    loading.value = false;
  }
}

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
    await search();
  } else ElMessage.error(r.error.message);
}
</script>

<template>
  <FillListPageLayout>
    <template #header>
      <PageHeader
        title="用户代金券"
        description="按账户 UID 查询用户持有的券与核销记录，可作废未使用的券。"
      >
        <template #actions>
          <el-input
            v-model="accountUid"
            placeholder="账户 UID"
            style="width: 200px"
            clearable
            @keyup.enter="search"
          />
          <el-button
            type="primary"
            :icon="Search"
            :loading="loading"
            @click="search"
          >
            查询
          </el-button>
        </template>
      </PageHeader>
    </template>

    <el-tabs
      v-model="tab"
      class="lookup-tabs"
    >
      <el-tab-pane
        label="持有券"
        name="vouchers"
      >
        <el-table
          :data="vouchers"
          size="small"
          class="compact-table"
          :empty-text="searched ? '该账户暂无券' : '请输入 UID 查询'"
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
          :data="redemptions"
          size="small"
          class="compact-table"
          :empty-text="searched ? '暂无核销记录' : '请输入 UID 查询'"
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
  </FillListPageLayout>
</template>

<style scoped>
.lookup-tabs {
  height: 100%;
}
</style>
