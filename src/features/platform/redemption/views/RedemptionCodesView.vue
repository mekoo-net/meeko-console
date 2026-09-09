<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Refresh, Search, TurnOff } from '@element-plus/icons-vue';

import EmptyState from '@/shared/ui/EmptyState.vue';
import FillListPageLayout from '@/shared/ui/FillListPageLayout.vue';
import PageHeader from '@/shared/ui/PageHeader.vue';
import StatusTag from '@/shared/ui/StatusTag.vue';
import { formatDateTime } from '@/shared/lib/date';
import { formatMoney } from '@/shared/lib/money';
import type { AppError } from '@/shared/api/httpTypes';

import RedemptionCreateDrawer from '../components/RedemptionCreateDrawer.vue';
import RedemptionKeysDialog from '../components/RedemptionKeysDialog.vue';
import {
  isSharedRedemption,
  redemptionDisplayStatus,
  RedemptionStatusLabel,
  redemptionStatusValues,
  type Redemption,
  type RedemptionStatus,
} from '../model/redemption.types';
import { getRedemptionPort } from '../services';

const port = getRedemptionPort();

const items = ref<Redemption[]>([]);
const total = ref(0);
const loading = ref(false);
const error = ref<AppError | undefined>();

const page = ref(1);
const pageSize = ref(20);
const keyword = ref('');
const statusFilter = ref<RedemptionStatus | 'all'>('all');

const createVisible = ref(false);
const keysVisible = ref(false);
const createdKeys = ref<string[]>([]);
const createdBatch = ref('');

async function fetchData(): Promise<void> {
  loading.value = true;
  error.value = undefined;
  try {
    const r = await port.list({
      page: page.value,
      pageSize: pageSize.value,
      filter: { keyword: keyword.value.trim() || undefined, status: statusFilter.value },
    });
    if (r.success) {
      items.value = r.data.items;
      total.value = r.data.total;
    } else {
      error.value = r.error;
      ElMessage.error(r.error.message);
    }
  } finally {
    loading.value = false;
  }
}

function resetFilter(): void {
  keyword.value = '';
  statusFilter.value = 'all';
  page.value = 1;
  void fetchData();
}

async function disableRow(row: Redemption): Promise<void> {
  try {
    await ElMessageBox.confirm(`停用「${row.name} · ${row.keyMasked}」后不可再兑换，已入账的不受影响。`, '停用兑换码', {
      type: 'warning',
      confirmButtonText: '停用',
      cancelButtonText: '取消',
    });
  } catch {
    return;
  }
  const r = await port.disable(row.id);
  if (r.success) {
    ElMessage.success('已停用');
    await fetchData();
  } else {
    ElMessage.error(r.error.message);
  }
}

function onCreated(payload: { keys: string[]; batchName: string }): void {
  createdKeys.value = payload.keys;
  createdBatch.value = payload.batchName;
  keysVisible.value = true;
  page.value = 1;
}

function progressText(row: Redemption): string {
  return isSharedRedemption(row) ? `${row.redeemedCount} / ${row.maxRedemptions}` : row.redeemedCount > 0 ? '已使用' : '未使用';
}

onMounted(() => void fetchData());
</script>

