<script setup lang="ts">
import { ElMessage } from 'element-plus';
import { computed, reactive, ref, toRef, unref } from 'vue';

import DataTableShell from '@/shared/ui/DataTableShell.vue';
import MoneyText from '@/shared/ui/MoneyText.vue';
import StatusTag from '@/shared/ui/StatusTag.vue';
import { formatDateTime } from '@/shared/lib/date';

import { OrderStatusLabel, OrderStatusTone } from '../model/billingEnums';
import type { OrderStatus } from '../model/billingEnums';
import { useOrderList } from '../composables/useOrderList';
import { getBillingPort } from '../services';

const props = defineProps<{ accountUid: string | null }>();

const uidRef = toRef(props, 'accountUid');
const orders = useOrderList(uidRef);

const loading = computed(() => unref(orders.loading));
const error = computed(() => unref(orders.error));
const orderRows = computed(() => orders.items.value?.items ?? []);

const orderStatusFilter = computed({
  get: () => orders.filter.value.status,
  set: (v) => {
    orders.filter.value.status = v;
  },
});

const placeForm = reactive({
  productCode: 'demo-product',
  quantity: 1,
});

const placing = ref(false);

async function placeOrder(): Promise<void> {
  const uid = props.accountUid;
  if (!uid) return;
  placing.value = true;
  try {
    const r = await getBillingPort().placeOrder(uid, {
      productCode: placeForm.productCode.trim() || 'demo-product',
      quantity: placeForm.quantity,
    });
    if (r.success) {
      ElMessage.success('下单成功（Mock）');
      void orders.refresh();
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    placing.value = false;
  }
}

function statusLabel(s: OrderStatus): string {
  return OrderStatusLabel[s];
}

function statusTone(s: OrderStatus): 'success' | 'info' | 'warning' | 'danger' | 'primary' {
  return OrderStatusTone[s];
}
</script>

<template>
  <DataTableShell
    :loading="loading"
    :error="error"
    :items="orderRows"
    empty-title="暂无订单"
  >
    <template #filter>
      <el-select v-model="orderStatusFilter" style="width: 160px" @change="orders.refresh">
        <el-option label="全部状态" value="all" />
        <el-option v-for="s in [0, 1, 2, 3, 4, 5, 6] as const" :key="s" :label="OrderStatusLabel[s]" :value="s" />
      </el-select>
    </template>

    <template #toolbar>
      <div class="orders-toolbar">
        <el-input v-model="placeForm.productCode" placeholder="商品编码" style="width: 180px" />
        <el-input-number v-model="placeForm.quantity" :min="1" />
        <el-button type="primary" :loading="placing" :disabled="!accountUid" @click="placeOrder">
          模拟下单
        </el-button>
        <el-button :disabled="!accountUid" @click="orders.refresh">刷新</el-button>
      </div>
    </template>

    <el-table :data="orderRows" stripe style="width: 100%">
      <el-table-column prop="uid" label="订单 UID" min-width="140" />
      <el-table-column prop="productCode" label="商品" min-width="120" />
      <el-table-column label="状态" width="120">
        <template #default="{ row }">
          <StatusTag :label="statusLabel(row.status)" :tone="statusTone(row.status)" />
        </template>
      </el-table-column>
      <el-table-column label="单价" width="120">
        <template #default="{ row }">
          <MoneyText :value="row.unitPriceSnapshot" />
        </template>
      </el-table-column>
      <el-table-column prop="quantity" label="数量" width="88" />
      <el-table-column label="创建时间">
        <template #default="{ row }">{{ formatDateTime(row.createdAtUtc) }}</template>
      </el-table-column>
    </el-table>

    <template #pagination>
      <el-pagination
        background
        layout="prev, pager, next, sizes, total"
        :total="orders.pagination.state.total"
        :page-size="orders.pagination.state.pageSize"
        :current-page="orders.pagination.state.page"
        :page-sizes="orders.pagination.pageSizes"
        @current-change="orders.pagination.setPage"
        @size-change="orders.pagination.setPageSize"
      />
    </template>
  </DataTableShell>
</template>

<style scoped>
.orders-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
</style>
