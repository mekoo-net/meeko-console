<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';

import PageHeader from '@/shared/ui/PageHeader.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import FillListPageLayout from '@/shared/ui/FillListPageLayout.vue';
import { confirmDanger } from '@/shared/composables/useConfirm';
import { formatDateTime } from '@/shared/lib/date';
import { formatMoney } from '@/shared/lib/money';

import {
  referralWithdrawalMethodLabel,
  referralWithdrawalStatusLabel,
  type ReferralWithdrawal,
  type ReferralWithdrawalStatus,
} from '../model/referral.types';
import { useReferralWithdrawalList } from '../composables/useReferralWithdrawalList';
import { getReferralWithdrawalPort } from '../services';

const router = useRouter();
const list = useReferralWithdrawalList();
const port = getReferralWithdrawalPort();

const rejectDialogOpen = ref(false);
const rejectReason = ref('');
const rejectingId = ref<string | null>(null);
const actingId = ref<string | null>(null);

function accountLabel(row: ReferralWithdrawal): string {
  return row.account.displayName || row.account.email || row.account.uid;
}

async function approve(row: ReferralWithdrawal): Promise<void> {
  actingId.value = row.id;
  try {
    const r = await port.approve(row.id);
    if (r.success) {
      ElMessage.success('已通过审核');
      list.refresh();
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    actingId.value = null;
  }
}

function openReject(row: ReferralWithdrawal): void {
  rejectingId.value = row.id;
  rejectReason.value = '';
  rejectDialogOpen.value = true;
}

async function submitReject(): Promise<void> {
  if (!rejectingId.value) return;
  if (!rejectReason.value.trim()) {
    ElMessage.warning('请填写驳回原因');
    return;
  }
  actingId.value = rejectingId.value;
  try {
    const r = await port.reject(rejectingId.value, rejectReason.value.trim());
    if (r.success) {
      ElMessage.success('已驳回');
      rejectDialogOpen.value = false;
      list.refresh();
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    actingId.value = null;
  }
}

async function markPaid(row: ReferralWithdrawal): Promise<void> {
  const ok = await confirmDanger({
    title: '确认打款',
    message: `确认已向 ${row.payout.accountName}（${row.payout.accountNo}）完成打款 ${formatMoney(row.amount.value, { currency: row.amount.currency })}？`,
    confirmText: '标记已打款',
    type: 'warning',
  });
  if (!ok) return;
  actingId.value = row.id;
  try {
    const r = await port.markPaid(row.id);
    if (r.success) {
      ElMessage.success('已标记打款');
      list.refresh();
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    actingId.value = null;
  }
}

function statusTagType(status: ReferralWithdrawalStatus) {
  if (status === 'pending') return 'warning';
  if (status === 'approved') return 'primary';
  if (status === 'rejected') return 'danger';
  return 'success';
}
</script>

<template>
  <FillListPageLayout>
    <template #header>
      <PageHeader title="提现审核" description="审核用户返利提现申请并标记打款状态">
        <template #actions>
          <el-button plain @click="list.refresh()">刷新</el-button>
        </template>
      </PageHeader>
    </template>

    <template #filters>
      <el-card shadow="never" class="filter-card">
        <el-form inline>
          <el-form-item label="状态">
            <el-select
              v-model="list.filter.value.status"
              style="width: 140px"
              @change="list.refresh()"
            >
              <el-option
                v-for="opt in list.statusOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
          </el-form-item>
        </el-form>
      </el-card>
    </template>

    <el-table
      v-loading="list.loading.value"
      :data="list.items.value"
      row-key="id"
      size="small"
      class="compact-table"
      height="100%"
      :empty-text="' '"
    >
      <el-table-column label="申请账户" min-width="180">
        <template #default="{ row }: { row: ReferralWithdrawal }">
          <button
            type="button"
            class="account-link"
            @click="router.push(`/accounts/${row.account.uid}`)"
          >
            {{ accountLabel(row) }}
          </button>
          <div class="sub-text">{{ row.account.uid }}</div>
        </template>
      </el-table-column>
      <el-table-column label="金额" width="120" align="right">
        <template #default="{ row }: { row: ReferralWithdrawal }">
          {{ formatMoney(row.amount.value, { currency: row.amount.currency }) }}
        </template>
      </el-table-column>
      <el-table-column label="方式" width="90">
        <template #default="{ row }: { row: ReferralWithdrawal }">
          {{ referralWithdrawalMethodLabel[row.payout.method] }}
        </template>
      </el-table-column>
      <el-table-column label="收款信息" min-width="180">
        <template #default="{ row }: { row: ReferralWithdrawal }">
          <div>{{ row.payout.accountName }}</div>
          <div class="sub-text">{{ row.payout.accountNo }}</div>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }: { row: ReferralWithdrawal }">
          <el-tag :type="statusTagType(row.status)" effect="light" round size="small">
            {{ referralWithdrawalStatusLabel[row.status] }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="申请时间" width="170">
        <template #default="{ row }: { row: ReferralWithdrawal }">
          {{ formatDateTime(row.appliedAtUtc) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="220" fixed="right" align="right">
        <template #default="{ row }: { row: ReferralWithdrawal }">
          <template v-if="row.status === 'pending'">
            <el-button
              link
              type="primary"
              size="small"
              :loading="actingId === row.id"
              @click="approve(row)"
            >
              通过
            </el-button>
            <el-button link type="danger" size="small" @click="openReject(row)">
              驳回
            </el-button>
          </template>
          <el-button
            v-else-if="row.status === 'approved'"
            link
            type="success"
            size="small"
            :loading="actingId === row.id"
            @click="markPaid(row)"
          >
            标记已打款
          </el-button>
          <span v-else-if="row.status === 'rejected'" class="sub-text">
            {{ row.rejectReason || '已驳回' }}
          </span>
          <span v-else class="sub-text">
            {{ row.paidAtUtc ? formatDateTime(row.paidAtUtc) : '—' }}
          </span>
        </template>
      </el-table-column>

      <template #empty>
        <EmptyState
          title="暂无提现申请"
          description="当前筛选条件下没有待处理的提现记录。"
        />
      </template>
    </el-table>

    <template #footer>
      <el-pagination
        v-model:current-page="list.pagination.state.page"
        v-model:page-size="list.pagination.state.pageSize"
        :total="list.pagination.state.total"
        :page-sizes="list.pagination.pageSizes"
        layout="total, sizes, prev, pager, next"
        background
      />
    </template>
  </FillListPageLayout>

  <el-dialog v-model="rejectDialogOpen" title="驳回提现申请" width="420px">
    <el-input
      v-model="rejectReason"
      type="textarea"
      :rows="4"
      placeholder="请填写驳回原因"
    />
    <template #footer>
      <el-button @click="rejectDialogOpen = false">取消</el-button>
      <el-button type="danger" :loading="actingId === rejectingId" @click="submitReject">
        确认驳回
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.filter-card {
  border-radius: 12px;
}
.account-link {
  border: none;
  background: none;
  padding: 0;
  color: var(--el-color-primary);
  cursor: pointer;
  font-size: 13px;
}
.sub-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
