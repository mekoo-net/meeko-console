<script setup lang="ts">
import { ref, toRef } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus, RefreshLeft, Search } from '@element-plus/icons-vue';

import StatusTag from '@/shared/ui/StatusTag.vue';

import {
  iamUserRoleValues,
  iamUserStatusLabel,
  iamUserStatusTone,
  iamUserStatusValues,
  type IamUser,
} from '../model/iamUser.types';
import type { CreateIamUserPayload } from '../model/validators';
import { useIamUserList } from '../composables/useIamUserList';
import IamUserForm from './IamUserForm.vue';

const props = defineProps<{ accountUid: string }>();

const accountUidRef = toRef(props, 'accountUid');
const list = useIamUserList(accountUidRef);

const createOpen = ref(false);

function resetFilter(): void {
  list.filter.value = { keyword: '', role: 'all', status: 'all' };
}

async function onSubmit(payload: CreateIamUserPayload): Promise<void> {
  const result = await list.createIamUser(payload);
  if (result?.success) {
    ElMessage.success(`子账号 ${result.data.username} 创建成功`);
    createOpen.value = false;
  } else if (result) {
    ElMessage.error(result.error.message);
  }
}
</script>

<template>
  <div class="iam-tab">
    <div class="tab-filter">
      <el-form :inline="true" @submit.prevent>
        <el-form-item label="关键字">
          <el-input
            v-model="list.filter.value.keyword"
            :prefix-icon="Search"
            placeholder="username / displayName / email"
            clearable
            style="width: 220px"
          />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="list.filter.value.role" style="width: 160px">
            <el-option label="全部角色" value="all" />
            <el-option v-for="r in iamUserRoleValues" :key="r" :label="r" :value="r" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="list.filter.value.status" style="width: 160px">
            <el-option label="全部状态" value="all" />
            <el-option
              v-for="s in iamUserStatusValues"
              :key="s"
              :label="iamUserStatusLabel[s]"
              :value="s"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <div class="tab-filter__actions">
        <el-button type="primary" :icon="Plus" @click="createOpen = true">创建子账号</el-button>
        <el-button :icon="RefreshLeft" @click="resetFilter()">重置</el-button>
      </div>
    </div>

    <el-table
      v-loading="list.loading.value"
      :data="list.items.value"
      row-key="uid"
      size="small"
      class="compact-table"
      empty-text="该账户暂无子账号"
    >
      <el-table-column label="用户名" min-width="180">
        <template #default="{ row }: { row: IamUser }">
          <div class="cell-user">
            <span class="cell-user__name">{{ row.username }}</span>
            <span v-if="row.isAccountOwner" class="cell-user__owner">Owner</span>
          </div>
          <div class="cell-user__display">{{ row.displayName }}</div>
        </template>
      </el-table-column>
      <el-table-column label="邮箱" min-width="200">
        <template #default="{ row }: { row: IamUser }">
          <span v-if="row.email">{{ row.email }}</span>
          <span v-else class="cell-muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="角色" width="120">
        <template #default="{ row }: { row: IamUser }">
          <el-tag effect="plain" size="small">{{ row.role }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }: { row: IamUser }">
          <StatusTag :label="iamUserStatusLabel[row.status]" :tone="iamUserStatusTone[row.status]" />
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="createOpen" title="创建子账号" width="520px" destroy-on-close>
      <IamUserForm :submitting="list.creating.value" @submit="onSubmit" @cancel="createOpen = false" />
    </el-dialog>
  </div>
</template>

<style scoped>
.iam-tab {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.tab-filter {
  display: flex;
  align-items: center;
  background: #fff;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 14px 18px;
}
.tab-filter :deep(.el-form) {
  flex: 1;
}
.tab-filter :deep(.el-form-item) {
  margin: 0 16px 0 0;
}
.tab-filter :deep(.el-form-item__label) {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-regular);
}
.tab-filter__actions {
  display: flex;
  gap: 10px;
  margin-left: auto;
}
.cell-user {
  display: flex;
  align-items: center;
  gap: 6px;
}
.cell-user__name {
  font-weight: 600;
}
.cell-user__owner {
  font-size: 11px;
  color: #b45309;
  background: #fef3c7;
  padding: 0 6px;
  border-radius: 4px;
}
.cell-user__display {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
</style>
