<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { useRouter } from 'vue-router';
import { CopyDocument, Search, TopRight } from '@element-plus/icons-vue';

import { clientPaginate, usePagination } from '@/shared/composables/usePagination';
import { formatDateTime } from '@/shared/lib/date';
import { getAccountAdminPort } from '@/features/accounts/services';
import { accountTypeLabel, type Account } from '@/features/accounts/model/account.types';
import { TIER_THRESHOLDS } from '@/features/accounts/model/tierConfig';
import { getVoucherPort } from '../services';
import {
  UserVoucherStatus,
  activityPickLabel,
  userVoucherStatusLabels,
  type ActivityClaimer,
  type VoucherActivity,
} from '../model/voucher.types';

function voucherNames(activity: VoucherActivity): string {
  const names = activity.items.map((i) => i.templateName ?? i.templateCode ?? i.templateId);
  return names.length ? names.join('、') : '—';
}

const props = defineProps<{
  modelValue: boolean;
  activity?: VoucherActivity | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

const router = useRouter();
const port = getVoucherPort();
const accountPort = getAccountAdminPort();

const claimers = ref<ActivityClaimer[]>([]);
const accountMap = ref<Map<string, Account>>(new Map());
const loading = ref(false);

const keyword = ref('');
const statusFilter = ref<number | null>(null);
const pagination = usePagination({ pageSize: 20 });

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

const statusTagType: Record<number, string> = {
  [UserVoucherStatus.Unused]: 'success',
  [UserVoucherStatus.Used]: 'info',
  [UserVoucherStatus.Expired]: 'warning',
  [UserVoucherStatus.Revoked]: 'danger',
};

function acc(uid: string): Account | undefined {
  return accountMap.value.get(uid);
}

function tierName(tier?: number): string {
  if (tier == null) return '';
  return TIER_THRESHOLDS.find((t) => t.level === tier)?.name ?? `Lv${tier}`;
}

function accName(uid: string): string {
  return acc(uid)?.displayName || '未命名账户';
}

function initials(uid: string): string {
  const a = acc(uid);
  const base = (a?.displayName || a?.ownerEmail || uid).trim();
  return base.charAt(0).toUpperCase() || '#';
}

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  return claimers.value.filter((c) => {
    if (statusFilter.value != null && c.status !== statusFilter.value) return false;
    if (kw) {
      const a = acc(c.accountUid);
      const hay = `${c.accountUid} ${c.claimIp ?? ''} ${a?.ownerEmail ?? ''} ${a?.displayName ?? ''}`.toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    return true;
  });
});

const displayed = computed(() =>
  clientPaginate(filtered.value, pagination.state.page, pagination.state.pageSize),
);

watch(filtered, (rows) => pagination.setTotal(rows.length), { immediate: true });

watch(
  () => props.modelValue,
  async (open) => {
    if (!open || !props.activity) return;
    loading.value = true;
    claimers.value = [];
    keyword.value = '';
    statusFilter.value = null;
    pagination.state.page = 1;
    try {
      const [claimRes, accRes] = await Promise.all([
        port.listActivityClaimers(props.activity.id, 10000),
        accountPort.listAccounts({
          page: 1,
          pageSize: 500,
          filter: { accountUid: '', contactKeyword: '', type: 'all', status: 'all' },
        }),
      ]);
      if (claimRes.success) claimers.value = claimRes.data;
      else ElMessage.error(claimRes.error.message);
      accountMap.value = accRes.success
        ? new Map(accRes.data.items.map((a) => [a.uid, a]))
        : new Map();
    } finally {
      loading.value = false;
    }
  },
);

function openAccount(uid: string): void {
  const href = router.resolve(`/accounts/${uid}/overview`).href;
  window.open(href, '_blank', 'noopener');
}

async function copyKey(): Promise<void> {
  if (!props.activity) return;
  try {
    await navigator.clipboard.writeText(props.activity.claimKey);
    ElMessage.success('领取 Key 已复制');
  } catch {
    ElMessage.warning('复制失败，请手动复制');
  }
}

