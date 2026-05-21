<script setup lang="ts">
import { computed, toRef, unref } from 'vue';

import DataTableShell from '@/shared/ui/DataTableShell.vue';
import MoneyText from '@/shared/ui/MoneyText.vue';
import StatusTag from '@/shared/ui/StatusTag.vue';
import { formatDateTime } from '@/shared/lib/date';

import { InvoiceKindLabel, InvoiceStatusLabel, InvoiceStatusTone } from '../model/billingEnums';
import type { InvoiceKind, InvoiceStatus } from '../model/billingEnums';
import { useInvoiceList } from '../composables/useInvoiceList';

const props = defineProps<{ accountUid: string | null }>();

const uidRef = toRef(props, 'accountUid');
const inv = useInvoiceList(uidRef);

const loading = computed(() => unref(inv.loading));
const error = computed(() => unref(inv.error));
const rows = computed(() => inv.items.value?.items ?? []);

const kindFilter = computed({
  get: () => inv.filter.value.kind,
  set: (v) => {
    inv.filter.value.kind = v;
  },
});

const fromUtcFilter = computed({
  get: () => inv.filter.value.fromUtc,
  set: (v) => {
    inv.filter.value.fromUtc = v;
  },
});

const toUtcFilter = computed({
  get: () => inv.filter.value.toUtc,
  set: (v) => {
    inv.filter.value.toUtc = v;
  },
});
function kindLabel(k: InvoiceKind): string {
  return InvoiceKindLabel[k];
}

function statusLabel(s: InvoiceStatus): string {
  return InvoiceStatusLabel[s];
}

function statusTone(s: InvoiceStatus): 'success' | 'info' | 'warning' | 'danger' | 'primary' {
  return InvoiceStatusTone[s];
}
</script>

<template>
  <DataTableShell
    :loading="loading"
    :error="error"
    :items="rows"
    empty-title="暂无发票"
  >
    <template #filter>
      <div class="inv-filter">
        <el-select v-model="kindFilter" style="width: 140px" @change="inv.refresh">
          <el-option label="全部类型" value="all" />
          <el-option v-for="k in [0, 1, 2] as const" :key="k" :label="InvoiceKindLabel[k]" :value="k" />
        </el-select>
        <el-date-picker
          v-model="fromUtcFilter"
          type="datetime"
          placeholder="开始时间 UTC"
          value-format="YYYY-MM-DDTHH:mm:ss.SSS[Z]"
          @change="inv.refresh"
        />
        <el-date-picker
          v-model="toUtcFilter"
          type="datetime"
          placeholder="结束时间 UTC"
          value-format="YYYY-MM-DDTHH:mm:ss.SSS[Z]"
          @change="inv.refresh"
        />
      </div>
    </template>
    <template #toolbar>
      <el-button :disabled="!accountUid" @click="inv.refresh">刷新</el-button>
    </template>

    <el-table :data="rows" stripe style="width: 100%">
      <el-table-column prop="id" label="发票 ID" min-width="140" />
      <el-table-column label="类型" width="120">
        <template #default="{ row }">{{ kindLabel(row.kind) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="120">
        <template #default="{ row }">
          <StatusTag :label="statusLabel(row.status)" :tone="statusTone(row.status)" />
        </template>
      </el-table-column>
      <el-table-column label="合计" width="140">
        <template #default="{ row }">
          <MoneyText :value="row.total" :options="{ currency: row.currency }" />
        </template>
      </el-table-column>
      <el-table-column label="开具时间">
        <template #default="{ row }">{{ formatDateTime(row.issuedAtUtc) }}</template>
      </el-table-column>
      <el-table-column label="支付时间">
        <template #default="{ row }">{{ formatDateTime(row.paidAtUtc) }}</template>
      </el-table-column>
    </el-table>

    <template #pagination>
      <el-pagination
        background
        layout="prev, pager, next, sizes, total"
        :total="inv.pagination.state.total"
        :page-size="inv.pagination.state.pageSize"
        :current-page="inv.pagination.state.page"
        :page-sizes="inv.pagination.pageSizes"
        @current-change="inv.pagination.setPage"
        @size-change="inv.pagination.setPageSize"
      />
    </template>
  </DataTableShell>
</template>

<style scoped>
.inv-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}
</style>
