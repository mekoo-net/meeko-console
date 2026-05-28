<script setup lang="ts">
import DataTableShell from '@/shared/ui/DataTableShell.vue';
import PageHeader from '@/shared/ui/PageHeader.vue';

import AccountFilterBar from '../components/AccountFilterBar.vue';
import AccountTable from '../components/AccountTable.vue';
import { useAccountList } from '../composables/useAccountList';

const list = useAccountList();
</script>

<template>
  <div class="page">
    <PageHeader title="账户列表" description="Account 是数据归属与计费单位。详情页可查看 / 新增子账号。" />

    <AccountFilterBar
      v-model="list.filter.value"
      :loading="list.loading.value"
      @refresh="list.refresh()"
      @reset="list.resetFilter()"
    />

    <DataTableShell
      :loading="list.loading.value"
      :error="list.error.value"
      :items="list.items.value"
      empty-title="未找到匹配的账户"
      empty-description="调整筛选条件或重置后重试。"
    >
      <template #toolbar>
        <div class="toolbar__hint">共 {{ list.total.value }} 个账户</div>
      </template>

      <AccountTable :items="list.items.value" />

      <template #pagination>
        <el-pagination
          v-model:current-page="list.pagination.state.page"
          v-model:page-size="list.pagination.state.pageSize"
          :total="list.pagination.state.total"
          :page-sizes="list.pagination.pageSizes"
          layout="total, sizes, prev, pager, next"
          background
        />
      </template>
    </DataTableShell>
  </div>
</template>

<style scoped>
.toolbar__hint {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
</style>
