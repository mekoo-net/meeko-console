<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Refresh } from '@element-plus/icons-vue';

import PageHeader from '@/shared/ui/PageHeader.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import FillListPageLayout from '@/shared/ui/FillListPageLayout.vue';
import { clientPaginate, usePagination } from '@/shared/composables/usePagination';
import { formatDateTime } from '@/shared/lib/date';
import { formatMoney } from '@/shared/lib/money';

import VoucherTemplateFormDialog from '../components/VoucherTemplateFormDialog.vue';
import IssueVouchersDialog from '../components/IssueVouchersDialog.vue';
import {
  VoucherDeductKind,
  VoucherTemplateStatus,
  deductKindLabels,
  templateStatusLabels,
  type CreateVoucherTemplateInput,
  type UpdateVoucherTemplateInput,
  type VoucherTemplate,
} from '../model/voucher.types';
import { getVoucherPort } from '../services';

const port = getVoucherPort();
const templates = ref<VoucherTemplate[]>([]);
const loading = ref(false);
const includeArchived = ref(false);

const pagination = usePagination({ pageSize: 20 });
const displayed = computed(() =>
  clientPaginate(templates.value, pagination.state.page, pagination.state.pageSize),
);

const editVisible = ref(false);
const issueVisible = ref(false);
const editing = ref<VoucherTemplate | null>(null);
const issuing = ref<VoucherTemplate | null>(null);

const statusTagType: Record<number, string> = {
  [VoucherTemplateStatus.Draft]: 'info',
  [VoucherTemplateStatus.Active]: 'success',
  [VoucherTemplateStatus.Paused]: 'warning',
  [VoucherTemplateStatus.Archived]: 'info',
};

function ruleSummary(t: VoucherTemplate): string {
  if (t.deductKind === VoucherDeductKind.NoThreshold) return `无门槛减 ${formatMoney(t.faceValue)}`;
  if (t.deductKind === VoucherDeductKind.FullReduction)
    return `满 ${formatMoney(t.thresholdAmount)} 减 ${formatMoney(t.faceValue)}`;
  const pct = t.discountRate != null ? Math.round(t.discountRate * 100) / 10 : 0;
  return `满 ${formatMoney(t.thresholdAmount)} 打 ${pct} 折（封顶 ${formatMoney(t.faceValue)}）`;
}

function validitySummary(t: VoucherTemplate): string {
  if (t.validDays != null) return `领取后 ${t.validDays} 天`;
  if (t.validFromUtc && t.validToUtc)
    return `${formatDateTime(t.validFromUtc)} ~ ${formatDateTime(t.validToUtc)}`;
  return '—';
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    const r = await port.listTemplates(includeArchived.value);
    if (r.success) {
      templates.value = r.data;
      pagination.setTotal(r.data.length);
    } else ElMessage.error(r.error.message);
  } finally {
    loading.value = false;
  }
}

function openCreate(): void {
  editing.value = null;
  editVisible.value = true;
}

function openEdit(row: VoucherTemplate): void {
  editing.value = row;
  editVisible.value = true;
}

function openIssue(row: VoucherTemplate): void {
  issuing.value = row;
  issueVisible.value = true;
}

async function onCreate(payload: CreateVoucherTemplateInput): Promise<void> {
  const r = await port.createTemplate(payload);
  if (r.success) {
    ElMessage.success('券批次已创建');
    editVisible.value = false;
    await load();
  } else ElMessage.error(r.error.message);
}

async function onUpdate(id: string, payload: UpdateVoucherTemplateInput): Promise<void> {
  const r = await port.updateTemplate(id, payload);
  if (r.success) {
    ElMessage.success('券批次已更新');
    editVisible.value = false;
    await load();
  } else ElMessage.error(r.error.message);
}

async function setStatus(row: VoucherTemplate, status: number, label: string): Promise<void> {
  if (status === VoucherTemplateStatus.Archived) {
    try {
      await ElMessageBox.confirm(`确定归档券批次「${row.name}」？归档后不可再下发。`, '归档', {
        type: 'warning',
        confirmButtonText: '归档',
        cancelButtonText: '取消',
      });
    } catch {
      return;
    }
  }
  const r = await port.setTemplateStatus(row.id, status);
  if (r.success) {
    ElMessage.success(`已${label}`);
    await load();
  } else ElMessage.error(r.error.message);
}

