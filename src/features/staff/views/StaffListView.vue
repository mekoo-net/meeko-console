<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { computed, nextTick, onMounted, reactive, ref } from 'vue';

import { confirmDanger } from '@/shared/composables/useConfirm';
import { formatDateTime } from '@/shared/lib/date';
import DataTableShell from '@/shared/ui/DataTableShell.vue';
import { useAuthStore } from '@/stores/auth';

import { useStaffList } from '../composables/useStaffList';
import { useStaffRoles } from '../composables/useStaffRoles';
import type { StaffUser } from '../model/staff.types';
import { staffStatusLabel } from '../model/staff.types';
import { getStaffPort } from '../services';

const auth = useAuthStore();
const canWrite = computed(() => auth.hasPermission('platform.staff.write'));

const list = useStaffList();
const rolesState = useStaffRoles();

const roleOptions = computed(() => rolesState.data.value ?? []);

const drawer = ref(false);
const drawerMode = ref<'create' | 'edit'>('create');
const saving = ref(false);
const editingUid = ref<string | null>(null);

const createForm = reactive({
  username: '',
  email: '',
  displayName: '',
  password: '',
  roleId: '',
});

const editForm = reactive({
  displayName: '',
  email: '',
});

async function loadRoles(): Promise<void> {
  await rolesState.refresh();
}

onMounted(() => {
  void loadRoles();
});

async function openCreate(): Promise<void> {
  drawerMode.value = 'create';
  editingUid.value = null;
  createForm.username = '';
  createForm.email = '';
  createForm.displayName = '';
  createForm.password = '';
  createForm.roleId = roleOptions.value[0]?.id ?? '';
  drawer.value = true;
  await nextTick();
}

function openEdit(row: StaffUser): void {
  drawerMode.value = 'edit';
  editingUid.value = row.uid;
  editForm.displayName = row.displayName;
  editForm.email = row.email;
  drawer.value = true;
}