<template>
  <FillListPageLayout>
    <template #header>
      <PageHeader
        title="兑换码"
        description="平台级充值码：用户在钱包「兑换码」页签兑换，金额直接进平台钱包（内部入账，不计返利），各产品共用。活动码一码多次，一次性码可批量生成。"
      >
        <template #actions>
          <el-button
            :icon="Refresh"
            :loading="loading"
            @click="fetchData()"
          >
            刷新
          </el-button>
          <el-button
            type="primary"
            :icon="Plus"
            @click="createVisible = true"
          >
            发布兑换码
          </el-button>
        </template>
      </PageHeader>
    </template>

    <template #filters>
      <div class="filter-bar">
        <el-input
          v-model="keyword"
          placeholder="搜索名称 / Key 前缀"
          :prefix-icon="Search"
          clearable
          style="width: 260px"
          @keyup.enter="page = 1; fetchData()"
          @clear="page = 1; fetchData()"
        />
        <el-select
          v-model="statusFilter"
          style="width: 140px"
          @change="page = 1; fetchData()"
        >
          <el-option
            label="全部状态"
            value="all"
          />
          <el-option
            v-for="s in redemptionStatusValues"
            :key="s"
            :label="RedemptionStatusLabel[s]"
            :value="s"
          />
        </el-select>
        <el-button @click="resetFilter">
          重置
        </el-button>
        <span class="filter-bar__meta">当前筛选 <strong>{{ total }}</strong> 条</span>
      </div>

      <el-alert
        v-if="error"
        :title="`加载失败：${error.code}`"
        :description="error.message"
        type="error"
        show-icon
        :closable="false"
      />
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
        label="批次 / 活动"
        min-width="220"
        fixed="left"
      >
        <template #default="{ row }">
          <div class="cell-batch">
            <span class="cell-batch__name">{{ row.name }}</span>
            <span class="cell-batch__meta">
              #{{ row.id }}
              <el-tag
                v-if="isSharedRedemption(row)"
                size="small"
                type="warning"
                effect="plain"
                round
              >活动码</el-tag>
              <code>{{ row.keyMasked }}</code>
            </span>
          </div>
        </template>
      </el-table-column>

      <el-table-column
        label="面额"
        width="110"
        align="right"
      >
        <template #default="{ row }">
          <span class="cell-quota">{{ formatMoney(row.quota, { currency: 'CNY' }) }}</span>
        </template>
      </el-table-column>

      <el-table-column
        label="领取进度"
        width="120"
        align="center"
      >
        <template #default="{ row }">
          <span :class="['cell-progress', { 'cell-progress--done': row.redeemedCount >= row.maxRedemptions }]">{{ progressText(row) }}</span>
        </template>
      </el-table-column>

      <el-table-column
        label="状态"
        width="96"
        align="center"
      >
        <template #default="{ row }">
          <StatusTag
            :label="redemptionDisplayStatus(row).label"
            :tone="redemptionDisplayStatus(row).tone"
          />
        </template>
      </el-table-column>

      <el-table-column
        label="最近兑换"
        width="150"
      >
        <template #default="{ row }">
          <span class="cell-muted">
            {{ row.redeemedAtUtc ? formatDateTime(row.redeemedAtUtc) : '—' }}
            <template v-if="row.usedByAccountUid"> · {{ row.usedByAccountUid }}</template>
          </span>
        </template>
      </el-table-column>

      <el-table-column
        label="截止"
        width="110"
      >
        <template #default="{ row }">
          <span class="cell-muted">{{ row.expiresAtUtc ? formatDateTime(row.expiresAtUtc).slice(0, 10) : '长期' }}</span>
        </template>
      </el-table-column>

      <el-table-column
        label="创建"
        width="150"
      >
        <template #default="{ row }">
          <span class="cell-muted">{{ formatDateTime(row.createdAtUtc) }}</span>
        </template>
      </el-table-column>

      <el-table-column
        label="操作"
        width="80"
        fixed="right"
        align="center"
      >
        <template #default="{ row }">
          <el-tooltip :content="row.status === 'disabled' ? '已停用' : '停用'">
            <el-button
              link
              type="danger"
              :icon="TurnOff"
              :disabled="row.status === 'disabled'"
              @click.stop="disableRow(row)"
            />
          </el-tooltip>
        </template>
      </el-table-column>

      <template #empty>
        <EmptyState
          title="暂无兑换码"
          description="点击「发布兑换码」创建；活动码可多人领取，一次性码可批量生成。"
        />
      </template>
    </el-table>

    <template #footer>
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        background
        @current-change="fetchData()"
        @size-change="page = 1; fetchData()"
      />
    </template>
  </FillListPageLayout>

  <RedemptionCreateDrawer
    v-model:visible="createVisible"
    @created="onCreated"
  />

  <RedemptionKeysDialog
    v-if="keysVisible"
    v-model:visible="keysVisible"
    :keys="createdKeys"
    :batch-name="createdBatch"
    @closed="createdKeys = []; fetchData()"
  />
</template>

<style scoped>
.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
}
.filter-bar__meta {
  margin-left: auto;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.filter-bar__meta strong {
  color: var(--el-text-color-primary);
  font-weight: 600;
}
.cell-batch {
  display: flex;
  flex-direction: column;
  gap: 4px;
  line-height: 1.35;
}
.cell-batch__name {
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.cell-batch__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
.cell-batch__meta code {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  background: #f1f5f9;
  padding: 1px 6px;
  border-radius: 4px;
}
.cell-quota {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--el-color-success);
}
.cell-progress {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-placeholder);
}
.cell-progress--done {
  color: var(--el-color-success);
  font-weight: 600;
}
.cell-muted {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
