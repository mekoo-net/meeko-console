<script setup lang="ts">
import { ElMessage } from 'element-plus';
import { Plus, Refresh } from '@element-plus/icons-vue';
import { computed, nextTick, onMounted, reactive, ref } from 'vue';

import { confirmDanger } from '@/shared/composables/useConfirm';
import { formatDateTime } from '@/shared/lib/date';
import { useAuthStore } from '@/stores/auth';

import { useStaffRoles } from '../composables/useStaffRoles';
import {
  PERMISSION_GROUPS,
  type StaffRole,
} from '../model/staff.types';
import { getStaffPort } from '../services';

const auth = useAuthStore();
const canWrite = computed(() => auth.hasPermission('platform.role.write'));

const rolesState = useStaffRoles();
const rows = computed(() => rolesState.data.value ?? []);
const loading = computed(() => rolesState.loading.value);

const drawer = ref(false);
const drawerMode = ref<'create' | 'edit'>('create');
const saving = ref(false);
const editingId = ref<string | null>(null);

const form = reactive({
  name: '',
  description: '',
  permissionCodes: [] as string[],
});

const editingRow = computed(() => rows.value.find((r) => r.id === editingId.value) ?? null);
const permissionsReadonly = computed(
  () => drawerMode.value === 'edit' && (editingRow.value?.isSystem ?? false),
);

function resetForm(): void {
  form.name = '';
  form.description = '';
  form.permissionCodes = [];
}

async function openCreate(): Promise<void> {
  drawerMode.value = 'create';
  editingId.value = null;
  resetForm();
  drawer.value = true;
  await nextTick();
}

function openEdit(row: StaffRole): void {
  drawerMode.value = 'edit';
  editingId.value = row.id;
  form.name = row.name;
  form.description = row.description ?? '';
  form.permissionCodes = [...row.permissionCodes];
  drawer.value = true;
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
        void rolesState.refresh();
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
      void rolesState.refresh();
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    saving.value = false;
  }
}

async function onDelete(row: StaffRole): Promise<void> {
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
    void rolesState.refresh();
  } else {
    ElMessage.error(r.error.message);
  }
}

onMounted(() => {
  void rolesState.run();
});
</script>

<template>
  <div class="settings-panel">
    <header class="settings-panel__head">
      <div>
        <h3 class="settings-panel__title">角色权限</h3>
        <p class="settings-panel__desc">配置 Staff 角色及其权限；系统内置角色不可删除或修改权限集合</p>
      </div>
      <div class="settings-panel__head-actions">
        <el-button :icon="Refresh" text :loading="loading" @click="rolesState.refresh()">
          刷新
        </el-button>
        <el-button v-if="canWrite" type="primary" @click="openCreate">
          <el-icon class="mr-1"><Plus /></el-icon>
          新建角色
        </el-button>
      </div>
    </header>

    <div v-loading="loading" class="settings-panel__body">
      <el-table :data="rows" row-key="id" stripe>
        <el-table-column prop="name" label="角色名" min-width="140">
          <template #default="{ row }">
            <span>{{ row.name }}</span>
            <el-tag v-if="row.isSystem" size="small" type="info" class="ml-2">内置</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
        <el-table-column label="权限数" width="90">
          <template #default="{ row }">{{ row.permissionCodes.length }}</template>
        </el-table-column>
        <el-table-column prop="memberCount" label="成员数" width="90" />
        <el-table-column label="创建时间" min-width="160">
          <template #default="{ row }">{{ formatDateTime(row.createdAtUtc) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">
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
      </el-table>
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
  min-height: 100%;
}

.settings-panel__head {
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
  padding: 16px 24px 24px;
  min-height: 220px;
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
