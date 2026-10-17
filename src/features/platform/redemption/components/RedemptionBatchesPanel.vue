<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { ArrowDown } from '@element-plus/icons-vue';

import EmptyState from '@/shared/ui/EmptyState.vue';
import FilterBar from '@/shared/ui/FilterBar.vue';
import StatusTag from '@/shared/ui/StatusTag.vue';
import { formatDate, formatDateTime } from '@/shared/lib/date';
import { dateRangeToEpochMillis } from '@/shared/lib/epoch';
import { formatMoney } from '@/shared/lib/money';

import {
  batchDisplayStatus,
  BatchStatusLabel,
  batchStatusValues,
  batchUnusedCount,
  canExportBatch,
  RedemptionPurposeLabel,
  RedemptionPurposeTone,
  redemptionPurposeValues,
  type BatchStatus,
  type RedemptionBatch,
  type RedemptionPurpose,
} from '../model/redemption.types';
import { useRedemptionActions } from '../composables/useRedemptionActions';
import type { KeysPayload, PlainMode } from '../model/redemption.types';
import { getRedemptionPort } from '../services';
import './redemptionPanel.css';

const emit = defineEmits<{
  (e: 'open', batch: RedemptionBatch): void;
  (e: 'edit', batch: RedemptionBatch): void;
  /** 导出得到的明文，交给页面弹出卡密对话框。 */
  (e: 'plain', payload: KeysPayload, mode: PlainMode): void;
  (e: 'changed', batch: RedemptionBatch): void;
}>();

const port = getRedemptionPort();
const actions = useRedemptionActions();

const items = ref<RedemptionBatch[]>([]);
const total = ref(0);
const loading = ref(false);
const page = ref(1);
const pageSize = ref(20);
const emptyFilter = () => ({
  batchId: '',
  name: '',
  salesChannel: '',
  status: 'all' as BatchStatus | 'all',
  purpose: 'all' as RedemptionPurpose | 'all',
  dateRange: null as [string, string] | null,
});
const filter = ref(emptyFilter());

const filtered = computed(() => {
  const f = filter.value;
  return Boolean(
    f.batchId.trim() || f.name.trim() || f.salesChannel.trim() || f.status !== 'all' || f.purpose !== 'all' || f.dateRange,
  );
});

