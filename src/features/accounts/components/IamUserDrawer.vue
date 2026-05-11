<script setup lang="ts">
import { computed, ref, toRef } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus, Refresh, Search } from '@element-plus/icons-vue';

import StatusTag from '@/shared/ui/StatusTag.vue';
import DataTableShell from '@/shared/ui/DataTableShell.vue';

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

const props = defineProps<{ visible: boolean; accountUid: string; accountName: string }>();
const emit = defineEmits<{ (e: 'update:visible', v: boolean): void }>();

const accountUidRef = toRef(props, 'accountUid');
const list = useIamUserList(accountUidRef);

const createOpen = ref(false);

const visibleProxy = computed({
  get: () => props.visible,
  set: (v) => emit('update:visible', v),
});

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
  <el-drawer
    v-model="visibleProxy"
    direction="rtl"
    size="780px"
    :destroy-on-close="true"
    :before-close="(done: () => void) => { createOpen = false; done(); }"
  >
    <template #header>
      <div class="drawer-header">
        <h3 class="drawer-header__title">{{ accountName }} · 子账号</h3>
        <span class="drawer-header__sub">AccountUid {{ accountUid }}</span>
      </div>
    </template>

    <DataTableShell
      :loading="list.loading.value"
      :error="list.error.value"
      :items="list.items.value"
      empty-title="该账户暂无子账号"
      empty-description="点击右上角“创建子账号”新增。"
    >
      <template #filter>
        <div class="iam-filter">
          <el-input
            v-model="list.filter.value.keyword"
            :prefix-icon="Search"
            placeholder="搜索 username / displayName / email"
            clearable
            style="max-width: 280px"
          />
          <el-select v-model="list.filter.value.role" style="width: 130px">
            <el-option label="全部角色" value="all" />
            <el-option v-for="r in iamUserRoleValues" :key="r" :label="r" :value="r" />
          </el-select>
          <el-select v-model="list.filter.value.status" style="width: 130px">
            <el-option label="全部状态" value="all" />
            <el-option
              v-for="s in iamUserStatusValues"
              :key="s"
              :label="iamUserStatusLabel[s]"
              :value="s"
            />
          </el-select>
        </div>
      </template>

      <template #toolbar>
        <div class="drawer-toolbar">
          <el-button :icon="Refresh" :loading="list.loading.value" @click="list.refresh()">刷新</el-button>
          <el-button type="primary" :icon="Plus" @click="createOpen = true">创建子账号</el-button>
        </div>
      </template>

      <el-table :data="list.items.value" border>
        <el-table-column label="用户名" min-width="160">
          <template #default="{ row }: { row: IamUser }">
            <div class="cell-user">
              <span class="cell-user__name">{{ row.username }}</span>
              <span v-if="row.isAccountOwner" class="cell-user__owner">Owner</span>
            </div>
            <div class="cell-user__display">{{ row.displayName }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="email" label="邮箱" min-width="180">
          <template #default="{ row }: { row: IamUser }">
            <span>{{ row.email ?? '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="role" label="角色" width="120">
          <template #default="{ row }: { row: IamUser }">
            <el-tag effect="plain">{{ row.role }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="120">
          <template #default="{ row }: { row: IamUser }">
            <StatusTag :label="iamUserStatusLabel[row.status]" :tone="iamUserStatusTone[row.status]" />
          </template>
        </el-table-column>
      </el-table>
    </DataTableShell>

    <el-dialog v-model="createOpen" title="创建子账号" width="520px" destroy-on-close>
      <IamUserForm :submitting="list.creating.value" @submit="onSubmit" @cancel="createOpen = false" />
    </el-dialog>
  </el-drawer>
</template>

<style scoped>
.drawer-header__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.drawer-header__sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.iam-filter {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.drawer-toolbar {
  width: 100%;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
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
}
</style>
