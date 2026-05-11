<script setup lang="ts">
import { useRouter } from 'vue-router';

import StatusTag from '@/shared/ui/StatusTag.vue';
import { formatDateTime } from '@/shared/lib/date';
import { formatMoney } from '@/shared/lib/money';
import type { WalletSnapshot } from '@/features/billing/model/billing.types';

import {
  accountStatusLabel,
  accountStatusTone,
  accountTypeLabel,
  type Account,
} from '../model/account.types';

defineProps<{
  items: Account[];
  walletMap?: Map<string, WalletSnapshot>;
}>();

const router = useRouter();

function openDetail(uid: string): void {
  void router.push(`/accounts/${uid}`);
}
</script>

<template>
  <el-table :data="items" border stripe row-key="uid" class="account-table">
    <el-table-column label="账户" min-width="220">
      <template #default="{ row }: { row: Account }">
        <div class="cell-name">
          <div class="cell-name__title">{{ row.name }}</div>
          <div class="cell-name__sub">{{ row.slug }} · UID {{ row.uid }}</div>
        </div>
      </template>
    </el-table-column>

    <el-table-column prop="type" label="类型" width="120">
      <template #default="{ row }: { row: Account }">
        <el-tag :type="row.type === 'organization' ? 'primary' : 'info'" effect="light" round>
          {{ accountTypeLabel[row.type] }}
        </el-tag>
      </template>
    </el-table-column>

    <el-table-column prop="status" label="状态" width="100">
      <template #default="{ row }: { row: Account }">
        <StatusTag :label="accountStatusLabel[row.status]" :tone="accountStatusTone[row.status]" />
      </template>
    </el-table-column>

    <!-- 仅组织账户才显示 IAM 账户数；个人账户固定只有 1 个，无需列出 -->
    <el-table-column label="IAM 账户数" width="110" align="center">
      <template #default="{ row }: { row: Account }">
        <template v-if="row.type === 'organization'">
          <span class="cell-num">{{ row.iamUserCount ?? '—' }}</span>
        </template>
        <span v-else class="cell-muted">—</span>
      </template>
    </el-table-column>

    <!-- Owner 邮箱（IAM 用户层面的标识）-->
    <el-table-column label="Owner 邮箱" min-width="180">
      <template #default="{ row }: { row: Account }">
        <span v-if="row.ownerEmail" class="cell-email">{{ row.ownerEmail }}</span>
        <span v-else class="cell-muted">—</span>
      </template>
    </el-table-column>

    <!-- 钱包余额（可用金额） -->
    <el-table-column label="余额（可用）" width="140" align="right">
      <template #default="{ row }: { row: Account }">
        <template v-if="walletMap?.has(row.uid)">
          <span class="cell-money">
            {{ formatMoney(walletMap.get(row.uid)!.available, { currency: walletMap.get(row.uid)!.currency }) }}
          </span>
        </template>
        <span v-else class="cell-muted">—</span>
      </template>
    </el-table-column>

    <el-table-column label="更新时间" min-width="150">
      <template #default="{ row }: { row: Account }">
        {{ formatDateTime(row.updatedAtUtc) }}
      </template>
    </el-table-column>

    <el-table-column label="操作" width="100" fixed="right" align="right">
      <template #default="{ row }: { row: Account }">
        <el-button link type="primary" @click="openDetail(row.uid)">详情</el-button>
      </template>
    </el-table-column>
  </el-table>
</template>

<style scoped>
.account-table :deep(th.el-table__cell) {
  background: #f8fafc;
}
.cell-name__title {
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.cell-name__sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
.cell-num {
  font-variant-numeric: tabular-nums;
}
.cell-email {
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.cell-money {
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  color: var(--el-color-success);
}
.cell-muted {
  color: var(--el-text-color-placeholder);
}
</style>