onMounted(() => load());
</script>

<template>
  <FillListPageLayout>
    <template #header>
      <PageHeader
        title="代金券"
        description="创建券批次（无门槛/满减/折扣），并向用户下发。联合扣费：券额优先，余额补足，可透支记欠款。"
      >
        <template #actions>
          <el-switch
            v-model="includeArchived"
            inline-prompt
            active-text="含归档"
            inactive-text="含归档"
            @change="load"
          />
          <el-button
            :icon="Refresh"
            plain
            @click="load"
          >
            刷新
          </el-button>
          <el-button
            type="primary"
            :icon="Plus"
            @click="openCreate"
          >
            新建券批次
          </el-button>
        </template>
      </PageHeader>
    </template>

    <el-table
      v-loading="loading"
      :data="displayed"
      row-key="id"
      size="small"
      class="compact-table"
      height="100%"
      :empty-text="' '"
    >
      <el-table-column
        label="券批次"
        min-width="220"
      >
        <template #default="{ row }: { row: VoucherTemplate }">
          <div class="cell-name">
            <span class="cell-name__title">{{ row.name }}</span>
            <span class="cell-name__rule">{{ ruleSummary(row) }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column
        label="类型"
        width="90"
      >
        <template #default="{ row }: { row: VoucherTemplate }">
          <el-tag
            size="small"
            effect="plain"
          >
            {{ deductKindLabels[row.deductKind] }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        label="有效期"
        min-width="200"
      >
        <template #default="{ row }: { row: VoucherTemplate }">
          {{ validitySummary(row) }}
        </template>
      </el-table-column>
      <el-table-column
        label="发放"
        width="120"
      >
        <template #default="{ row }: { row: VoucherTemplate }">
          {{ row.issuedCount }}<span v-if="row.totalQuota"> / {{ row.totalQuota }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="状态"
        width="90"
      >
        <template #default="{ row }: { row: VoucherTemplate }">
          <el-tag
            size="small"
            :type="statusTagType[row.status] as never"
          >
            {{ templateStatusLabels[row.status] }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        label="操作"
        width="230"
        fixed="right"
      >
        <template #default="{ row }: { row: VoucherTemplate }">
          <el-button
            link
            type="primary"
            :disabled="row.status !== VoucherTemplateStatus.Active"
            @click="openIssue(row)"
          >
            下发
          </el-button>
          <el-button
            link
            type="primary"
            @click="openEdit(row)"
          >
            编辑
          </el-button>
          <el-button
            v-if="row.status === VoucherTemplateStatus.Active"
            link
            type="warning"
            @click="setStatus(row, VoucherTemplateStatus.Paused, '暂停')"
          >
            暂停
          </el-button>
          <el-button
            v-else-if="row.status === VoucherTemplateStatus.Paused"
            link
            type="success"
            @click="setStatus(row, VoucherTemplateStatus.Active, '启用')"
          >
            启用
          </el-button>
          <el-button
            v-if="row.status !== VoucherTemplateStatus.Archived"
            link
            type="danger"
            @click="setStatus(row, VoucherTemplateStatus.Archived, '归档')"
          >
            归档
          </el-button>
        </template>
      </el-table-column>

      <template #empty>
        <EmptyState
          title="暂无券批次"
          description="点击「新建券批次」创建第一个代金券规则。"
        />
      </template>
    </el-table>

    <template #footer>
      <el-pagination
        v-model:current-page="pagination.state.page"
        v-model:page-size="pagination.state.pageSize"
        :total="pagination.state.total"
        :page-sizes="pagination.pageSizes"
        layout="total, sizes, prev, pager, next"
        background
      />
    </template>
  </FillListPageLayout>

  <VoucherTemplateFormDialog
    v-model="editVisible"
    :template="editing"
    @create="onCreate"
    @update="onUpdate"
  />

  <IssueVouchersDialog
    v-model="issueVisible"
    :template="issuing"
    @issued="load"
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
</style>
