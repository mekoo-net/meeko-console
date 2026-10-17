<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Lock, Unlock, Delete, WarningFilled, RefreshLeft, Search } from '@element-plus/icons-vue';

import EmptyState from '@/shared/ui/EmptyState.vue';
import FilterBar from '@/shared/ui/FilterBar.vue';
import StatusTag from '@/shared/ui/StatusTag.vue';
import { formatDateTime } from '@/shared/lib/date';
import { dateRangeToEpochMillis } from '@/shared/lib/epoch';
import { formatMoney } from '@/shared/lib/money';

import {
  CodeStatusLabel,
  CodeStatusTone,
  codeStatusValues,
  type CodeFilter,
  type CodeStatus,
  type RedemptionBatch,
  type RedemptionCode,
} from '../model/redemption.types';
import { useRedemptionActions } from '../composables/useRedemptionActions';
import { summarizeUserAgent } from '../model/userAgent';
import { getRedemptionPort } from '../services';
import './redemptionPanel.css';

type InitialFilter = Partial<Pick<CodeFilter, 'batchId' | 'accountUid' | 'ip'>> & { status?: CodeStatus };

const props = defineProps<{
  batchOptions?: Pick<RedemptionBatch, 'id' | 'name'>[];
  /** 嵌在批次弹窗里时锁定批次：不显示批次筛选和批次列。 */
  fixedBatchId?: string;
  /** 从其他页面带过来的初始筛选（URL query）。 */
  initial?: InitialFilter;
}>();

const emit = defineEmits<{
  (e: 'open', code: RedemptionCode): void;
  (e: 'changed', code: RedemptionCode): void;
}>();

const port = getRedemptionPort();
const actions = useRedemptionActions();

const items = ref<RedemptionCode[]>([]);
const total = ref(0);
const loading = ref(false);
const page = ref(1);
const pageSize = ref(20);

const emptyFilter = () => ({
  code: '',
  batchId: '',
  status: 'all' as CodeStatus | 'all',
  accountUid: '',
  accountEmail: '',
  ip: '',
  dateRange: null as [string, string] | null,
});
// query 里没带的键是 undefined，直接展开会把默认值（'all' / ''）冲掉。
const presets = Object.fromEntries(Object.entries(props.initial ?? {}).filter(([, v]) => v !== undefined));
const filter = ref({ ...emptyFilter(), ...presets });

const filtered = computed(() => {
  const f = filter.value;
  return Boolean(f.code.trim() || f.batchId || f.status !== 'all' || f.accountUid.trim() || f.accountEmail.trim() || f.ip.trim() || f.dateRange);
});

