<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { CopyDocument, Plus, Refresh, Ticket } from '@element-plus/icons-vue';

import PageHeader from '@/shared/ui/PageHeader.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import FillListPageLayout from '@/shared/ui/FillListPageLayout.vue';
import { clientPaginate, usePagination } from '@/shared/composables/usePagination';
import { formatDateTime } from '@/shared/lib/date';
import { formatMoney } from '@/shared/lib/money';

import VoucherTemplateFormDialog from '../components/VoucherTemplateFormDialog.vue';
import IssueVouchersDialog from '../components/IssueVouchersDialog.vue';
import TemplateActivitiesDialog from '../components/TemplateActivitiesDialog.vue';
import {
  VoucherDeductKind,
  VoucherTemplateStatus,
  VoucherValidityKind,
  applyModeLabels,
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
const activitiesVisible = ref(false);
const editing = ref<VoucherTemplate | null>(null);
const issuing = ref<VoucherTemplate | null>(null);
const viewingActivities = ref<VoucherTemplate | null>(null);

const statusTagType: Record<number, string> = {
  [VoucherTemplateStatus.Draft]: 'info',
  [VoucherTemplateStatus.Active]: 'success',
  [VoucherTemplateStatus.Paused]: 'warning',
  [VoucherTemplateStatus.Archived]: 'info',
};

function ruleSummary(t: VoucherTemplate): string {
  const r = t.rule;
  if (r.kind === VoucherDeductKind.NoThreshold) return `无门槛减 ${formatMoney(r.faceValue)}`;
  if (r.kind === VoucherDeductKind.FullReduction)
    return `满 ${formatMoney(r.thresholdAmount)} 减 ${formatMoney(r.faceValue)}`;
  const pct = Math.round(r.discountRate * 100) / 10;
  return `满 ${formatMoney(r.thresholdAmount)} 打 ${pct} 折（封顶 ${formatMoney(r.capValue)}）`;
}

function validitySummary(t: VoucherTemplate): string {
  const v = t.validity;
  if (v.kind === VoucherValidityKind.RelativeDays) return `领取后 ${v.days} 天`;
  return `${formatDateTime(v.fromUtc)} ~ ${formatDateTime(v.toUtc)}`;
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

function openActivities(row: VoucherTemplate): void {
  viewingActivities.value = row;
  activitiesVisible.value = true;
}

async function copyKey(code: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(code);
    ElMessage.success('券 Key 已复制');
  } catch {
    ElMessage.warning('复制失败，请手动复制');
  }
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
        title="券务生成"
        description="生成抵扣券（无门槛/满减/折扣），设置抵扣周期与生命周期，获取券 Key，并向用户下发或生成兑换码。"
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
        label="券 Key"
        width="170"
      >
        <template #default="{ row }: { row: VoucherTemplate }">
          <el-tag
            size="small"
            type="info"
            effect="plain"
            class="key-tag"
            @click="copyKey(row.code)"
          >
            {{ row.code }}
            <el-icon class="key-tag__copy"><CopyDocument /></el-icon>
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        label="类型 / 周期"
        width="150"
      >
        <template #default="{ row }: { row: VoucherTemplate }">
          <el-tag
            size="small"
            effect="plain"
          >
            {{ deductKindLabels[row.rule.kind] }}
          </el-tag>
          <el-tag
            v-if="row.rule.kind === VoucherDeductKind.Discount"
            size="small"
            type="info"
            effect="plain"
            class="mode-tag"
          >
            {{ applyModeLabels[row.applyMode] }}
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
        width="320"
        fixed="right"
      >
        <template #default="{ row }: { row: VoucherTemplate }">
          <el-button
            link
            type="primary"
            :icon="Ticket"
            @click="openActivities(row)"
          >
            领券活动
          </el-button>
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

  <TemplateActivitiesDialog
    v-model="activitiesVisible"
    :template="viewingActivities"
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
.mode-tag {
  margin-top: 2px;
}
</style>
