<script setup lang="ts">
/**
 * Jastalk 用量明细：一件事一行（用户聊了一句、角色主动找上门、群聊里回了一轮、发了一条朋友圈……），积分是这件事实扣的。
 * 点一行看扣积分的依据：每一次调用「用量 × 单价 = 积分」和单价的来历。
 *
 * 列表只摆查账用得上的：什么时候、谁、做了什么、用的哪个模型、扣了多少。不摆调用链、不摆会话
 * （2026-11-21 用户：「调用链 不用展示 我看到这个 有鸡毛用啊 会话有鸡毛用吗？」）。
 */
import { onMounted, ref } from 'vue';

import PageHeader from '@/shared/ui/PageHeader.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import FillListPageLayout from '@/shared/ui/FillListPageLayout.vue';
import { fail } from '@/shared/api/httpTypes';
import { formatDateTime } from '@/shared/lib/date';

import UsageActionDrawer from '../components/UsageActionDrawer.vue';
import { usePagedList } from '../composables/usePagedList';
import type { UsageStatus } from '../model/jastalk.types';
import { formatPoints, parseAccountUid, purposeLabel, purposeLabels } from '../model/jastalkFormat';
import { mainCall, type UsageAction } from '../model/usageActions';
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

const { items, total, page, pageSize, loading, load, reload } = usePagedList<UsageAction>((p) => {
  const uid = parseAccountUid(filter.value.uid);
  if (!uid.ok) return Promise.resolve(fail({ code: 'validation', message: '账户 UID 只能是数字' }));
  const [from, to] = filter.value.range ?? [];
  return port.usageActions(
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

/** 列表里写哪个模型：对话那一步的。 */
function mainModel(action: UsageAction): string {
  const call = mainCall(action);
  return call ? `${call.line.vendorKey} / ${call.line.modelName}` : '—';
}

const detailOpen = ref(false);
const detail = ref<UsageAction | null>(null);

function open(action: UsageAction): void {
  detail.value = action;
  detailOpen.value = true;
}

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
      row-key="actionId"
      size="small"
      class="compact-table clickable-table"
      height="100%"
      :empty-text="' '"
      @row-click="open"
    >
      <el-table-column
        label="时间"
        width="172"
      >
        <template #default="{ row }: { row: UsageAction }">
          <span class="num">{{ formatDateTime(row.at, 'YYYY-MM-DD HH:mm:ss') }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="账户"
        width="120"
      >
        <template #default="{ row }: { row: UsageAction }">
          <span class="mono">{{ row.accountUid }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="功能"
        width="96"
      >
        <template #default="{ row }: { row: UsageAction }">
          {{ purposeLabel(row.purpose) }}
        </template>
      </el-table-column>
      <el-table-column
        label="模型"
        min-width="240"
      >
        <template #default="{ row }: { row: UsageAction }">
          <span class="mono">{{ mainModel(row) }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="积分"
        width="110"
        align="right"
      >
        <template #default="{ row }: { row: UsageAction }">
          <span
            v-if="row.status === 'charged'"
            class="num points"
          >{{ formatPoints(row.amount) }}</span>
          <span
            v-else
            class="cell-muted"
          >未扣</span>
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

  <UsageActionDrawer
    v-model="detailOpen"
    :action="detail"
  />
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

.mono,
.num {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
}

.cell-stack {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  line-height: 1.35;
}

.cell-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.cell-muted {
  color: var(--el-text-color-placeholder);
}

.points {
  font-weight: 600;
}
</style>