async function reload(): Promise<void> {
  loading.value = true;
  try {
    const f = filter.value;
    const r = await port.listCodes({
      page: page.value,
      pageSize: pageSize.value,
      filter: {
        code: f.code.trim() || undefined,
        batchId: props.fixedBatchId ?? (f.batchId || undefined),
        status: f.status,
        accountUid: f.accountUid.trim() || undefined,
        accountEmail: f.accountEmail.trim() || undefined,
        ip: f.ip.trim() || undefined,
        ...dateRangeToEpochMillis(f.dateRange),
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

/** 点表格里的账户 / IP，填进筛选再查。 */
function drill(partial: { accountUid?: string; ip?: string }): void {
  Object.assign(filter.value, partial);
  search();
}

async function toggleFrozen(row: RedemptionCode): Promise<void> {
  const r = await actions.toggleCodeFrozen(row);
  if (!r) return;
  await reload();
  emit('changed', r);
}

async function voidRow(row: RedemptionCode): Promise<void> {
  const r = await actions.voidCode(row);
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
      v-if="!fixedBatchId"
      v-model:account-uid="filter.accountUid"
      v-model:contact-keyword="filter.accountEmail"
      v-model:date-range="filter.dateRange"
      contact-keyword-label="账户邮箱"
      :loading="loading"
      @refresh="search"
      @reset="reset"
    >
      <el-form-item label="卡密">
        <el-input
          v-model="filter.code"
          class="code-input"
          clearable
          @keyup.enter="search"
        />
      </el-form-item>
      <el-form-item label="批次">
        <el-select
          v-model="filter.batchId"
          placeholder="全部"
          filterable
          clearable
          @change="search"
        >
          <el-option
            v-for="b in batchOptions"
            :key="b.id"
            :label="b.name"
            :value="b.id"
          />
        </el-select>
      </el-form-item>
      <template #extra-row>
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
              v-for="s in codeStatusValues"
              :key="s"
              :label="CodeStatusLabel[s]"
              :value="s"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="IP">
          <el-input
            v-model="filter.ip"
            clearable
            @keyup.enter="search"
          />
        </el-form-item>
      </template>
    </FilterBar>
    <div
      v-else
      class="rd-toolbar"
    >
      <el-input
        v-model="filter.code"
        class="code-input"
        :prefix-icon="Search"
        placeholder="卡密"
        clearable
        style="width: 260px"
        @keyup.enter="search"
        @clear="search"
      />
      <el-input
        v-model="filter.accountUid"
        placeholder="账户 UID"
        clearable
        style="width: 160px"
        @keyup.enter="search"
        @clear="search"
      />
      <el-input
        v-model="filter.ip"
        placeholder="IP"
        clearable
        style="width: 160px"
        @keyup.enter="search"
        @clear="search"
      />
      <el-select
        v-model="filter.status"
        style="width: 140px"
        @change="search"
      >
        <el-option
          label="全部状态"
          value="all"
        />
        <el-option
          v-for="s in codeStatusValues"
          :key="s"
          :label="CodeStatusLabel[s]"
          :value="s"
        />
      </el-select>
      <el-button
        type="primary"
        :icon="Search"
        @click="search"
      >
        查询
      </el-button>
      <el-button
        :icon="RefreshLeft"
        @click="reset"
      >
        重置
      </el-button>
      <div
        v-if="$slots.actions"
        class="toolbar-actions"
      >
        <slot name="actions" />
      </div>
    </div>

    <div class="rd-panel__table">
      <el-table
        v-loading="loading"
        :data="items"
        row-key="id"
        size="small"
        class="compact-table"
        height="100%"
        :empty-text="' '"
        @row-click="(row: RedemptionCode) => emit('open', row)"
      >
        <el-table-column
          label="卡密"
          width="196"
          fixed="left"
        >
          <template #default="{ row }: { row: RedemptionCode }">
            <div class="code-cell">
              <span class="rd-code">{{ row.codeMasked }}</span>
              <el-tooltip
                v-if="row.failedAttempts > 0"
                :content="`失败 ${row.failedAttempts} 次`"
                placement="top"
              >
                <el-icon class="code-cell__risk">
                  <WarningFilled />
                </el-icon>
              </el-tooltip>
            </div>
          </template>
        </el-table-column>

        <el-table-column
          v-if="!fixedBatchId"
          label="批次"
          min-width="130"
        >
          <template #default="{ row }: { row: RedemptionCode }">
            <div class="rd-two-line">
              <span>{{ row.batchName }}</span>
              <span class="rd-muted">{{ row.batchId }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column
          label="面值"
          width="84"
          align="right"
        >
          <template #default="{ row }: { row: RedemptionCode }">
            <span class="rd-money">{{ formatMoney(row.faceValue, { currency: 'CNY' }) }}</span>
          </template>
        </el-table-column>

        <el-table-column
          label="状态"
          width="80"
          align="center"
        >
          <template #default="{ row }: { row: RedemptionCode }">
            <StatusTag
              :label="CodeStatusLabel[row.status]"
              :tone="CodeStatusTone[row.status]"
            />
          </template>
        </el-table-column>

        <el-table-column
          label="账户"
          min-width="156"
        >
          <template #default="{ row }: { row: RedemptionCode }">
            <div
              v-if="row.redeemed"
              class="rd-two-line"
            >
              <span
                class="rd-mono rd-link"
                @click.stop="drill({ accountUid: row.redeemed.account.uid })"
              >{{ row.redeemed.account.uid }}</span>
              <span class="rd-muted">{{ row.redeemed.account.email ?? '—' }}</span>
            </div>
            <span
              v-else
              class="rd-muted"
            >—</span>
          </template>
        </el-table-column>

        <el-table-column
          label="业务"
          width="88"
        >
          <template #default="{ row }: { row: RedemptionCode }">
            <span
              v-if="row.redeemed?.productCode"
              class="rd-mono"
            >{{ row.redeemed.productCode }}</span>
            <span
              v-else
              class="rd-muted"
            >—</span>
          </template>
        </el-table-column>

        <el-table-column
          label="时间"
          width="116"
        >
          <template #default="{ row }: { row: RedemptionCode }">
            <span :class="row.redeemed ? '' : 'rd-muted'">{{ row.redeemed ? formatDateTime(row.redeemed.atUtc, 'YY-MM-DD HH:mm') : '—' }}</span>
          </template>
        </el-table-column>

        <el-table-column
          label="IP"
          width="140"
        >
          <template #default="{ row }: { row: RedemptionCode }">
            <span
              v-if="row.redeemed"
              class="rd-mono rd-link"
              @click.stop="drill({ ip: row.redeemed.ip })"
            >{{ row.redeemed.ip }}</span>
            <span
              v-else
              class="rd-muted"
            >—</span>
          </template>
        </el-table-column>

        <el-table-column
          label="设备"
          width="132"
        >
          <template #default="{ row }: { row: RedemptionCode }">
            <div
              v-if="row.redeemed"
              class="rd-two-line"
              :class="{ 'rd-script': summarizeUserAgent(row.redeemed.userAgent).isScript }"
            >
              <span>{{ summarizeUserAgent(row.redeemed.userAgent).browser }}</span>
              <span class="rd-muted">{{ summarizeUserAgent(row.redeemed.userAgent).os }}</span>
            </div>
            <span
              v-else
              class="rd-muted"
            >—</span>
          </template>
        </el-table-column>

        <el-table-column
          label="操作"
          width="80"
          fixed="right"
          align="center"
        >
          <template #default="{ row }: { row: RedemptionCode }">
            <div
              class="ops"
              @click.stop
            >
              <el-tooltip
                :content="row.status === 'frozen' ? '解除冻结' : '冻结'"
                placement="top"
              >
                <el-button
                  link
                  type="warning"
                  :icon="row.status === 'frozen' ? Unlock : Lock"
                  :disabled="row.status !== 'unused' && row.status !== 'frozen'"
                  @click="toggleFrozen(row)"
                />
              </el-tooltip>
              <el-tooltip
                content="作废"
                placement="top"
              >
                <el-button
                  link
                  type="danger"
                  :icon="Delete"
                  :disabled="row.status !== 'unused' && row.status !== 'frozen'"
                  @click="voidRow(row)"
                />
              </el-tooltip>
            </div>
          </template>
        </el-table-column>

        <template #empty>
          <EmptyState
            :title="filtered ? '没有符合条件的卡密' : '还没有卡密'"
          />
        </template>
      </el-table>
    </div>

    <div class="rd-panel__footer">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[20, 50, 100]"
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
/* 批次弹窗把批次级动作（导出）放进工具条最右侧。 */
.toolbar-actions {
  display: flex;
  gap: 10px;
  margin-left: auto;
}
.code-input :deep(input) {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  text-transform: uppercase;
}
.code-input :deep(input::placeholder) {
  font-family: inherit;
  text-transform: none;
}
.opt-meta {
  float: right;
  margin-left: 12px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
.code-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.code-cell__risk {
  color: var(--el-color-danger);
}
.ops {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
</style>
