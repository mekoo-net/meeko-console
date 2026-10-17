<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';

import EmptyState from '@/shared/ui/EmptyState.vue';
import FilterBar from '@/shared/ui/FilterBar.vue';
import StatusTag from '@/shared/ui/StatusTag.vue';
import { formatDateTime } from '@/shared/lib/date';
import { dateRangeToEpochMillis } from '@/shared/lib/epoch';
import { formatMoney } from '@/shared/lib/money';
import type { BillingProduct } from '@/features/platform/products/model/product.types';
import { getProductPort } from '@/features/platform/products/services';

import {
  AttemptResultLabel,
  attemptResultValues,
  AttemptResultTone,
  type AttemptFilter,
  type AttemptResultFilter,
  type RedemptionAttempt,
  type RedemptionBatch,
} from '../model/redemption.types';
import { summarizeUserAgent } from '../model/userAgent';
import { getRedemptionPort } from '../services';
import './redemptionPanel.css';

type InitialFilter = Partial<Pick<AttemptFilter, 'result' | 'accountUid' | 'ip' | 'batchId'>>;

const props = defineProps<{
  batchOptions: Pick<RedemptionBatch, 'id' | 'name'>[];
  /** 从其他页面带过来的初始筛选（URL query），如概览卡片的「仅看失败」。 */
  initial?: InitialFilter;
}>();

const emit = defineEmits<{ (e: 'open-code', codeId: string): void }>();

const port = getRedemptionPort();
const productPort = getProductPort();
const products = ref<BillingProduct[]>([]);

const items = ref<RedemptionAttempt[]>([]);
const total = ref(0);
const loading = ref(false);
const page = ref(1);
const pageSize = ref(20);

const failureResults = attemptResultValues.filter((r) => r !== 'success');

const emptyFilter = () => ({
  result: 'all' as AttemptResultFilter,
  accountUid: '',
  accountEmail: '',
  ip: '',
  batchId: '',
  productCode: '',
  dateRange: null as [string, string] | null,
});
// query 里没带的键是 undefined，直接展开会把默认值（'all' / ''）冲掉。
const presets = Object.fromEntries(Object.entries(props.initial ?? {}).filter(([, v]) => v !== undefined));
const filter = ref({ ...emptyFilter(), ...presets });

const filtered = computed(() => {
  const f = filter.value;
  return Boolean(
    f.result !== 'all' || f.accountUid.trim() || f.accountEmail.trim() || f.ip.trim() || f.batchId || f.productCode || f.dateRange,
  );
});

