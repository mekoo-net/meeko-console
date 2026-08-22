<script setup lang="ts">
import { ElMessage, type ElTree } from 'element-plus';
import { CopyDocument, Hide, Plus, Refresh, View } from '@element-plus/icons-vue';
import { computed, nextTick, onMounted, reactive, ref } from 'vue';

import EmptyState from '@/shared/ui/EmptyState.vue';
import { confirmDanger } from '@/shared/composables/useConfirm';
import { formatDateTime } from '@/shared/lib/date';
import { useAuthStore } from '@/stores/auth';
import {
  buildPermissionTree,
  type PermissionCatalogItem,
} from '@/features/platform/staff/model/staff.types';

import { useApiKeyList } from '../composables/useApiKeyList';
import {
  apiKeyScopeLabel,
  apiKeyStatus,
  apiKeyStatusLabel,
  type PlatformApiKey,
} from '../model/apikey.types';
import { getApiKeyPort } from '../services';

const auth = useAuthStore();
const canWrite = computed(() => auth.hasPermission('platform.apikey.write'));

const list = useApiKeyList();
const catalog = ref<PermissionCatalogItem[]>([]);
const permissionTree = computed(() => buildPermissionTree(catalog.value));
const treeRef = ref<InstanceType<typeof ElTree>>();

const drawer = ref(false);
const saving = ref(false);
const editingId = ref<string | null>(null);
const revealed = ref<Set<string>>(new Set());
const form = reactive({
  name: '',
  scopes: [] as string[],
  expiresAt: '',
});

onMounted(async () => {
  const res = await getApiKeyPort().listScopes();
  if (res.success) catalog.value = res.data;
});

async function applyTreeKeys(keys: string[]): Promise<void> {
  await nextTick();
  treeRef.value?.setCheckedKeys(keys);
}

function openCreate(): void {
  editingId.value = null;
  form.name = '';
  form.scopes = [];
  form.expiresAt = '';
  drawer.value = true;
  void applyTreeKeys([]);
}

function openEdit(row: PlatformApiKey): void {
  editingId.value = row.id;
  form.name = row.name;
  form.scopes = [...row.scopes];
  form.expiresAt = '';
  drawer.value = true;
  void applyTreeKeys(form.scopes);
}

function syncTreeScopes(): void {
  const keys = (treeRef.value?.getCheckedKeys(true) ?? []) as string[];
  form.scopes = keys.filter((k) => !k.startsWith('domain:') && !k.startsWith('resource:'));
}

function checkAllScopes(): void {
  form.scopes = catalog.value.map((i) => i.code);
  treeRef.value?.setCheckedKeys(form.scopes);
}

function clearScopes(): void {
  form.scopes = [];
  treeRef.value?.setCheckedKeys([]);
}

async function submitForm(): Promise<void> {
  if (form.scopes.length === 0) {
    ElMessage.warning('请至少勾选一项权限');
    return;
  }

  saving.value = true;
  try {
    if (editingId.value) {
      const res = await getApiKeyPort().update(editingId.value, { scopes: form.scopes });
      if (!res.success) {
        ElMessage.error(res.error.message);
        return;
      }
      ElMessage.success('权限已更新');
    } else {
      const name = form.name.trim();
      if (!name) {
        ElMessage.warning('请填写令牌名称');
        return;
      }
      const res = await getApiKeyPort().issue({
        name,
        scopes: form.scopes,
        expiresAtUtc: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      });
      if (!res.success) {
        ElMessage.error(res.error.message);
        return;
      }
      ElMessage.success('令牌已创建，可在列表里查看明文');
    }
    drawer.value = false;
    void list.refresh();
  } finally {
    saving.value = false;
  }
}

function isRevealed(id: string): boolean {
  return revealed.value.has(id);
}

