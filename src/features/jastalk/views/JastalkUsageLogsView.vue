<script setup lang="ts">
/**
 * Jastalk 用量明细：网关每结算一次一行，带每条用量和当时的单价——查账看的就是每一次，所以不按「一件事」归并
 * （用户自己看的使用日志才归并）。同一件事的几行 actionId 一样：先翻记忆的向量、重排，再是对话。
 * 「未扣」是这一次什么都没产出，冻结整笔退回了；上游报错但已经写出了字的照样按写出来的扣。
 */
import { onMounted, ref } from 'vue';

import PageHeader from '@/shared/ui/PageHeader.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import FillListPageLayout from '@/shared/ui/FillListPageLayout.vue';
import { fail } from '@/shared/api/httpTypes';
import { formatDateTime } from '@/shared/lib/date';

import { usePagedList } from '../composables/usePagedList';
import type { UsageLine, UsageLog, UsageStatus } from '../model/jastalk.types';
import {
  formatPoints,
  formatPrice,
  parseAccountUid,
  purposeLabel,
  purposeLabels,
  usageKindLabel,
} from '../model/jastalkFormat';
import { getJastalkAdminPort } from '../services';

const port = getJastalkAdminPort();

interface Filter {
  uid: string;
  purpose: string;
  status: UsageStatus | '';
  range: [Date, Date] | null;
}

const blank = (): Filter => ({ uid: '', purpose: '', status: '', range: null });
const filter = ref(blank());

const { items, total, page, pageSize, loading, load, reload } = usePagedList<UsageLog>((p) => {
  const uid = parseAccountUid(filter.value.uid);
  if (!uid.ok) return Promise.resolve(fail({ code: 'validation', message: '账户 UID 只能是数字' }));
  const [from, to] = filter.value.range ?? [];
  return port.usageLogs(
    {
      accountUid: uid.value,
      purpose: filter.value.purpose || undefined,
      status: filter.value.status || undefined,
      from: from?.getTime(),
      // 选的是「到这一秒为止」，后端要的是「这之前」
      to: to ? to.getTime() + 1000 : undefined,
    },
    p,
  );
});

function reset(): void {
  filter.value = blank();
  reload();
}

/** 列表里一格写不下每一条：写第一条的模型，后面还有几条。 */
function modelsOf(log: UsageLog): string {
  const first = log.lines[0];
  if (!first) return '—';
  return log.lines.length > 1 ? `${first.modelName} 等 ${log.lines.length} 条` : first.modelName;
}

function quantityOf(line: UsageLine): string {
  if (line.unit === 'token') return `入 ${line.inputTokens.toLocaleString()} · 出 ${line.outputTokens.toLocaleString()} token`;
  return `${line.quantity.toLocaleString()} ${line.unit === 'image' ? '张' : '秒'}`;
}

function priceOf(line: UsageLine): string {
  if (line.ratedBy === '-') return '没找到价格';
  return line.unit === 'token'
    ? `入 ${formatPrice(line.inputPrice)} · 出 ${formatPrice(line.outputPrice)}`
    : formatPrice(line.outputPrice || line.inputPrice);
}

const detail = ref<UsageLog | null>(null);

onMounted(() => void load());
</script>

