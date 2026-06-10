<script setup lang="ts">
import { ElMessage } from 'element-plus';
import { Plus, Refresh } from '@element-plus/icons-vue';
import { computed, nextTick, reactive, ref } from 'vue';

import EmptyState from '@/shared/ui/EmptyState.vue';
import { confirmDanger } from '@/shared/composables/useConfirm';
import { formatDateTime } from '@/shared/lib/date';
import { useAuthStore } from '@/stores/auth';

import { useStaffRoleList } from '../composables/useStaffRoleList';
import {
  PERMISSION_GROUPS,
  type StaffRoleListItem,
} from '../model/staff.types';
import { getStaffPort } from '../services';

const auth = useAuthStore();
const canWrite = computed(() => auth.hasPermission('platform.role.write'));

const list = useStaffRoleList();
const rows = computed(() => list.items.value);
const loading = computed(() => list.loading.value);

const drawer = ref(false);
const drawerMode = ref<'create' | 'edit'>('create');
const saving = ref(false);
const loadingDetail = ref(false);
const editingId = ref<string | null>(null);
const editingIsSystem = ref(false);

const form = reactive({
  name: '',
  description: '',
  permissionCodes: [] as string[],
});

const permissionsReadonly = computed(
  () => drawerMode.value === 'edit' && editingIsSystem.value,
);

function resetForm(): void {
  form.name = '';
  form.description = '';
  form.permissionCodes = [];
}

async function openCreate(): Promise<void> {
  drawerMode.value = 'create';
  editingId.value = null;
  editingIsSystem.value = false;
  resetForm();
  drawer.value = true;
  await nextTick();
}

async function openEdit(row: StaffRoleListItem): Promise<void> {
  loadingDetail.value = true;
  try {
    const res = await getStaffPort().getRole(row.id);
    if (!res.success) {
      ElMessage.error(res.error.message);
      return;
    }
    const detail = res.data;
    drawerMode.value = 'edit';
    editingId.value = detail.id;
    editingIsSystem.value = detail.isSystem;
    form.name = detail.name;
    form.description = detail.description ?? '';
    form.permissionCodes = [...detail.permissionCodes];
    drawer.value = true;
  } finally {
    loadingDetail.value = false;
  }
}

function isGroupChecked(groupKey: string): boolean {
  const group = PERMISSION_GROUPS.find((g) => g.key === groupKey);
  if (!group || group.items.length === 0) return false;
  return group.items.every((i) => form.permissionCodes.includes(i.code));
}

function isGroupIndeterminate(groupKey: string): boolean {
  const group = PERMISSION_GROUPS.find((g) => g.key === groupKey);
  if (!group || group.items.length === 0) return false;
  const checked = group.items.filter((i) => form.permissionCodes.includes(i.code)).length;
  return checked > 0 && checked < group.items.length;
}

function toggleGroup(groupKey: string, checked: boolean | string | number): void {
  if (permissionsReadonly.value) return;
  const group = PERMISSION_GROUPS.find((g) => g.key === groupKey);
  if (!group) return;
  const set = new Set(form.permissionCodes);
  const on = checked === true;
  for (const item of group.items) {
    if (on) set.add(item.code);
    else set.delete(item.code);
  }
  form.permissionCodes = [...set];
}