function toggleReveal(id: string): void {
  const next = new Set(revealed.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  revealed.value = next;
}

function tokenPreview(row: PlatformApiKey): string {
  if (!row.plaintext) return row.keyHint ? `${row.keyHint}…` : '—';
  if (isRevealed(row.id)) return row.plaintext;
  return `${row.plaintext.slice(0, 8)}…`;
}

async function copyToken(row: PlatformApiKey): Promise<void> {
  if (!row.plaintext) {
    ElMessage.warning('这枚是旧令牌，当时没存明文，请重新签发');
    return;
  }
  try {
    await navigator.clipboard.writeText(row.plaintext);
    ElMessage.success('已复制');
  } catch {
    ElMessage.error('复制失败，请手动选中复制');
  }
}

async function revoke(row: PlatformApiKey): Promise<void> {
  const ok = await confirmDanger({
    title: `吊销令牌「${row.name}」`,
    message: '吊销后立即失效（网关最多约 1 分钟缓存）。明文无法找回。',
    type: 'danger',
  });
  if (!ok) return;
  const res = await getApiKeyPort().revoke(row.id);
  if (res.success) {
    ElMessage.success('已吊销');
    void list.refresh();
  } else {
    ElMessage.error(res.error.message);
  }
}

function statusType(row: PlatformApiKey): 'success' | 'info' | 'warning' {
  const status = apiKeyStatus(row);
  if (status === 'active') return 'success';
  if (status === 'expired') return 'warning';
  return 'info';
}
</script>

<template>
  <div class="settings-panel">
    <header class="settings-panel__head">
      <div>
        <h3 class="settings-panel__title">平台令牌</h3>
        <p class="settings-panel__desc">
          给机器调用平台与产品后台。勾选权限与员工角色同一套；明文保存在库里，随时可看可改权限。
        </p>
      </div>
      <div class="settings-panel__head-actions">
        <el-button :icon="Refresh" text :loading="list.loading.value" @click="list.refresh()">
          刷新
        </el-button>
        <el-button v-if="canWrite" type="primary" @click="openCreate">
          <el-icon class="mr-1"><Plus /></el-icon>
          创建令牌
        </el-button>
      </div>
    </header>

    <div class="settings-panel__body">
      <el-alert
        v-if="list.error.value"
        :title="`加载失败：${list.error.value.code}`"
        :description="list.error.value.message"
        type="error"
        show-icon
        :closable="false"
        class="settings-panel__alert"
      />

      <div class="settings-panel__table-wrap">
        <el-table
          v-loading="list.loading.value"
          :data="list.items.value"
          row-key="id"
          stripe
          size="small"
          class="compact-table"
          height="100%"
          :empty-text="' '"
        >
          <el-table-column prop="name" label="名称" min-width="120" />
          <el-table-column label="令牌" min-width="220">
            <template #default="{ row }">
              <div class="token-cell">
                <code class="hint">{{ tokenPreview(row) }}</code>
                <el-button
                  v-if="row.plaintext"
                  link
                  :icon="isRevealed(row.id) ? Hide : View"
                  @click="toggleReveal(row.id)"
                />
                <el-button link :icon="CopyDocument" @click="copyToken(row)" />
              </div>
            </template>
          </el-table-column>
          <el-table-column label="权限" min-width="280">
            <template #default="{ row }">
              <el-tag
                v-for="scope in row.scopes"
                :key="scope"
                size="small"
                class="scope-tag"
              >
                {{ apiKeyScopeLabel(scope) }}
              </el-tag>
              <span v-if="row.scopes.length === 0">—</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="statusType(row)" size="small">
                {{ apiKeyStatusLabel(apiKeyStatus(row)) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="过期" min-width="150">
            <template #default="{ row }">
              {{ row.expiresAtUtc ? formatDateTime(row.expiresAtUtc) : '不过期' }}
            </template>
          </el-table-column>
          <el-table-column label="最近使用" min-width="150">
            <template #default="{ row }">
              {{ row.lastUsedAtUtc ? formatDateTime(row.lastUsedAtUtc) : '—' }}
            </template>
          </el-table-column>
          <el-table-column label="创建时间" min-width="150">
            <template #default="{ row }">
              {{ formatDateTime(row.createdAtUtc) }}
            </template>
          </el-table-column>
          <el-table-column v-if="canWrite" label="操作" width="120" fixed="right">
            <template #default="{ row }">
              <template v-if="!row.revokedAtUtc">
                <el-button link type="primary" @click="openEdit(row)">权限</el-button>
                <el-button link type="danger" @click="revoke(row)">吊销</el-button>
              </template>
              <span v-else class="muted">—</span>
            </template>
          </el-table-column>

          <template #empty>
            <EmptyState title="还没有令牌" description="创建后明文会留在列表里，随时可看、可改权限。" />
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

    <el-drawer v-model="drawer" :title="editingId ? '修改权限' : '创建令牌'" size="640px" destroy-on-close>
      <el-form label-width="88px" @submit.prevent="submitForm">
        <el-form-item label="名称" required>
          <el-input
            v-model="form.name"
            maxlength="80"
            show-word-limit
            placeholder="例如：发卡脚本"
            :disabled="!!editingId"
          />
        </el-form-item>
        <el-form-item label="权限" required>
          <div class="scope-box">
            <div class="scope-box__toolbar">
              <el-button link type="primary" @click="checkAllScopes">全选</el-button>
              <el-button link @click="clearScopes">清空</el-button>
              <span class="muted">已选 {{ form.scopes.length }}</span>
            </div>
            <el-tree
              ref="treeRef"
              :data="permissionTree"
              show-checkbox
              node-key="key"
              default-expand-all
              :props="{ label: 'label', children: 'children' }"
              @check="syncTreeScopes"
            />
          </div>
        </el-form-item>
        <el-form-item v-if="!editingId" label="过期时间">
          <el-date-picker
            v-model="form.expiresAt"
            type="datetime"
            placeholder="不填则不过期"
            value-format="YYYY-MM-DDTHH:mm:ss"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="drawer = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitForm">
          {{ editingId ? '保存' : '创建' }}
        </el-button>
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

.settings-panel__alert {
  flex-shrink: 0;
  margin-bottom: 12px;
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

.mr-1 {
  margin-right: 4px;
}

.hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  word-break: break-all;
}

.token-cell {
  display: flex;
  align-items: center;
  gap: 2px;
}

.scope-tag {
  margin-right: 4px;
  margin-bottom: 2px;
}

.muted {
  color: var(--el-text-color-placeholder);
}

.scope-box {
  width: 100%;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 8px 12px 4px;
  max-height: calc(100vh - 280px);
  overflow: auto;
}

.scope-box__toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.scope-box__group-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.scope-box__resource {
  margin-bottom: 8px;
}

.scope-box__resource-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin: 4px 0;
}

.method {
  display: inline-block;
  min-width: 44px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-color-primary);
}

.scope-box__item {
  display: flex;
  align-items: flex-start;
  height: auto;
  margin: 8px 0;
  white-space: normal;
}

.scope-box__label {
  display: flex;
  flex-direction: column;
  line-height: 1.4;
}

.scope-box__label code {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

</style>
