<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { CopyDocument, Plus, Refresh, Search } from '@element-plus/icons-vue';

import LargeDialog from '@/shared/ui/LargeDialog.vue';
import { usePagination } from '@/shared/composables/usePagination';
import { formatDateTime } from '@/shared/lib/date';
import { getVoucherPort } from '../services';
import {
  VoucherActivityStatus,
  activityPickLabel,
  activityStatusLabels,
  type CreateVoucherActivityInput,
  type UpdateVoucherActivityInput,
  type VoucherActivity,
  type VoucherTemplate,
} from '../model/voucher.types';
import VoucherActivityFormDialog from './VoucherActivityFormDialog.vue';
import ActivityClaimersDialog from './ActivityClaimersDialog.vue';

const props = defineProps<{
  modelValue: boolean;
  template?: VoucherTemplate | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

const port = getVoucherPort();
const activities = ref<VoucherActivity[]>([]);
const loading = ref(false);

const keyword = ref('');
const statusFilter = ref<number | null>(null);
const pagination = usePagination({ pageSize: 10 });

const formVisible = ref(false);
const editing = ref<VoucherActivity | null>(null);
const claimersVisible = ref(false);
const viewing = ref<VoucherActivity | null>(null);

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

const statusTagType: Record<number, string> = {
  [VoucherActivityStatus.Active]: 'success',
  [VoucherActivityStatus.Paused]: 'warning',
  [VoucherActivityStatus.Ended]: 'info',
};

const summary = computed(() => {
  const claimed = activities.value.reduce((s, a) => s + a.claimedCount, 0);
  const active = activities.value.filter((a) => a.status === VoucherActivityStatus.Active).length;
  return { count: pagination.state.total, claimed, active };
});

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  return activities.value.filter((a) => {
    if (statusFilter.value != null && a.status !== statusFilter.value) return false;
    if (kw && !a.name.toLowerCase().includes(kw) && !a.claimKey.toLowerCase().includes(kw)) return false;
    return true;
  });
});

const displayed = computed(() => filtered.value);

async function load(): Promise<void> {
  if (!props.template) return;
  loading.value = true;
  try {
    const r = await port.listActivities({
      templateId: props.template.id,
      includeEnded: true,
      page: pagination.state.page,
      pageSize: pagination.state.pageSize,
    });
    if (r.success) {
      activities.value = r.data.items;
      pagination.setTotal(r.data.total);
    } else ElMessage.error(r.error.message);
  } finally {
    loading.value = false;
  }
}

watch(
  () => [pagination.state.page, pagination.state.pageSize] as const,
  () => {
    if (props.modelValue && props.template) void load();
  },
);

function windowText(a: VoucherActivity): string {
  if (!a.startAtUtc && !a.endAtUtc) return '长期';
  const s = a.startAtUtc ? formatDateTime(a.startAtUtc) : '即时';
  const e = a.endAtUtc ? formatDateTime(a.endAtUtc) : '长期';
  return `${s} ~ ${e}`;
}

function progressPct(a: VoucherActivity): number {
  if (!a.totalQuota) return 0;
  return Math.round((a.claimedCount / a.totalQuota) * 100);
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      activities.value = [];
      keyword.value = '';
      statusFilter.value = null;
      pagination.state.page = 1;
      void load();
    }
  },
);

function openCreate(): void {
  editing.value = null;
  formVisible.value = true;
}

function openEdit(a: VoucherActivity): void {
  editing.value = a;
  formVisible.value = true;
}

function openClaimers(a: VoucherActivity): void {
  viewing.value = a;
  claimersVisible.value = true;
}

async function copyKey(key: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(key);
    ElMessage.success('领取 Key 已复制');
  } catch {
    ElMessage.warning('复制失败，请手动复制');
  }
}

