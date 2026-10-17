<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { MoreFilled } from '@element-plus/icons-vue';

import EmptyState from '@/shared/ui/EmptyState.vue';
import FilterBar from '@/shared/ui/FilterBar.vue';
import StatusTag from '@/shared/ui/StatusTag.vue';
import { formatDateTime } from '@/shared/lib/date';
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

/** 不用 el-progress 的 status：设了 status 文字会被图标替换，看不到张数。 */
function progressColor(b: RedemptionBatch): string | undefined {
  if (b.status === 'frozen') return 'var(--el-color-danger)';
  if (redeemPercent(b) >= 100) return 'var(--el-color-success)';
  return undefined;
}

/** 导出不改批次，不用刷新列表。 */
async function exportRow(b: RedemptionBatch): Promise<void> {
  const r = await actions.exportBatch(b);
  if (r) emit('plain', r, 'exported');
}

async function freezeRow(b: RedemptionBatch): Promise<void> {
  const r = await actions.toggleBatchFrozen(b);
  if (!r) return;
  await reload();
  emit('changed', r);
}

async function voidRow(b: RedemptionBatch): Promise<void> {
  const r = await actions.voidBatch(b);
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
        <el-form-item label="渠道">
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
        <el-form-item label="形式">
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
          min-width="200"
          fixed="left"
        >
          <template #default="{ row }: { row: RedemptionBatch }">
            <div class="batch">
              <span class="batch__name">{{ row.name }}</span>
              <span class="batch__id">{{ row.id }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column
          label="渠道"
          min-width="140"
          show-overflow-tooltip
        >
          <template #default="{ row }: { row: RedemptionBatch }">
            {{ row.salesChannel ?? '—' }}
          </template>
        </el-table-column>

        <el-table-column
          label="面值"
          width="96"
          align="right"
        >
          <template #default="{ row }: { row: RedemptionBatch }">
            <span class="rd-money">{{ formatMoney(row.faceValue, { currency: 'CNY' }) }}</span>
          </template>
        </el-table-column>

        <el-table-column
          label="形式"
          width="100"
          align="center"
        >
          <template #default="{ row }: { row: RedemptionBatch }">
            <StatusTag
              :label="RedemptionPurposeLabel[row.purpose]"
              :tone="RedemptionPurposeTone[row.purpose]"
            />
          </template>
        </el-table-column>

        <el-table-column
          label="核销"
          min-width="190"
        >
          <template #default="{ row }: { row: RedemptionBatch }">
            <el-progress
              :percentage="redeemPercent(row)"
              :stroke-width="6"
              :color="progressColor(row)"
              :format="() => `${row.redeemedCount} / ${row.quantity}`"
              class="progress"
            />
          </template>
        </el-table-column>

        <el-table-column
          label="状态"
          width="88"
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
          label="限兑"
          width="80"
          align="center"
        >
          <template #default="{ row }: { row: RedemptionBatch }">
            {{ row.perAccountLimit ? `${row.perAccountLimit} 张` : '不限' }}
          </template>
        </el-table-column>

        <el-table-column
          label="创建"
          width="160"
        >
          <template #default="{ row }: { row: RedemptionBatch }">
            {{ formatDateTime(row.createdAtUtc, 'YYYY-MM-DD HH:mm:ss') }}
          </template>
        </el-table-column>

        <el-table-column
          label="操作"
          width="168"
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
                placement="bottom-end"
                @command="(cmd: 'freeze' | 'void') => (cmd === 'freeze' ? freezeRow(row) : voidRow(row))"
              >
                <el-button
                  link
                  type="primary"
                  :icon="MoreFilled"
                  class="ops__more"
                />
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item
                      command="freeze"
                      :disabled="row.status !== 'active' && row.status !== 'frozen'"
                    >
                      {{ row.status === 'frozen' ? '解冻' : '冻结' }}
                    </el-dropdown-item>
                    <el-dropdown-item
                      command="void"
                      :disabled="row.status === 'voided' || batchUnusedCount(row) + row.frozenCount === 0"
                      class="rd-danger-item"
                    >
                      作废
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
  line-height: 1.45;
}
.batch__name {
  color: var(--el-text-color-primary);
  font-weight: 500;
}
.batch__id {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}
.ops {
  display: flex;
  align-items: center;
  white-space: nowrap;
}
.ops__more {
  margin-left: 12px;
}
/* 下拉菜单 Teleport 到 body，scoped 命不中。 */
:global(.rd-danger-item:not(.is-disabled)) {
  color: var(--el-color-danger);
}
/* 表格里进度文字右侧留够宽度，「1234 / 10000」不换行。 */
.progress :deep(.el-progress__text) {
  min-width: 76px;
  font-size: 12px !important;
  color: var(--el-text-color-regular);
  font-variant-numeric: tabular-nums;
}
</style>
