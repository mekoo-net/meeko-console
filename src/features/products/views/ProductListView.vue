<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus, Refresh } from '@element-plus/icons-vue';

import PageHeader from '@/shared/ui/PageHeader.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import { formatDateTime } from '@/shared/lib/date';
import ProductFormDialog from '../components/ProductFormDialog.vue';
import type {
  BillingProduct,
  RegisterProductInput,
  UpdateProductInput,
} from '../model/product.types';
import { getProductPort } from '../services';

const port = getProductPort();
const products = ref<BillingProduct[]>([]);
const loading = ref(false);
const includeInactive = ref(false);
const togglingCode = ref<string | null>(null);

const dialogVisible = ref(false);
const dialogMode = ref<'create' | 'edit'>('create');
const editing = ref<BillingProduct | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const r = await port.list(includeInactive.value);
    if (r.success) products.value = r.data;
    else ElMessage.error(r.error.message);
  } finally {
    loading.value = false;
  }
}

function openCreate(): void {
  dialogMode.value = 'create';
  editing.value = null;
  dialogVisible.value = true;
}

function openEdit(row: BillingProduct): void {
  dialogMode.value = 'edit';
  editing.value = row;
  dialogVisible.value = true;
}

async function onSubmit(payload: RegisterProductInput | UpdateProductInput): Promise<void> {
  if (dialogMode.value === 'create') {
    const r = await port.register(payload as RegisterProductInput);
    if (r.success) {
      ElMessage.success('产品已注册');
      dialogVisible.value = false;
      await load();
    } else {
      ElMessage.error(r.error.message);
    }
    return;
  }

  if (!editing.value) return;
  const r = await port.update(editing.value.code, payload as UpdateProductInput);
  if (r.success) {
    ElMessage.success('产品已更新');
    dialogVisible.value = false;
    await load();
  } else {
    ElMessage.error(r.error.message);
  }
}

async function toggleActive(row: BillingProduct): Promise<void> {
  togglingCode.value = row.code;
  try {
    const r = await port.setActive(row.code, !row.active);
    if (r.success) {
      ElMessage.success(`产品「${row.displayName}」已${r.data.active ? '启用' : '停用'}`);
      await load();
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    togglingCode.value = null;
  }
}

onMounted(() => load());
</script>

<template>
  <section v-loading="loading">
    <PageHeader
      title="计费产品"
      description="维护 billing.products 注册表。ProductCode 贯穿下单/用量/冻结；Domain 作为充值返利归属轴。"
    >
      <template #actions>
        <el-checkbox v-model="includeInactive" @change="load">显示已停用</el-checkbox>
        <el-button :icon="Refresh" plain @click="load">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">注册产品</el-button>
      </template>
    </PageHeader>

    <el-table v-if="products.length" :data="products" size="small" class="compact-table">
      <el-table-column label="产品" min-width="220">
        <template #default="{ row }: { row: BillingProduct }">
          <div class="cell-product">
            <span class="cell-product__name">{{ row.displayName }}</span>
            <span class="cell-product__code">{{ row.code }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="domain" label="业务域" width="120" />
      <el-table-column label="状态" width="90" align="center">
        <template #default="{ row }: { row: BillingProduct }">
          <el-tag :type="row.active ? 'success' : 'info'" size="small">
            {{ row.active ? '启用' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="更新时间" width="170">
        <template #default="{ row }: { row: BillingProduct }">
          {{ formatDateTime(row.updatedAtUtc) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }: { row: BillingProduct }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button
            link
            :type="row.active ? 'warning' : 'success'"
            :loading="togglingCode === row.code"
            @click="toggleActive(row)"
          >
            {{ row.active ? '停用' : '启用' }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <EmptyState v-else title="暂无计费产品" description="请先注册业务产品，严格校验模式下未注册产品无法入账。" />

    <ProductFormDialog
      v-model="dialogVisible"
      :mode="dialogMode"
      :product="editing"
      @submit="onSubmit"
    />
  </section>
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