async function onCreate(payload: CreateVoucherActivityInput): Promise<void> {
  const r = await port.createActivity(payload);
  if (r.success) {
    ElMessage.success('活动已创建');
    formVisible.value = false;
    await load();
  } else ElMessage.error(r.error.message);
}

async function onUpdate(id: string, payload: UpdateVoucherActivityInput): Promise<void> {
  const r = await port.updateActivity(id, payload);
  if (r.success) {
    ElMessage.success('活动已更新');
    formVisible.value = false;
    await load();
  } else ElMessage.error(r.error.message);
}

async function setStatus(a: VoucherActivity, status: number, label: string): Promise<void> {
  if (status === VoucherActivityStatus.Ended) {
    try {
      await ElMessageBox.confirm(`确定结束活动「${a.name}」？结束后用户不可再领取。`, '结束活动', {
        type: 'warning',
        confirmButtonText: '结束',
        cancelButtonText: '取消',
      });
    } catch {
      return;
    }
  }
  const r = await port.setActivityStatus(a.id, status);
  if (r.success) {
    ElMessage.success(`已${label}`);
    await load();
  } else ElMessage.error(r.error.message);
}
</script>

<template>
  <LargeDialog v-model="visible">
    <template #header>
      <div class="ad-header">
        <div class="ad-header__title">
          <span class="ad-header__name">{{ template?.name ?? '领券活动' }}</span>
          <el-tag
            v-if="template"
            size="small"
            type="info"
            effect="plain"
            class="ad-header__key"
          >
            {{ template.code }}
          </el-tag>
        </div>
        <div class="ad-header__sub">
          该券的投放活动与领取情况（一张券可投放到多个活动）
        </div>
      </div>
    </template>

    <div class="ad-stats">
      <div class="ad-stat">
        <span class="ad-stat__label">活动数</span>
        <span class="ad-stat__value">{{ summary.count }}</span>
      </div>
      <div class="ad-stat">
        <span class="ad-stat__label">进行中</span>
        <span class="ad-stat__value">{{ summary.active }}</span>
      </div>
      <div class="ad-stat">
        <span class="ad-stat__label">累计领取</span>
        <span class="ad-stat__value ad-stat__value--accent">{{ summary.claimed }}</span>
      </div>
    </div>

    <div class="ad-filter">
      <el-input
        v-model="keyword"
        :prefix-icon="Search"
        placeholder="搜索活动名称 / 领取 Key"
        clearable
        style="width: 240px"
      />
      <el-select
        v-model="statusFilter"
        placeholder="全部状态"
        clearable
        style="width: 140px"
      >
        <el-option
          v-for="(label, value) in activityStatusLabels"
          :key="value"
          :value="Number(value)"
          :label="label"
        />
      </el-select>
      <el-button
        :icon="Refresh"
        plain
        @click="load"
      >
        刷新
      </el-button>
      <span class="ad-filter__spacer" />
      <el-button
        type="primary"
        :icon="Plus"
        :disabled="!template"
        @click="openCreate"
      >
        新建活动
      </el-button>
    </div>

    <el-table
      v-loading="loading"
      :data="displayed"
      size="default"
      height="100%"
      class="compact-table lg-fill"
      empty-text="该券暂无投放活动"
    >
      <el-table-column
        label="活动名称"
        min-width="160"
      >
        <template #default="{ row }: { row: VoucherActivity }">
          <div class="ad-act-cell">
            <span class="ad-act-name">{{ row.name }}</span>
            <span
              v-if="row.items.length > 1"
              class="ad-act-rule"
            >{{ activityPickLabel(row) }} · {{ row.items.length }} 张券</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column
        label="领取 Key"
        width="140"
      >
        <template #default="{ row }: { row: VoucherActivity }">
          <el-tag
            size="small"
            type="info"
            effect="plain"
            class="ad-key-tag"
            @click="copyKey(row.claimKey)"
          >
            {{ row.claimKey }}
            <el-icon class="ad-key-tag__copy">
              <CopyDocument />
            </el-icon>
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        label="领取情况"
        min-width="200"
      >
        <template #default="{ row }: { row: VoucherActivity }">
          <div
            v-if="row.totalQuota"
            class="ad-progress"
          >
            <el-progress
              :percentage="progressPct(row)"
              :stroke-width="10"
              :status="progressPct(row) >= 100 ? 'success' : undefined"
            />
            <span class="ad-progress__text">{{ row.claimedCount }} / {{ row.totalQuota }}</span>
          </div>
          <span v-else>已领取 {{ row.claimedCount }}（不限量）</span>
        </template>
      </el-table-column>
      <el-table-column
        label="领取窗口"
        min-width="200"
      >
        <template #default="{ row }: { row: VoucherActivity }">
          {{ windowText(row) }}
        </template>
      </el-table-column>
      <el-table-column
        label="状态"
        width="90"
      >
        <template #default="{ row }: { row: VoucherActivity }">
          <el-tag
            size="small"
            :type="statusTagType[row.status] as never"
          >
            {{ activityStatusLabels[row.status] }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        label="操作"
        width="260"
        fixed="right"
      >
        <template #default="{ row }: { row: VoucherActivity }">
          <div class="ops">
            <el-button
              link
              type="primary"
              @click="openClaimers(row)"
            >
              领取记录
            </el-button>
            <template v-if="row.status !== VoucherActivityStatus.Ended">
              <el-divider direction="vertical" />
              <el-button
                link
                type="primary"
                @click="openEdit(row)"
              >
                编辑
              </el-button>
              <el-divider direction="vertical" />
              <el-button
                v-if="row.status === VoucherActivityStatus.Active"
                link
                type="primary"
                @click="setStatus(row, VoucherActivityStatus.Paused, '暂停')"
              >
                暂停
              </el-button>
              <el-button
                v-else-if="row.status === VoucherActivityStatus.Paused"
                link
                type="primary"
                @click="setStatus(row, VoucherActivityStatus.Active, '启用')"
              >
                启用
              </el-button>
              <el-divider direction="vertical" />
              <el-button
                link
                type="danger"
                @click="setStatus(row, VoucherActivityStatus.Ended, '结束')"
              >
                结束
              </el-button>
            </template>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <div class="ad-pager">
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
  </LargeDialog>

  <VoucherActivityFormDialog
    v-model="formVisible"
    :activity="editing"
    :preset-template-id="template?.id ?? null"
    @create="onCreate"
    @update="onUpdate"
  />

  <ActivityClaimersDialog
    v-model="claimersVisible"
    :activity="viewing"
  />
</template>

<style scoped>
.ad-header__title {
  display: flex;
  align-items: center;
  gap: 10px;
}
.ad-header__name {
  font-size: 17px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.ad-header__key {
  font-family: var(--el-font-family-mono, monospace);
}
.ad-header__sub {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.ad-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}
.ad-stat {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px;
  border-radius: 12px;
  background: var(--el-fill-color-lighter);
}
.ad-stat__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.ad-stat__value {
  font-size: 22px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  line-height: 1;
}
.ad-stat__value--accent {
  color: var(--el-color-primary);
}
.ad-filter {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.ad-filter__spacer {
  flex: 1;
}
.ad-act-cell {
  display: flex;
  flex-direction: column;
  line-height: 1.35;
}
.ad-act-name {
  font-weight: 500;
}
.ad-act-rule {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.ad-key-tag {
  cursor: pointer;
  font-family: var(--el-font-family-mono, monospace);
}
.ad-key-tag__copy {
  margin-left: 4px;
  vertical-align: -2px;
}
.ad-progress {
  display: flex;
  align-items: center;
  gap: 10px;
}
.ad-progress :deep(.el-progress) {
  flex: 1;
}
.ad-progress__text {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}
.ad-pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}
.ops {
  white-space: nowrap;
}
</style>