async function submitDrawer(): Promise<void> {
  saving.value = true;
  try {
    const port = getStaffPort();
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      permissionCodes: form.permissionCodes,
    };
    if (drawerMode.value === 'create') {
      const r = await port.createRole(payload);
      if (r.success) {
        ElMessage.success('角色已创建');
        drawer.value = false;
        void list.refresh();
      } else {
        ElMessage.error(r.error.message);
      }
      return;
    }
    const id = editingId.value;
    if (!id) return;
    const r = await port.updateRole(id, payload);
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

async function onDelete(row: StaffRoleListItem): Promise<void> {
  const ok = await confirmDanger({
    title: `删除角色「${row.name}」`,
    message: row.memberCount > 0
      ? `仍有 ${row.memberCount} 名管理员使用该角色，无法删除。`
      : '删除后不可恢复，确定继续？',
    type: 'danger',
  });
  if (!ok || row.memberCount > 0) return;
  const r = await getStaffPort().deleteRole(row.id);
  if (r.success) {
    ElMessage.success('已删除');
    void list.refresh();
  } else {
    ElMessage.error(r.error.message);
  }
}
</script>

<template>
  <div class="settings-panel">
    <header class="settings-panel__head">
      <div>
        <h3 class="settings-panel__title">角色权限</h3>
        <p class="settings-panel__desc">配置 Staff 角色及其权限；系统内置角色不可删除或修改权限集合</p>
      </div>
      <div class="settings-panel__head-actions">
        <el-button :icon="Refresh" text :loading="loading" @click="list.refresh()">
          刷新
        </el-button>
        <el-button v-if="canWrite" type="primary" @click="openCreate">
          <el-icon class="mr-1"><Plus /></el-icon>
          新建角色
        </el-button>
      </div>
    </header>

    <div class="settings-panel__body">
      <el-form class="settings-panel__filter" @submit.prevent="list.refresh()">
        <div class="settings-panel__filter-row">
          <el-form-item label="关键词">
            <el-input
              v-model="list.filter.value.keyword"
              clearable
              placeholder="角色名 / 描述"
              style="width: 220px"
            />
          </el-form-item>
          <div class="settings-panel__filter-actions">
            <el-button type="primary" :loading="loading" @click="list.refresh()">查询</el-button>
            <el-button @click="list.resetFilter()">重置</el-button>
          </div>
        </div>
      </el-form>

      <div class="settings-panel__table-wrap">
        <el-table
          v-loading="loading"
          :data="rows"
          row-key="id"
          stripe
          size="small"
          class="compact-table"
          height="100%"
          :empty-text="' '"
        >
          <el-table-column prop="name" label="角色名" min-width="140">
            <template #default="{ row }">
              <span>{{ row.name }}</span>
              <el-tag v-if="row.isSystem" size="small" type="info" class="ml-2">内置</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
          <el-table-column label="权限数" width="90">
            <template #default="{ row }">{{ row.permissionCount }}</template>
          </el-table-column>
          <el-table-column prop="memberCount" label="成员数" width="90" />
          <el-table-column label="创建时间" min-width="160">
            <template #default="{ row }">{{ formatDateTime(row.createdAtUtc) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="160" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" :loading="loadingDetail" @click="openEdit(row)">
                {{ canWrite ? '编辑' : '查看' }}
              </el-button>
              <el-button
                v-if="canWrite && !row.isSystem"
                link
                type="danger"
                :disabled="row.memberCount > 0"
                @click="onDelete(row)"
              >
                删除
              </el-button>
            </template>
          </el-table-column>

          <template #empty>
            <EmptyState
              title="暂无角色"
              description="调整筛选条件或新建角色。"
            />
          </template>
        </el-table>
      </div>

      <div class="settings-panel__pagination">
        <el-pagination
          v-model:current-page="list.pagination.state.page"
          v-model:page-size="list.pagination.state.pageSize"
          :total="list.pagination.state.total"
          :page-sizes="list.pagination.pageSizes"
          layout="total, sizes, prev, pager, next"
          background
        />
      </div>
    </div>

    <el-drawer
      v-model="drawer"
      :title="drawerMode === 'create' ? '新建角色' : (permissionsReadonly ? '查看角色' : '编辑角色')"
      size="520px"
      destroy-on-close
    >
      <el-form label-width="72px" @submit.prevent="submitDrawer">
        <el-form-item label="角色名" required>
          <el-input v-model="form.name" :disabled="permissionsReadonly && drawerMode === 'edit'" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="权限">
          <div class="perm-groups">
            <div v-for="group in PERMISSION_GROUPS" :key="group.key" class="perm-group">
              <div class="perm-group__head">
                <el-checkbox
                  :model-value="isGroupChecked(group.key)"
                  :indeterminate="isGroupIndeterminate(group.key)"
                  :disabled="permissionsReadonly"
                  @change="(v: boolean | string | number) => toggleGroup(group.key, v)"
                >
                  {{ group.title }}
                </el-checkbox>
              </div>
              <el-checkbox-group v-model="form.permissionCodes" class="perm-group__items" :disabled="permissionsReadonly">
                <el-checkbox
                  v-for="item in group.items"
                  :key="item.code"
                  :label="item.code"
                >
                  {{ item.label }}
                </el-checkbox>
              </el-checkbox-group>
            </div>
          </div>
          <p v-if="permissionsReadonly" class="perm-hint">系统内置角色的权限集合不可修改，仅可调整描述。</p>
        </el-form-item>
      </el-form>

      <template v-if="canWrite && !permissionsReadonly" #footer>
        <el-button @click="drawer = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitDrawer">保存</el-button>
      </template>
      <template v-else #footer>
        <el-button @click="drawer = false">关闭</el-button>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.settings-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.settings-panel__head {
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 24px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.settings-panel__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.settings-panel__desc {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.settings-panel__head-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.settings-panel__body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 16px 24px;
}

.settings-panel__filter {
  flex-shrink: 0;
  padding-bottom: 16px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.settings-panel__filter-row {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}

.settings-panel__filter :deep(.el-form-item) {
  margin-bottom: 0;
}

.settings-panel__filter-actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
}

.settings-panel__table-wrap {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.settings-panel__pagination {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.perm-groups {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.perm-group {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 12px;
}

.perm-group__head {
  margin-bottom: 8px;
  font-weight: 600;
}

.perm-group__items {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px 12px;
}

.perm-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.ml-2 {
  margin-left: 8px;
}

.mr-1 {
  margin-right: 4px;
}
</style>
