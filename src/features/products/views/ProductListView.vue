<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Refresh, Search } from '@element-plus/icons-vue';

import PageHeader from '@/shared/ui/PageHeader.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import FillListPageLayout from '@/shared/ui/FillListPageLayout.vue';
import { clientPaginate, usePagination } from '@/shared/composables/usePagination';
import { formatDateTime } from '@/shared/lib/date';
import ProductFormDialog from '../components/ProductFormDialog.vue';
import ProductDiscoveryDialog from '../components/ProductDiscoveryDialog.vue';
import type { BillingProduct, UpdateProductInput } from '../model/product.types';
import { getProductPort } from '../services';

const port = getProductPort();
const products = ref<BillingProduct[]>([]);
const pagination = usePagination({ pageSize: 20 });
const displayProducts = computed(() =>
  clientPaginate(products.value, pagination.state.page, pagination.state.pageSize),
);
const loading = ref(false);
const unregisteringCode = ref<string | null>(null);

const editVisible = ref(false);
const discoveryVisible = ref(false);
const editing = ref<BillingProduct | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const r = await port.list();
    if (r.success) {
      products.value = r.data;
      pagination.setTotal(r.data.length);
    } else ElMessage.error(r.error.message);
  } finally {
    loading.value = false;
  }
}

function openDiscovery(): void {
  discoveryVisible.value = true;
}

function openEdit(row: BillingProduct): void {
  editing.value = row;
  editVisible.value = true;
}

async function onSubmit(payload: UpdateProductInput): Promise<void> {
  if (!editing.value) return;
  const r = await port.update(editing.value.code, payload);
  if (r.success) {
    ElMessage.success('产品已更新');
    editVisible.value = false;
    await load();
  } else {
    ElMessage.error(r.error.message);
  }
}

async function unregister(row: BillingProduct): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定从平台卸载产品「${row.displayName}」？卸载后该产品将不再参与计费校验。`,
      '卸载产品',
      { type: 'warning', confirmButtonText: '卸载', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }

  unregisteringCode.value = row.code;
  try {
    const r = await port.unregister(row.code);
    if (r.success) {
      ElMessage.success(`产品「${row.displayName}」已卸载`);
      await load();
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    unregisteringCode.value = null;
  }
}

onMounted(() => load());
</script>

<template>
  <FillListPageLayout>
    <template #header>
      <PageHeader
        title="计费产品"
        description="从 Consul 发现业务产品并注册到平台。ProductCode 贯穿下单/用量/冻结。"
      >
        <template #actions>
          <el-button :icon="Refresh" plain @click="load">刷新</el-button>
          <el-button type="primary" :icon="Search" @click="openDiscovery">发现产品</el-button>
        </template>
      </PageHeader>
    </template>

    <el-table
      v-loading="loading"
      :data="displayProducts"
      row-key="code"
      size="small"
      class="compact-table"
      height="100%"
      :empty-text="' '"
    >
      <el-table-column label="产品" min-width="220">
        <template #default="{ row }: { row: BillingProduct }">
          <div class="cell-product">
            <span class="cell-product__name">{{ row.displayName }}</span>
            <span class="cell-product__code">{{ row.code }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="更新时间" width="170">
        <template #default="{ row }: { row: BillingProduct }">
          {{ formatDateTime(row.updatedAtUtc) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }: { row: BillingProduct }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button
            link
            type="danger"
            :loading="unregisteringCode === row.code"
            @click="unregister(row)"
          >
            卸载
          </el-button>
        </template>
      </el-table-column>

      <template #empty>
        <EmptyState
          title="暂无已注册产品"
          description="点击「发现产品」从 Consul 读取业务服务声明的产品并注册到平台。"
        />
      </template>
    </el-table>

    <template #footer>
      <el-pagination
        v-model:current-page="pagination.state.page"
        v-model:page-size="pagination.state.pageSize"
        :total="pagination.state.total"
        :page-sizes="pagination.pageSizes"
        layout="total, sizes, prev, pager, next"
        background
      />
    </template>
  </FillListPageLayout>

  <ProductDiscoveryDialog v-model="discoveryVisible" @registered="load" />

  <ProductFormDialog v-model="editVisible" :product="editing" @submit="onSubmit" />
</template>

<style scoped>
.cell-product {
  display: flex;
  flex-direction: column;
  line-height: 1.35;
}
.cell-product__name {
  font-weight: 500;
}
.cell-product__code {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}
</style>
