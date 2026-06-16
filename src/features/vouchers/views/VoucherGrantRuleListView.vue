<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Refresh } from '@element-plus/icons-vue';

import PageHeader from '@/shared/ui/PageHeader.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import FillListPageLayout from '@/shared/ui/FillListPageLayout.vue';
import { useListQuery } from '@/shared/composables/useListQuery';
import { formatDateTime } from '@/shared/lib/date';

import VoucherGrantRuleFormDialog from '../components/VoucherGrantRuleFormDialog.vue';
import {
  GrantConditionKind,
  VoucherGrantRuleStatus,
  grantRuleStatusLabels,
  grantTriggerEventLabels,
  type CreateVoucherGrantRuleInput,
  type UpdateVoucherGrantRuleInput,
  type VoucherGrantRule,
} from '../model/voucher.types';
import { getVoucherPort } from '../services';

const port = getVoucherPort();
const includeEnded = ref(false);

const list = useListQuery({
  filter: includeEnded,
  filterKey: () => String(includeEnded.value),
  fetcher: ({ page, pageSize, filter }) =>
    port.listGrantRules({ page, pageSize, triggerEventType: null, includeEnded: filter }),
  pageSize: 20,
});

const displayed = computed(() => list.items.value?.items ?? []);

const formVisible = ref(false);
const editing = ref<VoucherGrantRule | null>(null);

const statusTagType: Record<number, string> = {
  [VoucherGrantRuleStatus.Active]: 'success',
  [VoucherGrantRuleStatus.Paused]: 'warning',
  [VoucherGrantRuleStatus.Ended]: 'info',
};

function triggerText(r: VoucherGrantRule): string {
  return grantTriggerEventLabels[r.triggerEventType] ?? r.triggerEventType;
}

function conditionText(r: VoucherGrantRule): string {
  const base =
    r.conditionKind === GrantConditionKind.EventAmountAtLeast
      ? `满 ${r.thresholdAmount ?? '—'} 发放`
      : '';
  const scope = r.scopeProductCode ? `限 ${r.scopeProductCode}` : '';
  return [base, scope].filter(Boolean).join(' · ');
}

function voucherSummary(r: VoucherGrantRule): string {
  const names = r.items.map((i) => i.templateName ?? i.templateCode ?? i.templateId);
  if (names.length === 0) return '券：—';
  if (names.length === 1) return `券：${names[0]}`;
  return `发放 ${names.length} 张：${names.join('、')}`;
}

function windowText(r: VoucherGrantRule): string {
  if (!r.startAtUtc && !r.endAtUtc) return '长期';
  const s = r.startAtUtc ? formatDateTime(r.startAtUtc) : '即时';
  const e = r.endAtUtc ? formatDateTime(r.endAtUtc) : '长期';
  return `${s} ~ ${e}`;
}

function openCreate(): void {
  editing.value = null;
  formVisible.value = true;
}

function openEdit(r: VoucherGrantRule): void {
  editing.value = r;
  formVisible.value = true;
}

async function onCreate(payload: CreateVoucherGrantRuleInput): Promise<void> {
  const r = await port.createGrantRule(payload);
  if (r.success) {
    ElMessage.success('规则已创建');
    formVisible.value = false;
    list.refresh();
  } else ElMessage.error(r.error.message);
}

async function onUpdate(id: string, payload: UpdateVoucherGrantRuleInput): Promise<void> {
  const r = await port.updateGrantRule(id, payload);
  if (r.success) {
    ElMessage.success('规则已更新');
    formVisible.value = false;
    list.refresh();
  } else ElMessage.error(r.error.message);
}

async function setStatus(r: VoucherGrantRule, status: number, label: string): Promise<void> {
  if (status === VoucherGrantRuleStatus.Ended) {
    try {
      await ElMessageBox.confirm(`确定结束规则「${r.name}」？结束后不再自动发券。`, '结束规则', {
        type: 'warning',
        confirmButtonText: '结束',
        cancelButtonText: '取消',
      });
    } catch {
      return;
    }
  }
  const res = await port.setGrantRuleStatus(r.id, status);
  if (res.success) {
    ElMessage.success(`已${label}`);
    list.refresh();
  } else ElMessage.error(res.error.message);
}
</script>