<template>
  <FillListPageLayout>
    <template #header>
      <PageHeader title="用量明细" />
    </template>

    <template #filters>
      <el-form
        inline
        class="filters"
        @submit.prevent="reload"
      >
        <el-form-item label="账户 UID">
          <el-input
            v-model="filter.uid"
            placeholder="精确匹配"
            clearable
            class="filters__uid"
            @keyup.enter="reload"
          />
        </el-form-item>
        <el-form-item label="功能">
          <el-select
            v-model="filter.purpose"
            class="filters__select"
            placeholder="全部"
            clearable
            @change="reload"
          >
            <el-option
              v-for="(label, key) in purposeLabels"
              :key="key"
              :label="label"
              :value="key"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="结果">
          <el-select
            v-model="filter.status"
            class="filters__select"
            placeholder="全部"
            clearable
            @change="reload"
          >
            <el-option
              label="已扣"
              value="charged"
            />
            <el-option
              label="未扣"
              value="voided"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="时间">
          <el-date-picker
            v-model="filter.range"
            type="datetimerange"
            start-placeholder="开始"
            end-placeholder="结束"
            :default-time="[new Date(2000, 0, 1, 0, 0, 0), new Date(2000, 0, 1, 23, 59, 59)]"
            @change="reload"
          />
        </el-form-item>
        <el-form-item>
          <el-button
            type="primary"
            :loading="loading"
            @click="reload"
          >
            查询
          </el-button>
          <el-button @click="reset">
            重置
          </el-button>
        </el-form-item>
      </el-form>
    </template>

    <el-table
      v-loading="loading"
      :data="items"
      row-key="id"
      size="small"
      class="compact-table clickable-table"
      height="100%"
      :empty-text="' '"
      @row-click="(row: UsageLog) => (detail = row)"
    >
      <el-table-column
        label="时间"
        width="160"
      >
        <template #default="{ row }: { row: UsageLog }">
          <span class="cell-date">{{ formatDateTime(row.createdAt, 'YYYY-MM-DD HH:mm:ss') }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="账户 UID"
        width="120"
      >
        <template #default="{ row }: { row: UsageLog }">
          <span class="mono">{{ row.accountUid }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="功能"
        width="110"
      >
        <template #default="{ row }: { row: UsageLog }">
          {{ purposeLabel(row.purpose) }}
        </template>
      </el-table-column>
      <el-table-column
        label="调用"
        min-width="240"
      >
        <template #default="{ row }: { row: UsageLog }">
          <div class="cell-stack">
            <span>{{ row.lines[0] ? usageKindLabel(row.lines[0].kind) : '—' }} · <span class="mono">{{ modelsOf(row) }}</span></span>
            <span
              class="cell-sub mono"
              :title="`同一件事的几次结算是同一个：${row.actionId}`"
            >{{ row.actionId }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column
        label="上游"
        width="80"
        align="center"
      >
        <template #default="{ row }: { row: UsageLog }">
          <el-tag
            size="small"
            :type="row.upstreamSuccess ? 'success' : 'danger'"
            effect="plain"
          >
            {{ row.upstreamSuccess ? '成功' : '出错' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        label="结果"
        width="80"
        align="center"
      >
        <template #default="{ row }: { row: UsageLog }">
          <el-tag
            size="small"
            :type="row.status === 'charged' ? 'primary' : 'info'"
            effect="plain"
          >
            {{ row.status === 'charged' ? '已扣' : '未扣' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        label="积分"
        width="110"
        align="right"
      >
        <template #default="{ row }: { row: UsageLog }">
          <span
            class="num"
            :class="{ 'cell-muted': row.amount === 0 }"
          >{{ formatPoints(row.amount) }}</span>
        </template>
      </el-table-column>

      <template #empty>
        <EmptyState
          title="没有符合条件的用量"
          description="调整筛选条件或重置后重试。"
        />
      </template>
    </el-table>

    <template #footer>
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        background
      />
    </template>
  </FillListPageLayout>

  <el-drawer
    :model-value="detail !== null"
    title="这一次结算"
    size="720px"
    @close="detail = null"
  >
    <template v-if="detail">
      <el-descriptions
        :column="2"
        size="small"
        border
      >
        <el-descriptions-item label="时间">
          {{ formatDateTime(detail.createdAt, 'YYYY-MM-DD HH:mm:ss') }}
        </el-descriptions-item>
        <el-descriptions-item label="账户 UID">
          <span class="mono">{{ detail.accountUid }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="功能">
          {{ purposeLabel(detail.purpose) }}
        </el-descriptions-item>
        <el-descriptions-item label="实扣">
          <span class="num">{{ formatPoints(detail.amount) }}</span> 积分
          <span
            v-if="detail.status === 'voided'"
            class="cell-sub"
          >（没有产出，冻结整笔退回）</span>
        </el-descriptions-item>
        <el-descriptions-item label="上游">
          {{ detail.upstreamSuccess ? '成功' : '出错（按已经产出的算）' }}
        </el-descriptions-item>
        <el-descriptions-item label="会话">
          <span class="mono">{{ detail.conversationId ?? '—' }}</span>
        </el-descriptions-item>
        <el-descriptions-item
          label="这件事"
          :span="2"
        >
          <span class="mono">{{ detail.actionId }}</span>
        </el-descriptions-item>
        <el-descriptions-item
          v-if="detail.traceId"
          label="Trace"
          :span="2"
        >
          <span class="mono">{{ detail.traceId }}</span>
        </el-descriptions-item>
      </el-descriptions>

      <h4 class="section">
        每条用量（单价是结算当时的，改价不改这里）
      </h4>
      <el-table
        :data="detail.lines"
        size="small"
        class="compact-table"
        :empty-text="'没有用量'"
      >
        <el-table-column
          label="调用"
          min-width="200"
        >
          <template #default="{ row }: { row: UsageLine }">
            <div class="cell-stack">
              <span>{{ usageKindLabel(row.kind) }}<span
                v-if="row.estimated"
                class="cell-sub"
                title="上游没报用量（多半是中途取消），按字数估的"
              >（估）</span></span>
              <span class="cell-sub mono">{{ row.vendorKey }} / {{ row.modelName }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column
          label="用量"
          min-width="190"
        >
          <template #default="{ row }: { row: UsageLine }">
            <span class="num">{{ quantityOf(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column
          label="单价"
          min-width="170"
        >
          <template #default="{ row }: { row: UsageLine }">
            <div class="cell-stack">
              <span
                class="num"
                :class="{ 'cell-warn': row.ratedBy === '-' }"
              >{{ priceOf(row) }}</span>
              <span
                v-if="row.ratedBy !== '-'"
                class="cell-sub mono"
              >{{ row.ratedBy }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column
          label="积分"
          width="100"
          align="right"
        >
          <template #default="{ row }: { row: UsageLine }">
            <span class="num">{{ formatPrice(row.points) }}</span>
          </template>
        </el-table-column>
      </el-table>
      <p class="note">
        逐条加起来取两位小数是应扣的数；账上不够时扣到 0 为止，所以实扣可能比它少。
      </p>
    </template>
  </el-drawer>
</template>

<style scoped>
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 0;
}

.filters :deep(.el-form-item) {
  margin-bottom: 0;
}

.filters__uid {
  width: 160px;
}

.filters__select {
  width: 130px;
}

.clickable-table :deep(.el-table__row) {
  cursor: pointer;
}

.mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}

.num {
  font-variant-numeric: tabular-nums;
}

.cell-stack {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  line-height: 1.35;
}

.cell-muted {
  color: var(--el-text-color-placeholder);
}

.cell-warn {
  color: var(--el-color-warning);
}

.section {
  margin: 20px 0 8px;
  font-size: 13px;
  font-weight: 600;
}

.note {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
