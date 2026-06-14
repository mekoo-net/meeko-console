<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { CopyDocument, Plus, Refresh } from '@element-plus/icons-vue';

import PageHeader from '@/shared/ui/PageHeader.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import FillListPageLayout from '@/shared/ui/FillListPageLayout.vue';
import { useListQuery } from '@/shared/composables/useListQuery';
import { formatDateTime } from '@/shared/lib/date';

import VoucherActivityFormDialog from '../components/VoucherActivityFormDialog.vue';
import ActivityClaimersDialog from '../components/ActivityClaimersDialog.vue';
import {
  VoucherActivityStatus,
  activityPickLabel,
  activityStatusLabels,
  type CreateVoucherActivityInput,
  type UpdateVoucherActivityInput,
  type VoucherActivity,
} from '../model/voucher.types';
import { getVoucherPort } from '../services';

const port = getVoucherPort();
const includeEnded = ref(false);

const list = useListQuery({
  filter: includeEnded,
  filterKey: () => String(includeEnded.value),
  fetcher: ({ page, pageSize, filter }) =>
    port.listActivities({ page, pageSize, templateId: null, includeEnded: filter }),
  pageSize: 20,
});

const displayed = computed(() => list.items.value?.items ?? []);

const formVisible = ref(false);
const editing = ref<VoucherActivity | null>(null);
const claimersVisible = ref(false);
const viewing = ref<VoucherActivity | null>(null);

const statusTagType: Record<number, string> = {
  [VoucherActivityStatus.Active]: 'success',
  [VoucherActivityStatus.Paused]: 'warning',
  [VoucherActivityStatus.Ended]: 'info',
};

function voucherSummary(a: VoucherActivity): string {
  const names = a.items.map((i) => i.templateName ?? i.templateCode ?? i.templateId);
  if (names.length <= 1) return `券：${names[0] ?? '—'}`;
  return `${activityPickLabel(a)}：${names.join('、')}`;
}

function windowText(a: VoucherActivity): string {
  if (!a.startAtUtc && !a.endAtUtc) return '长期';
  const s = a.startAtUtc ? formatDateTime(a.startAtUtc) : '即时';
  const e = a.endAtUtc ? formatDateTime(a.endAtUtc) : '长期';
  return `${s} ~ ${e}`;
}

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
    list.refresh();
  } else ElMessage.error(r.error.message);
}

async function onUpdate(id: string, payload: UpdateVoucherActivityInput): Promise<void> {
  const r = await port.updateActivity(id, payload);
  if (r.success) {
    ElMessage.success('活动已更新');
    formVisible.value = false;
    list.refresh();
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
    list.refresh();
  } else ElMessage.error(r.error.message);
}
</script>

<template>
  <FillListPageLayout>
    <template #header>
      <PageHeader
        title="领券活动"
        description="把抵扣券投放到活动中，用户凭活动「领取 Key」领取。一张券可投放到多个活动，支持领取期、总量与每人限领。"
      >
        <template #actions>
          <el-switch
            v-model="includeEnded"
            inline-prompt
            active-text="含结束"
            inactive-text="含结束"
          />
          <el-button
            :icon="Refresh"
            plain
            @click="list.refresh()"
          >
            刷新
          </el-button>
          <el-button
            type="primary"
            :icon="Plus"
            @click="openCreate"
          >
            新建活动
          </el-button>
        </template>
      </PageHeader>
    </template>

    <el-table
      v-loading="list.loading.value"
      :data="displayed"
      row-key="id"
      size="small"
      class="compact-table"
      height="100%"
      :empty-text="' '"
    >
      <el-table-column
        label="活动"
        min-width="200"
      >
        <template #default="{ row }: { row: VoucherActivity }">
          <div class="cell-name">
            <span class="cell-name__title">{{ row.name }}</span>
            <span class="cell-name__rule">{{ voucherSummary(row) }}</span>
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
            class="key-tag"
            @click="copyKey(row.claimKey)"
          >
            {{ row.claimKey }}
            <el-icon class="key-tag__copy">
              <CopyDocument />
            </el-icon>
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        label="已领取 / 总量"
        width="130"
      >
        <template #default="{ row }: { row: VoucherActivity }">
          {{ row.claimedCount }}<span v-if="row.totalQuota"> / {{ row.totalQuota }}</span>
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

      <template #empty>
        <EmptyState
          title="暂无领券活动"
          description="点击「新建活动」把一张抵扣券投放出去，生成用户领取 Key。"
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

  <VoucherActivityFormDialog
    v-model="formVisible"
    :activity="editing"
    @create="onCreate"
    @update="onUpdate"
  />

  <ActivityClaimersDialog
    v-model="claimersVisible"
    :activity="viewing"
  />
</template>

<style scoped>
.cell-name {
  display: flex;
  flex-direction: column;
  line-height: 1.35;
}
.cell-name__title {
  font-weight: 500;
}
.cell-name__rule {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.key-tag {
  cursor: pointer;
  font-family: var(--el-font-family-mono, monospace);
}
.key-tag__copy {
  margin-left: 4px;
  vertical-align: -2px;
}
.ops {
  white-space: nowrap;
}
</style>
