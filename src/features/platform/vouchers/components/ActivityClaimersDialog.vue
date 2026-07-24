<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { useRouter } from 'vue-router';
import { CopyDocument, Search, TopRight } from '@element-plus/icons-vue';

import { useListQuery } from '@/shared/composables/useListQuery';
import { debounce } from '@/shared/lib/debounce';
import { formatDateTime } from '@/shared/lib/date';
import { accountTypeLabel, type AccountType } from '@/features/platform/accounts/model/account.types';
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

// keywordInput：输入框即时值；keyword：防抖后的查询值（服务端按账户 UID 过滤）。
const keywordInput = ref('');
const keyword = ref('');
const statusFilter = ref<number | null>(null);

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

interface ClaimerFilter {
  keyword: string;
  status: number | null;
}

const list = useListQuery<ActivityClaimer, ClaimerFilter>({
  pageSize: 20,
  // 弹窗在打开时（watch modelValue）才 refresh，避免挂载时带空 activityId 发无效请求。
  immediate: false,
  filter: computed(() => ({ keyword: keyword.value.trim(), status: statusFilter.value })),
  filterKey: () => `${keyword.value.trim()}|${statusFilter.value ?? ''}`,
  fetcher: ({ page, pageSize, filter }) =>
    port.listActivityClaimers({
      activityId: props.activity?.id ?? '',
      page,
      pageSize,
      accountUid: filter.keyword || undefined,
      status: filter.status,
    }),
});

const displayed = computed(() => list.items.value?.items ?? []);

const applyKeyword = debounce((value: string) => {
  keyword.value = value;
}, 300);

function onKeywordInput(value: string): void {
  applyKeyword(value);
}

function accName(c: ActivityClaimer): string {
  return c.contact?.displayName || '未命名账户';
}

function initials(c: ActivityClaimer): string {
  const base = (c.contact?.displayName || c.contact?.email || c.accountUid).trim();
  return base.charAt(0).toUpperCase() || '#';
}

function claimerType(c: ActivityClaimer): AccountType | null {
  return c.contact?.type ?? null;
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open || !props.activity) return;
    keywordInput.value = '';
    keyword.value = '';
    statusFilter.value = null;
    list.pagination.state.page = 1;
    void list.refresh();
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

// 导出按用户当前过滤条件，单次拉取一大页生成 CSV（仅在显式点击时发生）。
async function exportCsv(): Promise<void> {
  if (!props.activity) return;
  const res = await port.listActivityClaimers({
    activityId: props.activity.id,
    page: 1,
    pageSize: 10000,
    accountUid: keyword.value.trim() || undefined,
    status: statusFilter.value,
  });
  if (!res.success) {
    ElMessage.error(res.error.message);
    return;
  }
  const header = 'account_uid,display_name,email,claim_ip,claimed_at,status\n';
  const rows = res.data.items
    .map((c) => {
      const at = c.claimedAtUtc ? formatDateTime(c.claimedAtUtc) : '';
      const status = userVoucherStatusLabels[c.status] ?? '';
      return `${c.accountUid},${c.contact?.displayName ?? ''},${c.contact?.email ?? ''},${c.claimIp ?? ''},${at},${status}`;
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
        v-model="keywordInput"
        :prefix-icon="Search"
        placeholder="按账户 UID 搜索"
        clearable
        style="width: 280px"
        @input="onKeywordInput"
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
      v-loading="list.loading.value"
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
              {{ initials(row) }}
            </el-avatar>
            <div class="user__main">
              <button
                type="button"
                class="user__name"
                @click="openAccount(row.accountUid)"
              >
                {{ accName(row) }}
                <el-icon class="user__go"><TopRight /></el-icon>
              </button>
              <div class="user__sub">
                <span>{{ row.contact?.email || '无邮箱' }}</span>
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
            v-if="claimerType(row)"
            :type="claimerType(row) === 'organization' ? 'primary' : 'info'"
            effect="light"
            round
            size="small"
          >
            {{ accountTypeLabel[claimerType(row)!] }}
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
        v-model:current-page="list.pagination.state.page"
        v-model:page-size="list.pagination.state.pageSize"
        :total="list.pagination.state.total"
        :page-sizes="list.pagination.pageSizes"
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
