<script setup lang="ts">
/**
 * 市场 › 提现：卖家把收益（人民币）提出来，员工在这里审核。流程同平台「提现审核」（推荐返利）：
 * 待审核 →「通过」→ 线下打款 →「已打款」或「打款失败」；待审核和已通过都能「驳回」。驳回、打款失败要写原因，钱退回卖家的可提现。
 * 列序照平台账单流水：提现单号 → 卖家 → 金额 → 收款信息 → 状态 → 时间 → 操作。
 * 也是用户视角「提现」：传了 `accountUid` 就只看这个人的，卖家筛选和卖家列都不要。
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search } from '@element-plus/icons-vue';

import PageHeader from '@/shared/ui/PageHeader.vue';
import StatusTag from '@/shared/ui/StatusTag.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import FilterBar from '@/shared/ui/FilterBar.vue';
import FillListPageLayout from '@/shared/ui/FillListPageLayout.vue';
import { confirmDanger } from '@/shared/composables/useConfirm';
import { fail, type AppResult } from '@/shared/api/httpTypes';
import { formatDateTime } from '@/shared/lib/date';
import { dateRangeToEpochMillis } from '@/shared/lib/epoch';

import AccountCell from '../../components/content/AccountCell.vue';
import { usePagedList } from '../../composables/usePagedList';
import {
  WithdrawalMethodLabel,
  WithdrawalStatusLabel,
  WithdrawalStatusTone,
  withdrawalStatusSchema,
  type WithdrawalRow,
  type WithdrawalStatus,
} from '../../model/market.types';
import { formatYuan } from '../../model/marketFormat';
import { parseAccountUid } from '../../model/meteringFormat';
import { getTavernMarketPort } from '../../services';

const props = defineProps<{ accountUid?: number }>();

const port = getTavernMarketPort();
const route = useRoute();

const blank = () => ({
  accountUid: typeof route.query.accountUid === 'string' ? route.query.accountUid : '',
  serialNo: '',
  status: undefined as WithdrawalStatus | undefined,
  dateRange: null as [string, string] | null,
});
const filter = ref(blank());

const { items, total, page, pageSize, loading, load, reload } = usePagedList<WithdrawalRow>((p) => {
  const f = filter.value;
  const account = props.accountUid == null ? parseAccountUid(f.accountUid) : { ok: true as const, value: props.accountUid };
  return account.ok
    ? port.withdrawals(
        { accountUid: account.value, serialNo: f.serialNo.trim() || undefined, status: f.status, ...dateRangeToEpochMillis(f.dateRange) },
        p,
      )
    : Promise.resolve(fail({ code: 'validation', message: '卖家 UID 只能是数字' }));
}, filter);

/** 用户视角里卖家是定的，筛选栏不出账户那一行。 */
const accountFilter = computed(() =>
  props.accountUid == null
    ? { accountUid: filter.value.accountUid, 'onUpdate:accountUid': (v?: string) => (filter.value.accountUid = v ?? '') }
    : {},
);

const actingId = ref<string | null>(null);

async function act(row: WithdrawalRow, run: () => Promise<AppResult<WithdrawalRow>>, done: string): Promise<void> {
  actingId.value = row.id;
  try {
    const r = await run();
    if (!r.success) {
      ElMessage.error(r.error.message);
      return;
    }
    ElMessage.success(done);
    await load();
  } finally {
    actingId.value = null;
  }
}

/** 驳回、打款失败要写原因：卖家看得到，钱退回他的可提现。 */
function askReason(title: string, message: string): Promise<string | null> {
  return ElMessageBox.prompt(message, title, {
    confirmButtonText: title,
    cancelButtonText: '取消',
    inputType: 'textarea',
    inputPlaceholder: '原因（卖家可见）',
    inputValidator: (v) => (v?.trim() ? (v.trim().length <= 200 ? true : '不超过 200 字') : '请填写原因'),
    type: 'warning',
  }).then(({ value }) => value.trim(), () => null);
}

const payee = (row: WithdrawalRow) => `${row.payout.accountName}（${WithdrawalMethodLabel[row.payout.method]} ${row.payout.accountNo}）`;

async function approve(row: WithdrawalRow): Promise<void> {
  const ok = await confirmDanger({
    title: '审核通过',
    message: `通过后需线下向 ${payee(row)} 打款 ${formatYuan(row.amount)}。`,
    confirmText: '通过',
    type: 'info',
  });
  if (ok) await act(row, () => port.approveWithdrawal(row.id), '已通过，待打款');
}

async function reject(row: WithdrawalRow): Promise<void> {
  const reason = await askReason('驳回', `驳回提现单 ${row.serialNo}？金额将退回卖家。`);
  if (reason != null) await act(row, () => port.rejectWithdrawal(row.id, reason), '已驳回');
}

async function markPaid(row: WithdrawalRow): Promise<void> {
  const ok = await confirmDanger({
    title: '确认已打款',
    message: `确认已向 ${payee(row)} 打款 ${formatYuan(row.amount)}？`,
    confirmText: '标记已打款',
    type: 'info',
  });
  if (ok) await act(row, () => port.markWithdrawalPaid(row.id), '已标记打款');
}