async function submitDrawer(): Promise<void> {
  saving.value = true;
  try {
    const port = getStaffPort();
    if (drawerMode.value === 'create') {
      const r = await port.createStaff({
        username: createForm.username,
        email: createForm.email,
        displayName: createForm.displayName,
        password: createForm.password,
        roleId: createForm.roleId,
      });
      if (r.success) {
        ElMessage.success('管理员已创建');
        drawer.value = false;
        void list.refresh();
        void loadRoles();
      } else {
        ElMessage.error(r.error.message);
      }
      return;
    }
    const uid = editingUid.value;
    if (!uid) return;
    const r = await port.updateStaff(uid, {
      displayName: editForm.displayName,
      email: editForm.email,
    });
    if (r.success) {
      ElMessage.success('已保存');
      drawer.value = false;
      void list.refresh();
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    saving.value = false;
  }
}

async function toggleStatus(row: StaffUser): Promise<void> {
  const active = row.status !== 'Active';
  const action = active ? '启用' : '停用';
  const ok = await confirmDanger({
    title: `${action}管理员「${row.displayName}」`,
    message: active ? '启用后该账号可再次登录。' : '停用后该账号将无法登录。',
    type: active ? 'warning' : 'danger',
  });
  if (!ok) return;
  const r = await getStaffPort().setStaffStatus(row.uid, active);
  if (r.success) {
    ElMessage.success(`已${action}`);
    void list.refresh();
  } else {
    ElMessage.error(r.error.message);
  }
}

async function resetPassword(row: StaffUser): Promise<void> {
  try {
    const { value } = await ElMessageBox.prompt('请输入新密码（至少 8 位）', `重置「${row.displayName}」密码`, {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputType: 'password',
      inputValidator: (v) => (v && v.length >= 8 ? true : '密码至少 8 位'),
    });
    const r = await getStaffPort().resetStaffPassword(row.uid, value);
    if (r.success) {
      ElMessage.success('密码已重置');
    } else {
      ElMessage.error(r.error.message);
    }
  } catch {
    /* cancelled */
  }
}

const roleDialog = ref(false);
const roleDialogUid = ref<string | null>(null);
const roleDialogRoleId = ref('');

async function changeRole(row: StaffUser): Promise<void> {
  if (roleOptions.value.length === 0) {
    await loadRoles();
  }
  roleDialogUid.value = row.uid;
  roleDialogRoleId.value = row.roleId;
  roleDialog.value = true;
}

async function confirmChangeRole(): Promise<void> {
  const uid = roleDialogUid.value;
  if (!uid) return;
  const r = await getStaffPort().changeStaffRole(uid, roleDialogRoleId.value);
  if (r.success) {
    ElMessage.success('角色已更新');
    roleDialog.value = false;
    void list.refresh();
    void loadRoles();
  } else {
    ElMessage.error(r.error.message);
  }
}
</script>

<template>
  <div class="staff-list page">
    <div class="staff-list__header">
      <div>
        <h3 class="staff-list__title">管理员账号</h3>
        <p class="staff-list__desc">管理平台 Staff 登录账号、角色与启停状态。</p>
      </div>
      <el-button v-if="canWrite" type="primary" @click="openCreate">
        <el-icon class="mr-1"><Plus /></el-icon>
        新建管理员
      </el-button>
    </div>

    <el-form label-width="72px" class="staff-filter" @submit.prevent="list.refresh()">
      <div class="staff-filter__row">
        <el-form-item label="关键词">
          <el-input
            v-model="list.filter.value.keyword"
            clearable
            placeholder="用户名 / 姓名 / 邮箱"
            style="width: 220px"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="list.filter.value.status" style="width: 120px">
            <el-option label="全部" value="all" />
            <el-option label="正常" value="Active" />
            <el-option label="已停用" value="Disabled" />
          </el-select>
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="list.filter.value.roleId" clearable placeholder="全部角色" style="width: 160px">
            <el-option v-for="r in roleOptions" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
        </el-form-item>
        <div class="staff-filter__actions">
          <el-button type="primary" :loading="list.loading.value" @click="list.refresh()">查询</el-button>
          <el-button @click="list.resetFilter()">重置</el-button>
        </div>
      </div>
    </el-form>

    <DataTableShell
      :loading="list.loading.value"
      :error="list.error.value"
      :items="list.items.value"
      empty-title="暂无管理员"
      empty-description="调整筛选条件或新建管理员。"
    >
      <template #toolbar>
        <div class="toolbar__hint">共 {{ list.total.value }} 个管理员</div>
      </template>

      <el-table :data="list.items.value" row-key="uid" stripe>
        <el-table-column prop="username" label="用户名" min-width="120" />
        <el-table-column prop="displayName" label="显示名" min-width="120" />
        <el-table-column prop="email" label="邮箱" min-width="180" />
        <el-table-column prop="roleName" label="角色" width="120" />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === 'Active' ? 'success' : 'info'" size="small">
              {{ staffStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="最近登录" min-width="160">
          <template #default="{ row }">
            {{ row.lastLoginAtUtc ? formatDateTime(row.lastLoginAtUtc) : '—' }}
          </template>
        </el-table-column>
        <el-table-column v-if="canWrite" label="操作" width="260" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button link type="primary" @click="changeRole(row)">改角色</el-button>
            <el-button link type="warning" @click="resetPassword(row)">重置密码</el-button>
            <el-button
              link
              :type="row.status === 'Active' ? 'danger' : 'success'"
              @click="toggleStatus(row)"
            >
              {{ row.status === 'Active' ? '停用' : '启用' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>

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

    <el-drawer
      v-model="drawer"
      :title="drawerMode === 'create' ? '新建管理员' : '编辑管理员'"
      size="420px"
      destroy-on-close
    >
      <el-form v-if="drawerMode === 'create'" label-width="88px" @submit.prevent="submitDrawer">
        <el-form-item label="用户名" required>
          <el-input v-model="createForm.username" autocomplete="off" />
        </el-form-item>
        <el-form-item label="显示名" required>
          <el-input v-model="createForm.displayName" />
        </el-form-item>
        <el-form-item label="邮箱" required>
          <el-input v-model="createForm.email" type="email" />
        </el-form-item>
        <el-form-item label="初始密码" required>
          <el-input v-model="createForm.password" type="password" show-password autocomplete="new-password" />
        </el-form-item>
        <el-form-item label="角色" required>
          <el-select v-model="createForm.roleId" style="width: 100%">
            <el-option v-for="r in roleOptions" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
        </el-form-item>
      </el-form>

      <el-form v-else label-width="88px" @submit.prevent="submitDrawer">
        <el-form-item label="显示名" required>
          <el-input v-model="editForm.displayName" />
        </el-form-item>
        <el-form-item label="邮箱" required>
          <el-input v-model="editForm.email" type="email" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="drawer = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitDrawer">保存</el-button>
      </template>
    </el-drawer>

    <el-dialog v-model="roleDialog" title="修改角色" width="400px">
      <el-select v-model="roleDialogRoleId" style="width: 100%">
        <el-option v-for="r in roleOptions" :key="r.id" :label="r.name" :value="r.id" />
      </el-select>
      <template #footer>
        <el-button @click="roleDialog = false">取消</el-button>
        <el-button type="primary" @click="confirmChangeRole">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.staff-filter {
  background: #fff;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 16px 20px;
  margin-bottom: 14px;
}

.staff-filter__row {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}

.staff-filter :deep(.el-form-item) {
  margin-bottom: 0;
}

.staff-filter__actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
}
.staff-list__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.staff-list__title {
  margin: 0 0 4px;
  font-size: 18px;
  font-weight: 600;
}

.staff-list__desc {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.toolbar__hint {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.mr-1 {
  margin-right: 4px;
}
</style>