async function reload(): Promise<void> {
  loading.value = true;
  try {
    const f = filter.value;
    const r = await port.listAttempts({
      page: page.value,
      pageSize: pageSize.value,
      filter: {
        result: f.result,
        accountUid: f.accountUid.trim() || undefined,
        accountEmail: f.accountEmail.trim() || undefined,
        ip: f.ip.trim() || undefined,
        batchId: f.batchId || undefined,
        productCode: f.productCode || undefined,
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
function drill(partial: { accountUid?: string; ip?: string; batchId?: string; productCode?: string }): void {
  Object.assign(filter.value, partial);
  search();
}

/** 停用的业务也要能筛：历史日志里还有它。已注销的不在列表里，靠下拉框直接输入代码。 */
async function loadProducts(): Promise<void> {
  const r = await productPort.list(true);
  if (r.success) products.value = r.data;
}

defineExpose({ reload });
onMounted(() => {
  void reload();
  void loadProducts();
});
</script>

<template>
  <div class="rd-panel">
    <FilterBar
      v-model:account-uid="filter.accountUid"
      v-model:contact-keyword="filter.accountEmail"
      v-model:date-range="filter.dateRange"
      contact-keyword-label="账户邮箱"
      :loading="loading"
      @refresh="search"
      @reset="reset"
    >
      <el-form-item label="结果">
        <el-select
          v-model="filter.result"
          @change="search"
        >
          <el-option
            label="全部"
            value="all"
          />
          <el-option
            label="成功"
            value="success"
          />
          <el-option
            label="全部失败"
            value="failed"
          />
          <el-option
            v-for="r in failureResults"
            :key="r"
            :label="AttemptResultLabel[r]"
            :value="r"
          />
        </el-select>
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
        <el-form-item label="业务">
          <el-select
            v-model="filter.productCode"
            placeholder="全部"
            filterable
            allow-create
            default-first-option
            clearable
            @change="search"
          >
            <el-option
              v-for="p in products"
              :key="p.code"
              :label="`${p.displayName}（${p.code}）`"
              :value="p.code"
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

    <div class="rd-panel__table">
      <el-table
        v-loading="loading"
        :data="items"
        row-key="id"
        size="small"
        class="compact-table"
        height="100%"
        :row-class-name="({ row }: { row: RedemptionAttempt }) => (row.result === 'success' ? '' : 'row-failed')"
        :empty-text="' '"
      >
        <el-table-column
          label="时间"
          width="128"
          fixed="left"
        >
          <template #default="{ row }: { row: RedemptionAttempt }">
            {{ formatDateTime(row.atUtc, 'MM-DD HH:mm:ss') }}
          </template>
        </el-table-column>

        <el-table-column
          label="结果"
          width="112"
        >
          <template #default="{ row }: { row: RedemptionAttempt }">
            <StatusTag
              :label="AttemptResultLabel[row.result]"
              :tone="AttemptResultTone[row.result]"
            />
          </template>
        </el-table-column>

        <el-table-column
          label="账户"
          width="164"
        >
          <template #default="{ row }: { row: RedemptionAttempt }">
            <div class="rd-two-line">
              <span
                class="rd-mono rd-link"
                @click="drill({ accountUid: row.account.uid })"
              >{{ row.account.uid }}</span>
              <span class="rd-muted">{{ row.account.email ?? '—' }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column
          label="业务"
          width="88"
        >
          <template #default="{ row }: { row: RedemptionAttempt }">
            <span
              v-if="row.productCode"
              class="rd-mono rd-link"
              @click="drill({ productCode: row.productCode })"
            >{{ row.productCode }}</span>
            <span
              v-else
              class="rd-muted"
            >—</span>
          </template>
        </el-table-column>

        <el-table-column
          label="卡密 / 批次"
          min-width="200"
        >
          <template #default="{ row }: { row: RedemptionAttempt }">
            <div class="rd-two-line">
              <span
                v-if="row.codeId"
                class="rd-code rd-link"
                @click="emit('open-code', row.codeId)"
              >{{ row.inputMasked }}</span>
              <span
                v-else
                class="rd-code rd-code--miss"
              >{{ row.inputMasked }}</span>
              <span
                v-if="row.batchId"
                class="rd-muted rd-link"
                :title="`${row.batchName} · ${row.batchId}`"
                @click="drill({ batchId: row.batchId })"
              >{{ row.batchName }}</span>
              <span
                v-else
                class="rd-muted"
              >—</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column
          label="金额"
          width="96"
          align="right"
        >
          <template #default="{ row }: { row: RedemptionAttempt }">
            <el-tooltip
              v-if="row.amount !== null"
              :content="`充值单号 ${row.rechargeId ?? '—'}`"
              placement="top"
            >
              <span class="rd-money rd-money--success">+{{ formatMoney(row.amount, { currency: 'CNY' }) }}</span>
            </el-tooltip>
            <span
              v-else
              class="rd-muted"
            >—</span>
          </template>
        </el-table-column>

        <el-table-column
          label="IP"
          width="140"
        >
          <template #default="{ row }: { row: RedemptionAttempt }">
            <span
              class="rd-mono rd-link"
              @click="drill({ ip: row.ip })"
            >{{ row.ip }}</span>
          </template>
        </el-table-column>

        <el-table-column
          label="设备"
          width="132"
        >
          <template #default="{ row }: { row: RedemptionAttempt }">
            <div
              class="rd-two-line"
              :class="{ 'rd-script': summarizeUserAgent(row.userAgent).isScript }"
            >
              <span>{{ summarizeUserAgent(row.userAgent).browser }}</span>
              <span class="rd-muted">{{ summarizeUserAgent(row.userAgent).os }}</span>
            </div>
          </template>
        </el-table-column>

        <template #empty>
          <EmptyState
            :title="filtered ? '没有符合条件的兑换日志' : '还没有兑换日志'"
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
.rd-code--miss {
  color: var(--el-text-color-placeholder);
  text-decoration: line-through;
  text-decoration-color: var(--el-color-danger-light-5);
}
.rd-panel__table :deep(.row-failed > td.el-table__cell:first-child) {
  box-shadow: inset 3px 0 0 var(--el-color-danger-light-5);
}
</style>