async function markFailed(row: WithdrawalRow): Promise<void> {
  const reason = await askReason('打款失败', `确认向 ${payee(row)} 打款失败？金额将退回卖家。`);
  if (reason != null) await act(row, () => port.markWithdrawalFailed(row.id, reason), '已标记打款失败');
}

onMounted(() => void load());
</script>

<template>
  <FillListPageLayout :embedded="accountUid != null">
    <template
      v-if="accountUid == null"
      #header
    >
      <PageHeader
        title="提现"
        description="审核通过后线下打款，再标记已打款或打款失败；驳回和打款失败的金额退回卖家。"
      />
    </template>

    <template #filters>
      <FilterBar
        v-bind="accountFilter"
        v-model:date-range="filter.dateRange"
        account-uid-label="卖家 UID"
        date-range-label="申请时间"
        :loading="loading"
        @refresh="reload"
        @reset="filter = blank()"
      >
        <el-form-item label="提现单号">
          <el-input
            v-model="filter.serialNo"
            :prefix-icon="Search"
            placeholder="精确匹配"
            clearable
            style="width: 220px"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select
            v-model="filter.status"
            placeholder="全部"
            clearable
            style="width: 140px"
          >
            <el-option
              v-for="s in withdrawalStatusSchema.options"
              :key="s"
              :label="WithdrawalStatusLabel[s]"
              :value="s"
            />
          </el-select>
        </el-form-item>
      </FilterBar>
    </template>

    <el-table
      v-loading="loading"
      :data="items"
      row-key="id"
      size="small"
      class="compact-table"
      height="100%"
      :empty-text="' '"
    >
      <el-table-column
        label="提现单号"
        min-width="170"
      >
        <template #default="{ row }: { row: WithdrawalRow }">
          <span class="cell-uid">{{ row.serialNo }}</span>
        </template>
      </el-table-column>

      <el-table-column
        v-if="accountUid == null"
        label="卖家"
        min-width="170"
      >
        <template #default="{ row }: { row: WithdrawalRow }">
          <AccountCell :account="row.account" />
        </template>
      </el-table-column>

      <el-table-column
        label="金额"
        width="110"
        align="right"
      >
        <template #default="{ row }: { row: WithdrawalRow }">
          <span class="amount">{{ formatYuan(row.amount) }}</span>
        </template>
      </el-table-column>

      <el-table-column
        label="收款信息"
        min-width="220"
      >
        <template #default="{ row }: { row: WithdrawalRow }">
          <div class="payee">
            <span>{{ row.payout.accountName }}<span class="payee__method">{{ WithdrawalMethodLabel[row.payout.method] }}</span></span>
            <span class="cell-uid">{{ row.payout.accountNo }}</span>
          </div>
        </template>
      </el-table-column>

      <el-table-column
        label="状态"
        min-width="150"
      >
        <template #default="{ row }: { row: WithdrawalRow }">
          <div class="state">
            <StatusTag
              :label="WithdrawalStatusLabel[row.status]"
              :tone="WithdrawalStatusTone[row.status]"
            />
            <span
              v-if="row.reason && (row.status === 'rejected' || row.status === 'failed')"
              class="state__reason"
              :title="row.reason"
            >{{ row.reason }}</span>
          </div>
        </template>
      </el-table-column>

      <el-table-column
        label="申请时间"
        width="150"
      >
        <template #default="{ row }: { row: WithdrawalRow }">
          <span class="cell-date">{{ formatDateTime(row.appliedAt) }}</span>
        </template>
      </el-table-column>

      <el-table-column
        label="操作"
        width="200"
        fixed="right"
        align="right"
      >
        <template #default="{ row }: { row: WithdrawalRow }">
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
            <el-button
              link
              type="danger"
              size="small"
              :disabled="actingId === row.id"
              @click="reject(row)"
            >
              驳回
            </el-button>
          </template>
          <template v-else-if="row.status === 'approved'">
            <el-button
              link
              type="primary"
              size="small"
              :loading="actingId === row.id"
              @click="markPaid(row)"
            >
              已打款
            </el-button>
            <el-button
              link
              type="warning"
              size="small"
              :disabled="actingId === row.id"
              @click="markFailed(row)"
            >
              打款失败
            </el-button>
            <el-button
              link
              type="danger"
              size="small"
              :disabled="actingId === row.id"
              @click="reject(row)"
            >
              驳回
            </el-button>
          </template>
          <span
            v-else
            class="cell-muted"
          >—</span>
        </template>
      </el-table-column>

      <template #empty>
        <EmptyState
          title="没有提现申请"
          description="调整筛选条件或重置后重试。"
        />
      </template>
    </el-table>

    <template #footer>
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        background
      />
    </template>
  </FillListPageLayout>
</template>

<style scoped>
.amount {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.payee {
  display: flex;
  flex-direction: column;
  line-height: 1.35;
}

.payee__method {
  margin-left: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.state {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-width: 0;
}

.state__reason {
  max-width: 100%;
  overflow: hidden;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