<template>
  <FillListPageLayout>
    <template #header>
      <PageHeader
        title="自动发券规则"
        description="按业务事件（注册送 / 充值满 X 送等）自动向触发账户发券。规则声明式配置，事件驱动、幂等去重，支持金额阈值、生效期、总量与每账户限。"
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
            新建规则
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
        label="规则"
        min-width="220"
      >
        <template #default="{ row }: { row: VoucherGrantRule }">
          <div class="cell-name">
            <span class="cell-name__title">{{ row.name }}</span>
            <span class="cell-name__rule">{{ voucherSummary(row) }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column
        label="触发"
        min-width="160"
      >
        <template #default="{ row }: { row: VoucherGrantRule }">
          <div class="cell-name">
            <el-tag
              class="cell-trigger__tag"
              size="small"
              type="primary"
              effect="plain"
            >
              {{ triggerText(row) }}
            </el-tag>
            <span class="cell-name__rule">{{ conditionText(row) }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column
        label="已发放 / 总量"
        width="130"
      >
        <template #default="{ row }: { row: VoucherGrantRule }">
          {{ row.grantedCount }}<span v-if="row.totalQuota"> / {{ row.totalQuota }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="每账户限"
        width="90"
      >
        <template #default="{ row }: { row: VoucherGrantRule }">
          {{ row.perUserLimit ?? '不限' }}
        </template>
      </el-table-column>
      <el-table-column
        label="生效窗口"
        min-width="200"
      >
        <template #default="{ row }: { row: VoucherGrantRule }">
          {{ windowText(row) }}
        </template>
      </el-table-column>
      <el-table-column
        label="状态"
        width="90"
      >
        <template #default="{ row }: { row: VoucherGrantRule }">
          <el-tag
            size="small"
            :type="statusTagType[row.status] as never"
          >
            {{ grantRuleStatusLabels[row.status] }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        label="操作"
        width="200"
        fixed="right"
      >
        <template #default="{ row }: { row: VoucherGrantRule }">
          <div class="ops">
            <template v-if="row.status !== VoucherGrantRuleStatus.Ended">
              <el-button
                link
                type="primary"
                @click="openEdit(row)"
              >
                编辑
              </el-button>
              <el-divider direction="vertical" />
              <el-button
                v-if="row.status === VoucherGrantRuleStatus.Active"
                link
                type="primary"
                @click="setStatus(row, VoucherGrantRuleStatus.Paused, '暂停')"
              >
                暂停
              </el-button>
              <el-button
                v-else-if="row.status === VoucherGrantRuleStatus.Paused"
                link
                type="primary"
                @click="setStatus(row, VoucherGrantRuleStatus.Active, '启用')"
              >
                启用
              </el-button>
              <el-divider direction="vertical" />
              <el-button
                link
                type="danger"
                @click="setStatus(row, VoucherGrantRuleStatus.Ended, '结束')"
              >
                结束
              </el-button>
            </template>
            <span
              v-else
              class="ops__ended"
            >已结束</span>
          </div>
        </template>
      </el-table-column>

      <template #empty>
        <EmptyState
          title="暂无发券规则"
          description="点击「新建规则」配置注册送 / 充值满 X 送等自动发券。"
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

  <VoucherGrantRuleFormDialog
    v-model="formVisible"
    :rule="editing"
    @create="onCreate"
    @update="onUpdate"
  />
</template>

<style scoped>
.cell-name {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.35;
}
.cell-name__title {
  font-weight: 500;
}
.cell-name__rule {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.cell-trigger__tag {
  width: 96px;
  justify-content: center;
  text-align: center;
}
.ops {
  white-space: nowrap;
}
.ops__ended {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