async function reload(): Promise<void> {
  loading.value = true;
  try {
    const r = await port.listBatches({
      page: page.value,
      pageSize: pageSize.value,
      filter: {
        batchId: filter.value.batchId.trim() || undefined,
        name: filter.value.name.trim() || undefined,
        salesChannel: filter.value.salesChannel.trim() || undefined,
        status: filter.value.status,
        purpose: filter.value.purpose,
        ...dateRangeToEpochMillis(filter.value.dateRange),
      },
    });
    if (r.success) {
      items.value = r.data.items;
      total.value = r.data.total;
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    loading.value = false;
  }
}

function search(): void {
  page.value = 1;
  void reload();
}

function reset(): void {
  const hadRange = filter.value.dateRange !== null;
  filter.value = emptyFilter();
  if (!hadRange) search();
}

// FilterBar 的快捷时间按钮只改 dateRange，不发事件，靠 watch 触发查询。
watch(
  () => filter.value.dateRange,
  () => search(),
);

function redeemPercent(b: RedemptionBatch): number {
  return b.quantity ? Math.round((b.redeemedCount / b.quantity) * 1000) / 10 : 0;
}

function validity(b: RedemptionBatch): string {
  const now = Date.now();
  if (b.startsAtUtc && b.startsAtUtc > now) return `${formatDate(b.startsAtUtc)} 起`;
  return b.expiresAtUtc ? `至 ${formatDate(b.expiresAtUtc)}` : '长期有效';
}

async function exportRow(b: RedemptionBatch): Promise<void> {
  const r = await actions.exportBatch(b);
  if (!r) return;
  emit('plain', r, 'exported');
  await reload();
  emit('changed', r.batch);
}

async function onCommand(cmd: 'freeze' | 'void', b: RedemptionBatch): Promise<void> {
  const r = cmd === 'freeze' ? await actions.toggleBatchFrozen(b) : await actions.voidBatch(b);
  if (!r) return;
  await reload();
  emit('changed', r);
}

defineExpose({ reload });
onMounted(() => void reload());
</script>

<template>
  <div class="rd-panel">
    <FilterBar
      v-model:date-range="filter.dateRange"
      :loading="loading"
      @refresh="search"
      @reset="reset"
    >
      <el-form-item label="批次号">
        <el-input
          v-model="filter.batchId"
          clearable
          @keyup.enter="search"
        />
      </el-form-item>
      <el-form-item label="批次名称">
        <el-input
          v-model="filter.name"
          clearable
          @keyup.enter="search"
        />
      </el-form-item>
      <template #extra-row>
        <el-form-item label="销售渠道">
          <el-input
            v-model="filter.salesChannel"
            clearable
            @keyup.enter="search"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select
            v-model="filter.status"
            @change="search"
          >
            <el-option
              label="全部"
              value="all"
            />
            <el-option
              v-for="s in batchStatusValues"
              :key="s"
              :label="BatchStatusLabel[s]"
              :value="s"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="入账途径">
          <el-select
            v-model="filter.purpose"
            @change="search"
          >
            <el-option
              label="全部"
              value="all"
            />
            <el-option
              v-for="p in redemptionPurposeValues"
              :key="p"
              :label="RedemptionPurposeLabel[p]"
              :value="p"
            />
          </el-select>
        </el-form-item>
      </template>
    </FilterBar>

    <div class="rd-panel__table">
      <el-table
        v-loading="loading"
        :data="items"
        row-key="id"
        size="small"
        class="compact-table"
        height="100%"
        highlight-current-row
        :empty-text="' '"
        @row-click="(row: RedemptionBatch) => emit('open', row)"
      >
        <el-table-column
          label="批次"
          min-width="220"
          fixed="left"
        >
          <template #default="{ row }: { row: RedemptionBatch }">
            <div class="batch">
              <span class="batch__name">{{ row.name }}</span>
              <span class="batch__meta">
                <code class="rd-mono">{{ row.id }}</code>
                <span
                  v-if="row.salesChannel"
                  class="batch__channel"
                >{{ row.salesChannel }}</span>
              </span>
            </div>
          </template>
        </el-table-column>

        <el-table-column
          label="面值"
          width="88"
          align="right"
        >
          <template #default="{ row }: { row: RedemptionBatch }">
            <span class="rd-money">{{ formatMoney(row.faceValue, { currency: 'CNY' }) }}</span>
          </template>
        </el-table-column>

        <el-table-column
          label="入账途径"
          width="96"
        >
          <template #default="{ row }: { row: RedemptionBatch }">
            <StatusTag
              :label="RedemptionPurposeLabel[row.purpose]"
              :tone="RedemptionPurposeTone[row.purpose]"
            />
          </template>
        </el-table-column>

        <el-table-column
          label="进度"
          width="200"
        >
          <template #default="{ row }: { row: RedemptionBatch }">
            <div class="progress">
              <div class="progress__text">
                <span><strong>{{ row.redeemedCount }}</strong> / {{ row.quantity }}</span>
                <span class="progress__pct">{{ redeemPercent(row) }}%</span>
              </div>
              <el-progress
                :percentage="redeemPercent(row)"
                :show-text="false"
                :stroke-width="5"
                :status="row.status === 'frozen' ? 'exception' : redeemPercent(row) >= 100 ? 'success' : undefined"
              />
              <div class="progress__extra">
                <span class="progress__amount">已兑 {{ formatMoney(row.redeemedCount * row.faceValue, { currency: 'CNY' }) }}</span>
                <span v-if="row.frozenCount">冻结 {{ row.frozenCount }}</span>
                <span v-if="row.voidedCount">作废 {{ row.voidedCount }}</span>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column
          label="状态"
          width="84"
          align="center"
        >
          <template #default="{ row }: { row: RedemptionBatch }">
            <StatusTag
              :label="batchDisplayStatus(row).label"
              :tone="batchDisplayStatus(row).tone"
            />
          </template>
        </el-table-column>

        <el-table-column
          label="有效期 / 限兑"
          width="128"
        >
          <template #default="{ row }: { row: RedemptionBatch }">
            <div class="rd-two-line">
              <span class="rd-muted">{{ validity(row) }}</span>
              <span class="rd-muted">{{ row.perAccountLimit ? `每户限 ${row.perAccountLimit} 张` : '每户不限' }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column
          label="创建"
          width="128"
        >
          <template #default="{ row }: { row: RedemptionBatch }">
            <div class="two-line">
              <span>{{ formatDateTime(row.createdAtUtc, 'YY-MM-DD HH:mm') }}</span>
              <span class="rd-muted">{{ row.createdBy.displayName }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column
          label="操作"
          width="190"
          fixed="right"
        >
          <template #default="{ row }: { row: RedemptionBatch }">
            <div
              class="ops"
              @click.stop
            >
              <el-button
                link
                type="primary"
                @click="emit('open', row)"
              >
                卡密
              </el-button>
              <el-button
                link
                type="primary"
                @click="emit('edit', row)"
              >
                编辑
              </el-button>
              <el-button
                link
                type="primary"
                :disabled="!canExportBatch(row)"
                @click="exportRow(row)"
              >
                导出
              </el-button>
              <el-dropdown
                trigger="click"
                @command="(cmd: 'freeze' | 'void') => onCommand(cmd, row)"
              >
                <el-button
                  link
                  type="primary"
                >
                  更多<el-icon class="el-icon--right">
                    <ArrowDown />
                  </el-icon>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item
                      command="freeze"
                      :disabled="row.status !== 'active' && row.status !== 'frozen'"
                    >
                      {{ row.status === 'frozen' ? '解除冻结' : '冻结批次' }}
                    </el-dropdown-item>
                    <el-dropdown-item
                      command="void"
                      :disabled="row.status === 'voided' || batchUnusedCount(row) + row.frozenCount === 0"
                      class="danger-item"
                    >
                      作废未兑换
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </template>
        </el-table-column>

        <template #empty>
          <EmptyState
            :title="filtered ? '没有符合条件的批次' : '还没有兑换码批次'"
          />
        </template>
      </el-table>
    </div>

    <div class="rd-panel__footer">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        background
        size="small"
        @current-change="reload()"
        @size-change="search"
      />
    </div>
  </div>
</template>

<style scoped>
.batch {
  display: flex;
  flex-direction: column;
  gap: 3px;
  line-height: 1.35;
  cursor: pointer;
}
.batch__name {
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.batch__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  min-width: 0;
}
.batch__channel {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.progress {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.progress__text {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-secondary);
}
.progress__text strong {
  color: var(--el-text-color-primary);
}
.progress__extra {
  display: flex;
  gap: 8px;
  font-size: 11.5px;
  color: var(--el-text-color-placeholder);
}
.progress__amount {
  color: var(--el-color-success);
  font-variant-numeric: tabular-nums;
}
.two-line {
  display: flex;
  flex-direction: column;
  line-height: 1.4;
  font-size: 12px;
}
.ops {
  display: flex;
  align-items: center;
  gap: 4px;
}
.ops :deep(.el-button + .el-button) {
  margin-left: 6px;
}
.ops :deep(.el-dropdown) {
  margin-left: 6px;
}
:global(.danger-item:not(.is-disabled)) {
  color: var(--el-color-danger);
}
</style>
