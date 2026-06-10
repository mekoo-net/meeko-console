<script setup lang="ts">
import { useRouter } from 'vue-router';
import { TopRight } from '@element-plus/icons-vue';

import StatusTag from '@/shared/ui/StatusTag.vue';
import { formatDateTime } from '@/shared/lib/date';
import { formatMoney } from '@/shared/lib/money';

import {
  accountStatusLabel,
  accountStatusTone,
  accountTypeLabel,
  type Account,
} from '../model/account.types';

defineProps<{
  items: Account[];
  loading?: boolean;
}>();

defineSlots<{
  empty?: () => unknown;
}>();

const router = useRouter();

function openDetail(uid: string): void {
  const href = router.resolve(`/accounts/${uid}/overview`).href;
  window.open(href, '_blank', 'noopener');
}
</script>

<template>
  <el-table
    v-loading="loading"
    :data="items"
    row-key="uid"
    size="small"
    class="compact-table"
    height="100%"
    :empty-text="' '"
  >
    <el-table-column label="UID" width="130" prop="uid">
      <template #default="{ row }: { row: Account }">
        <button type="button" class="cell-uid cell-uid--link" @click="openDetail(row.uid)">
          {{ row.uid }}
        </button>
      </template>
    </el-table-column>

    <el-table-column label="账户" min-width="220">
      <template #default="{ row }: { row: Account }">
        <div class="cell-contact">
          <div class="cell-contact__email">
            <span v-if="row.ownerEmail">{{ row.ownerEmail }}</span>
          </div>
          <div class="cell-contact__phone">
            <span v-if="row.ownerPhone">{{ row.ownerPhone }}</span>
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

    <el-table-column label="邀请人" min-width="160">
      <template #default="{ row }: { row: Account }">
        <template v-if="row.inviter">
          <span class="cell-inviter">{{ row.inviter.displayName || row.inviter.email || row.inviter.uid }}</span>
        </template>
        <span v-else class="cell-muted">—</span>
      </template>
    </el-table-column>

    <el-table-column prop="status" label="状态" width="100">
      <template #default="{ row }: { row: Account }">
        <StatusTag :label="accountStatusLabel[row.status]" :tone="accountStatusTone[row.status]" />
      </template>
    </el-table-column>

    <el-table-column label="余额" width="150" align="right">
      <template #default="{ row }: { row: Account }">
        <template v-if="row.walletSummary">
          <span class="cell-money">
            {{
              formatMoney(row.walletSummary.available, {
                currency: row.walletSummary.currency,
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

    <el-table-column label="操作" width="90" fixed="right" align="right">
      <template #default="{ row }: { row: Account }">
        <el-button link type="primary" size="small" @click="openDetail(row.uid)">
          详情
          <el-icon class="cell-action__icon"><TopRight /></el-icon>
        </el-button>
      </template>
    </el-table-column>

    <template v-if="$slots.empty" #empty>
      <slot name="empty" />
    </template>
  </el-table>
</template>

<style scoped>
.cell-contact {
  display: flex;
  flex-direction: column;
  line-height: 1.35;
}
.cell-contact__phone {
  min-height: 18px;
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  font-variant-numeric: tabular-nums;
}
.cell-uid--link {
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  color: var(--el-color-primary);
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 13px;
}
.cell-action__icon {
  margin-left: 2px;
  font-size: 12px;
  vertical-align: -1px;
}
.cell-inviter {
  font-size: 13px;
  color: var(--el-text-color-primary);
}
.cell-muted {
  color: var(--el-text-color-placeholder);
}
.cell-contact__email {
  min-height: 18px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
</style>
