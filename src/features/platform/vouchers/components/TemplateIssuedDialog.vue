<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { useRouter } from 'vue-router';
import { Search, TopRight } from '@element-plus/icons-vue';

import { useListQuery } from '@/shared/composables/useListQuery';
import { debounce } from '@/shared/lib/debounce';
import { formatDateTime } from '@/shared/lib/date';
import { formatMoney } from '@/shared/lib/money';
import { accountTypeLabel, type AccountType } from '@/features/platform/accounts/model/account.types';
import { getVoucherPort } from '../services';
import {
  UserVoucherStatus,
  issuedOriginLabel,
  userVoucherStatusLabels,
  type TemplateIssued,
  type VoucherTemplate,
} from '../model/voucher.types';

const props = defineProps<{
  modelValue: boolean;
  template?: VoucherTemplate | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

const router = useRouter();
const port = getVoucherPort();

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

interface IssuedFilter {
  keyword: string;
  status: number | null;
}

const list = useListQuery<TemplateIssued, IssuedFilter>({
  pageSize: 20,
  immediate: false,
  filter: computed(() => ({ keyword: keyword.value.trim(), status: statusFilter.value })),
  filterKey: () => `${keyword.value.trim()}|${statusFilter.value ?? ''}`,
  fetcher: ({ page, pageSize, filter }) =>
    port.listTemplateIssued({
      templateId: props.template?.id ?? '',
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

function accName(row: TemplateIssued): string {
  return row.contact?.displayName || '未命名账户';
}

function initials(row: TemplateIssued): string {
  const base = (row.contact?.displayName || row.contact?.email || row.accountUid).trim();
  return base.charAt(0).toUpperCase() || '#';
}

function issuedType(row: TemplateIssued): AccountType | null {
  return row.contact?.type ?? null;
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open || !props.template) return;
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

async function exportCsv(): Promise<void> {
  if (!props.template) return;
  const res = await port.listTemplateIssued({
    templateId: props.template.id,
    page: 1,
    pageSize: 500,
    accountUid: keyword.value.trim() || undefined,
    status: statusFilter.value,
  });
  if (!res.success) {
    ElMessage.error(res.error.message);
    return;
  }
  const header = 'account_uid,display_name,email,origin,remaining,issued_at,status\n';
  const rows = res.data.items
    .map((c) => {
      const at = c.issuedAtUtc ? formatDateTime(c.issuedAtUtc) : '';
      const status = userVoucherStatusLabels[c.status] ?? '';
      return `${c.accountUid},${c.contact?.displayName ?? ''},${c.contact?.email ?? ''},${issuedOriginLabel(c.origin)},${c.remainingValue},${at},${status}`;
    })
    .join('\n');
  const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `发放记录_${props.template.code}_${props.template.name}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="template ? `发放记录 · ${template.name}` : '发放记录'"
    width="72%"
    top="7vh"
    destroy-on-close
  >
    <el-descriptions
      v-if="template"
      :column="4"
      border
      size="small"
      class="summary"
    >
      <el-descriptions-item label="券 Key">
        <span class="mono">{{ template.code }}</span>
      </el-descriptions-item>
      <el-descriptions-item
        label="已发放"
        :span="2"
      >
        <span class="summary__accent">{{ template.issuedCount }}</span>
        <span
          v-if="template.totalQuota"
          class="summary__total"
        > / {{ template.totalQuota }}</span>
      </el-descriptions-item>
      <el-descriptions-item label="每人限领">
        {{ template.perUserLimit ?? '不限' }}
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
      class="issued-table"
      empty-text="暂无发放记录"
    >
      <el-table-column
        label="账户"
        min-width="260"
      >
        <template #default="{ row }: { row: TemplateIssued }">
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
        width="100"
      >
        <template #default="{ row }: { row: TemplateIssued }">
          <el-tag
            v-if="issuedType(row)"
            :type="issuedType(row) === 'organization' ? 'primary' : 'info'"
            effect="light"
            round
            size="small"
          >
            {{ accountTypeLabel[issuedType(row)!] }}
          </el-tag>
          <span
            v-else
            class="muted"
          >—</span>
        </template>
      </el-table-column>
      <el-table-column
        label="来源"
        width="110"
      >
        <template #default="{ row }: { row: TemplateIssued }">
          {{ issuedOriginLabel(row.origin) }}
        </template>
      </el-table-column>
      <el-table-column
        label="剩余 / 面额"
        width="130"
      >
        <template #default="{ row }: { row: TemplateIssued }">
          {{ formatMoney(row.remainingValue) }} / {{ formatMoney(row.faceValue) }}
        </template>
      </el-table-column>
      <el-table-column
        label="发放时间"
        min-width="170"
      >
        <template #default="{ row }: { row: TemplateIssued }">
          <span class="muted-date">{{ row.issuedAtUtc ? formatDateTime(row.issuedAtUtc) : '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="券状态"
        width="96"
        align="center"
      >
        <template #default="{ row }: { row: TemplateIssued }">
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

    <div class="issued-pager">
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
.issued-table :deep(.el-table__row) {
  height: 56px;
}
.issued-pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}
</style>
