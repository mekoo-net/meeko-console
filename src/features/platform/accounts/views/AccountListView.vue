<script setup lang="ts">
import EmptyState from '@/shared/ui/EmptyState.vue';
import FillListPageLayout from '@/shared/ui/FillListPageLayout.vue';
import PageHeader from '@/shared/ui/PageHeader.vue';

import AccountFilterBar from '../components/AccountFilterBar.vue';
import AccountTable from '../components/AccountTable.vue';
import { useAccountList } from '../composables/useAccountList';

const list = useAccountList();
</script>

<template>
  <FillListPageLayout>
    <template #header>
      <PageHeader title="账户列表" description="Account 是数据归属与计费单位。详情页可查看 / 新增子账号。" />
    </template>

    <template #filters>
      <AccountFilterBar
        v-model="list.filter.value"
        :loading="list.loading.value"
        @refresh="list.refresh()"
        @reset="list.resetFilter()"
      />

      <el-alert
        v-if="list.error.value"
        :title="`加载失败：${list.error.value.code}`"
        :description="list.error.value.message"
        type="error"
        show-icon
        :closable="false"
      />
    </template>

    <AccountTable :items="list.items.value" :loading="list.loading.value">
      <template #empty>
        <EmptyState
          title="未找到匹配的账户"
          description="调整筛选条件或重置后重试。"
        />
      </template>
    </AccountTable>

    <template #footer>
      <el-pagination
        v-model:current-page="list.pagination.state.page"
        v-model:page-size="list.pagination.state.pageSize"
        :total="list.pagination.state.total"
        :page-sizes="list.pagination.pageSizes"
        layout="total, sizes, prev, pager, next"
        background
      />
    </template>
  </FillListPageLayout>
</template>