function exportCsv(): void {
  if (!props.activity) return;
  const header = 'account_uid,email,claim_ip,claimed_at,status\n';
  const rows = claimers.value
    .map((c) => {
      const a = acc(c.accountUid);
      const at = c.claimedAtUtc ? formatDateTime(c.claimedAtUtc) : '';
      const status = userVoucherStatusLabels[c.status] ?? '';
      return `${c.accountUid},${a?.ownerEmail ?? ''},${c.claimIp ?? ''},${at},${status}`;
    })
    .join('\n');
  const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `领取记录_${props.activity.claimKey}_${props.activity.name}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="activity ? `领取记录 · ${activity.name}` : '领取记录'"
    width="65%"
    top="7vh"
    destroy-on-close
  >
    <el-descriptions
      v-if="activity"
      :column="4"
      border
      size="small"
      class="summary"
    >
      <el-descriptions-item label="领取规则">
        {{ activityPickLabel(activity) }}
      </el-descriptions-item>
      <el-descriptions-item
        label="投放券"
        :span="2"
      >
        {{ voucherNames(activity) }}
      </el-descriptions-item>
      <el-descriptions-item label="已领取">
        <span class="summary__accent">{{ activity.claimedCount }}</span>
        <span
          v-if="activity.totalQuota"
          class="summary__total"
        > / {{ activity.totalQuota }}</span>
      </el-descriptions-item>
      <el-descriptions-item
        label="领取 Key"
        :span="4"
      >
        <el-tag
          size="small"
          type="info"
          effect="plain"
          class="summary__key"
          @click="copyKey"
        >
          {{ activity.claimKey }}
          <el-icon class="summary__copy"><CopyDocument /></el-icon>
        </el-tag>
      </el-descriptions-item>
    </el-descriptions>

    <div class="toolbar">
      <el-input
        v-model="keyword"
        :prefix-icon="Search"
        placeholder="搜索 UID / 邮箱 / 名称 / IP"
        clearable
        style="width: 280px"
      />
      <el-select
        v-model="statusFilter"
        placeholder="全部券状态"
        clearable
        style="width: 150px"
      >
        <el-option
          v-for="(label, value) in userVoucherStatusLabels"
          :key="value"
          :value="Number(value)"
          :label="label"
        />
      </el-select>
      <span class="spacer" />
      <el-button
        size="small"
        type="primary"
        @click="exportCsv"
      >
        导出 CSV
      </el-button>
    </div>

    <el-table
      v-loading="loading"
      :data="displayed"
      height="520"
      class="claimers-table"
      empty-text="暂无领取记录"
    >
      <el-table-column
        label="账户"
        min-width="280"
      >
        <template #default="{ row }: { row: ActivityClaimer }">
          <div class="user">
            <el-avatar
              :size="36"
              class="user__avatar"
            >
              {{ initials(row.accountUid) }}
            </el-avatar>
            <div class="user__main">
              <button
                type="button"
                class="user__name"
                @click="openAccount(row.accountUid)"
              >
                {{ accName(row.accountUid) }}
                <el-icon class="user__go"><TopRight /></el-icon>
              </button>
              <div class="user__sub">
                <span>{{ acc(row.accountUid)?.ownerEmail || '无邮箱' }}</span>
                <span class="user__uid">{{ row.accountUid }}</span>
              </div>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column
        label="类型"
        width="110"
      >
        <template #default="{ row }: { row: ActivityClaimer }">
          <el-tag
            v-if="acc(row.accountUid)"
            :type="acc(row.accountUid)!.type === 'organization' ? 'primary' : 'info'"
            effect="light"
            round
            size="small"
          >
            {{ accountTypeLabel[acc(row.accountUid)!.type] }}
          </el-tag>
          <span
            v-else
            class="muted"
          >—</span>
        </template>
      </el-table-column>
      <el-table-column
        label="等级"
        width="90"
      >
        <template #default="{ row }: { row: ActivityClaimer }">
          <el-tag
            v-if="acc(row.accountUid)"
            type="warning"
            effect="light"
            round
            size="small"
          >
            {{ tierName(acc(row.accountUid)!.tier) }}
          </el-tag>
          <span
            v-else
            class="muted"
          >—</span>
        </template>
      </el-table-column>
      <el-table-column
        label="领取 IP"
        width="150"
      >
        <template #default="{ row }: { row: ActivityClaimer }">
          <span class="mono">{{ row.claimIp ?? '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="领取时间"
        min-width="180"
      >
        <template #default="{ row }: { row: ActivityClaimer }">
          <span class="muted-date">{{ row.claimedAtUtc ? formatDateTime(row.claimedAtUtc) : '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="券状态"
        width="100"
        align="center"
      >
        <template #default="{ row }: { row: ActivityClaimer }">
          <el-tag
            size="small"
            round
            :type="statusTagType[row.status] as never"
          >
            {{ userVoucherStatusLabels[row.status] }}
          </el-tag>
        </template>
      </el-table-column>
    </el-table>

    <div class="claimers-pager">
      <el-pagination
        v-model:current-page="pagination.state.page"
        v-model:page-size="pagination.state.pageSize"
        :total="pagination.state.total"
        :page-sizes="pagination.pageSizes"
        layout="total, sizes, prev, pager, next"
        background
        small
      />
    </div>
  </el-dialog>
</template>

<style scoped>
.summary {
  margin-bottom: 16px;
}
.summary :deep(.el-descriptions__label) {
  width: 88px;
  color: var(--el-text-color-secondary);
}
.summary__accent {
  font-weight: 600;
  color: var(--el-color-primary);
}
.summary__total {
  color: var(--el-text-color-secondary);
}
.summary__key {
  cursor: pointer;
  font-family: var(--el-font-family-mono, monospace);
}
.summary__copy {
  margin-left: 4px;
  vertical-align: -2px;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.spacer {
  flex: 1;
}
.mono {
  font-family: var(--el-font-family-mono, monospace);
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.muted {
  color: var(--el-text-color-placeholder);
}
.muted-date {
  color: var(--el-text-color-regular);
  font-variant-numeric: tabular-nums;
}

/* 账户身份单元格 */
.user {
  display: flex;
  align-items: center;
  gap: 10px;
}
.user__avatar {
  flex-shrink: 0;
  background: var(--el-color-primary-light-7);
  color: var(--el-color-primary);
  font-weight: 600;
}
.user__main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.user__name {
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  text-align: left;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.user__name:hover {
  color: var(--el-color-primary);
}
.user__go {
  font-size: 12px;
  opacity: 0;
  transition: opacity 0.15s;
}
.user__name:hover .user__go {
  opacity: 1;
}
.user__sub {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.user__uid {
  font-family: var(--el-font-family-mono, monospace);
  color: var(--el-text-color-placeholder);
}
.claimers-table :deep(.el-table__row) {
  height: 56px;
}
.claimers-pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}
</style>
