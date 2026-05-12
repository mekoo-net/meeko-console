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
  <el-table
    :data="items"
    row-key="uid"
    size="small"
    class="compact-table"
  >
    <el-table-column label="UID" width="130" prop="uid">
      <template #default="{ row }: { row: Account }">
        <span class="cell-uid">{{ row.uid }}</span>
      </template>
    </el-table-column>

    <el-table-column label="账户" min-width="220">
      <template #default="{ row }: { row: Account }">
        <div class="cell-contact">
          <div class="cell-contact__email">
            <span v-if="row.ownerEmail">{{ row.ownerEmail }}</span>
            <span v-else class="cell-muted">—</span>
          </div>
          <div class="cell-contact__phone">
            <span v-if="row.ownerPhone">{{ row.ownerPhone }}</span>
            <span v-else class="cell-muted">—</span>
          </div>
        </div>
      </template>
    </el-table-column>

    <el-table-column prop="type" label="类型" width="110">
      <template #default="{ row }: { row: Account }">
        <el-tag
          :type="row.type === 'organization' ? 'primary' : 'info'"
          effect="light"
          round
          size="small"
        >
          {{ accountTypeLabel[row.type] }}
        </el-tag>
      </template>
    </el-table-column>

    <el-table-column prop="status" label="状态" width="100">
      <template #default="{ row }: { row: Account }">
        <StatusTag :label="accountStatusLabel[row.status]" :tone="accountStatusTone[row.status]" />
      </template>
    </el-table-column>

    <el-table-column label="余额" width="150" align="right">
      <template #default="{ row }: { row: Account }">
        <template v-if="walletMap?.has(row.uid)">
          <span class="cell-money">
            {{
              formatMoney(walletMap.get(row.uid)!.available, {
                currency: walletMap.get(row.uid)!.currency,
              })
            }}
          </span>
        </template>
        <span v-else class="cell-muted">—</span>
      </template>
    </el-table-column>

    <el-table-column label="创建时间" width="170">
      <template #default="{ row }: { row: Account }">
        <span class="cell-date">{{ formatDateTime(row.createdAtUtc) }}</span>
      </template>
    </el-table-column>

    <el-table-column label="活跃时间" width="170">
      <template #default="{ row }: { row: Account }">
        <span v-if="row.lastActiveAtUtc" class="cell-date">
          {{ formatDateTime(row.lastActiveAtUtc) }}
        </span>
        <span v-else class="cell-muted">—</span>
      </template>
    </el-table-column>

    <el-table-column label="操作" width="80" fixed="right" align="right">
      <template #default="{ row }: { row: Account }">
        <el-button link type="primary" size="small" @click="openDetail(row.uid)">详情</el-button>
      </template>
    </el-table-column>
  </el-table>
</template>

<style scoped>
/* 账户单元格：上邮箱、下手机号（此组件特有，其他通用样式见 src/shared/ui/table.css） */
.cell-contact {
  display: flex;
  flex-direction: column;
  line-height: 1.35;
}
.cell-contact__email {
  font-weight: 500;
  color: var(--el-text-color-primary);
  font-size: 13px;
}
.cell-contact__phone {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
  margin-top: 2px;
}
</style>
