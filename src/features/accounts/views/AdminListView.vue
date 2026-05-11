<script setup lang="ts">
import { Search, Refresh } from '@element-plus/icons-vue';
import { useRouter } from 'vue-router';

import PageHeader from '@/shared/ui/PageHeader.vue';
import StatusTag from '@/shared/ui/StatusTag.vue';

import {
  iamUserRoleValues,
  iamUserStatusLabel,
  iamUserStatusTone,
  iamUserStatusValues,
  type IamUser,
} from '../model/iamUser.types';
import { accountTypeLabel } from '../model/account.types';
import { useCrossAccountIamList, type IamUserRow } from '../composables/useCrossAccountIamList';

const router = useRouter();
const list = useCrossAccountIamList();

const roleTagType: Record<string, 'danger' | 'warning' | 'info'> = {
  Owner: 'warning',
  Admin: 'danger',
  Member: 'info',
};

function goAccount(uid: string): void {
  void router.push(`/accounts/${uid}`);
}
</script>

<template>
  <div class="page">
    <PageHeader
      title="访问控制 · IAM 用户"
      description="平台所有账户下的 IAM 用户，可按角色筛选查看管理员分布。"
    >
      <template #actions>
        <el-button :icon="Refresh" :loading="list.loading.value" @click="list.refresh()">刷新</el-button>
      </template>
    </PageHeader>

    <!-- 统计卡 -->
    <div class="stat-row">
      <el-card shadow="never" class="stat-card">
        <div class="stat-card__num">{{ list.adminCount.value }}</div>
        <div class="stat-card__label">Admin 数量</div>
      </el-card>
      <el-card shadow="never" class="stat-card">
        <div class="stat-card__num">{{ list.ownerCount.value }}</div>
        <div class="stat-card__label">Owner 数量</div>
      </el-card>
      <el-card shadow="never" class="stat-card">
        <div class="stat-card__num">{{ list.total.value }}</div>
        <div class="stat-card__label">当前筛选结果</div>
      </el-card>
    </div>

    <!-- 筛选栏 -->
    <div class="filter-bar">
      <el-input
        v-model="list.filter.value.keyword"
        :prefix-icon="Search"
        placeholder="搜索用户名 / 邮箱 / 所属账户"
        clearable
        style="max-width: 300px"
      />
      <el-select v-model="list.filter.value.role" style="width: 140px">
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
      <el-button plain @click="list.resetFilter()">重置</el-button>
    </div>

    <!-- 错误提示 -->
    <el-alert
      v-if="list.error.value"
      type="error"
      :title="`加载失败：${list.error.value.code}`"
      :description="list.error.value.message"
      show-icon
      :closable="false"
      style="margin-bottom: 12px"
    />

    <!-- 表格 -->
    <el-table
      v-loading="list.loading.value"
      :data="list.items.value"
      border
      stripe
      row-key="uid"
      class="iam-table"
    >
      <el-table-column label="IAM 用户" min-width="200">
        <template #default="{ row }: { row: IamUserRow }">
          <div class="cell-user">
            <span class="cell-user__name">{{ row.username }}</span>
            <el-tag v-if="row.isAccountOwner" size="small" type="warning" effect="plain">Owner</el-tag>
          </div>
          <div class="cell-user__display">{{ row.displayName }}</div>
        </template>
      </el-table-column>

      <el-table-column label="邮箱" min-width="200">
        <template #default="{ row }: { row: IamUser }">
          <span class="cell-email">{{ row.email ?? '—' }}</span>
        </template>
      </el-table-column>

      <el-table-column label="角色" width="110">
        <template #default="{ row }: { row: IamUserRow }">
          <el-tag :type="roleTagType[row.role] ?? 'info'" effect="light">{{ row.role }}</el-tag>
        </template>
      </el-table-column>

      <el-table-column label="状态" width="110">
        <template #default="{ row }: { row: IamUserRow }">
          <StatusTag :label="iamUserStatusLabel[row.status]" :tone="iamUserStatusTone[row.status]" />
        </template>
      </el-table-column>

      <el-table-column label="所属账户" min-width="200">
        <template #default="{ row }: { row: IamUserRow }">
          <div class="cell-account">
            <span class="cell-account__name">{{ row.accountName }}</span>
            <el-tag
              size="small"
              :type="row.accountType === 'organization' ? 'primary' : 'info'"
              effect="light"
            >{{ accountTypeLabel[row.accountType] }}</el-tag>
          </div>
          <div class="cell-account__slug">{{ row.accountSlug }}</div>
        </template>
      </el-table-column>

      <el-table-column label="操作" width="110" fixed="right" align="right">
        <template #default="{ row }: { row: IamUserRow }">
          <el-button link type="primary" @click="goAccount(row.accountUid)">查看账户</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div v-if="!list.loading.value && list.items.value.length === 0" class="empty-hint">
      未找到匹配的 IAM 用户
    </div>
  </div>
</template>

<style scoped>
.stat-row {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}
.stat-card {
  flex: 1;
  border-radius: 10px;
  text-align: center;
}
.stat-card__num {
  font-size: 28px;
  font-weight: 700;
  color: var(--el-color-primary);
  line-height: 1.2;
}
.stat-card__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}
.filter-bar {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}
.iam-table :deep(th.el-table__cell) {
  background: #f8fafc;
}
.cell-user {
  display: flex;
  align-items: center;
  gap: 6px;
}
.cell-user__name {
  font-weight: 600;
}
.cell-user__display {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
.cell-email {
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.cell-account {
  display: flex;
  align-items: center;
  gap: 6px;
}
.cell-account__name {
  font-weight: 500;
}
.cell-account__slug {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
.empty-hint {
  text-align: center;
  padding: 40px 0;
  color: var(--el-text-color-placeholder);
  font-size: 14px;
}
</style>
