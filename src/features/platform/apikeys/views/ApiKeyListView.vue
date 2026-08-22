<script setup lang="ts">
import { ElMessage } from 'element-plus';
import { Plus, Refresh } from '@element-plus/icons-vue';
import { computed, onMounted, reactive, ref } from 'vue';

import EmptyState from '@/shared/ui/EmptyState.vue';
import { confirmDanger } from '@/shared/composables/useConfirm';
import { formatDateTime } from '@/shared/lib/date';
import { useAuthStore } from '@/stores/auth';

import { useApiKeyList } from '../composables/useApiKeyList';
import {
  FALLBACK_API_KEY_SCOPES,
  apiKeyScopeLabel,
  apiKeyStatus,
  apiKeyStatusLabel,
  type PlatformApiKey,
} from '../model/apikey.types';
import { getApiKeyPort } from '../services';

const auth = useAuthStore();
const canWrite = computed(() => auth.hasPermission('platform.apikey.write'));

const list = useApiKeyList();
const catalog = ref<string[]>([...FALLBACK_API_KEY_SCOPES]);

const drawer = ref(false);
const saving = ref(false);
const form = reactive({
  name: '',
  scopes: [] as string[],
  expiresAt: '',
});

const secretDialog = ref(false);
const issuedName = ref('');
const issuedPlaintext = ref('');

onMounted(async () => {
  const res = await getApiKeyPort().listScopes();
  if (res.success && res.data.length > 0) {
    catalog.value = res.data;
  }
});

function openCreate(): void {
  form.name = '';
  form.scopes = [];
  form.expiresAt = '';
  drawer.value = true;
}

function toggleScope(code: string, checked: boolean): void {
  if (checked) {
    if (!form.scopes.includes(code)) form.scopes.push(code);
    return;
  }
  form.scopes = form.scopes.filter((s) => s !== code);
}

function checkAllScopes(): void {
  form.scopes = [...catalog.value];
}

function clearScopes(): void {
  form.scopes = [];
}

async function submitCreate(): Promise<void> {
  const name = form.name.trim();
  if (!name) {
    ElMessage.warning('请填写令牌名称');
    return;
  }
  if (form.scopes.length === 0) {
    ElMessage.warning('请至少勾选一项权限');
    return;
  }

  saving.value = true;
  try {
    const res = await getApiKeyPort().issue({
      name,
      scopes: form.scopes,
      expiresAtUtc: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
    });
    if (!res.success) {
      ElMessage.error(res.error.message);
      return;
    }
    drawer.value = false;
    issuedName.value = res.data.key.name;
    issuedPlaintext.value = res.data.plaintext;
    secretDialog.value = true;
    void list.refresh();
  } finally {
    saving.value = false;
  }
}

async function copyPlaintext(): Promise<void> {
  try {
    await navigator.clipboard.writeText(issuedPlaintext.value);
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
          给机器调用平台接口用。权限写在令牌上，不继承管理员角色。
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
          <el-table-column prop="name" label="名称" min-width="140" />
          <el-table-column label="提示" width="110">
            <template #default="{ row }">
              <code class="hint">{{ row.keyHint }}…</code>
            </template>
          </el-table-column>
          <el-table-column label="权限" min-width="220">
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
          <el-table-column v-if="canWrite" label="操作" width="80" fixed="right">
            <template #default="{ row }">
              <el-button
                v-if="!row.revokedAtUtc"
                link
                type="danger"
                @click="revoke(row)"
              >
                吊销
              </el-button>
              <span v-else class="muted">—</span>
            </template>
          </el-table-column>

          <template #empty>
            <EmptyState title="还没有令牌" description="创建后把明文交给调用方，这里只留提示前缀。" />
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

    <el-drawer v-model="drawer" title="创建令牌" size="460px" destroy-on-close>
      <el-form label-width="88px" @submit.prevent="submitCreate">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" maxlength="80" show-word-limit placeholder="例如：发卡脚本" />
        </el-form-item>
        <el-form-item label="权限" required>
          <div class="scope-box">
            <div class="scope-box__toolbar">
              <el-button link type="primary" @click="checkAllScopes">全选</el-button>
              <el-button link @click="clearScopes">清空</el-button>
            </div>
            <el-checkbox
              v-for="code in catalog"
              :key="code"
              :model-value="form.scopes.includes(code)"
              class="scope-box__item"
              @change="(v: boolean | string | number) => toggleScope(code, v === true)"
            >
              <div class="scope-box__label">
                <span>{{ apiKeyScopeLabel(code) }}</span>
                <code>{{ code }}</code>
              </div>
            </el-checkbox>
          </div>
        </el-form-item>
        <el-form-item label="过期时间">
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
        <el-button type="primary" :loading="saving" @click="submitCreate">创建</el-button>
      </template>
    </el-drawer>

    <el-dialog
      v-model="secretDialog"
      title="令牌已创建"
      width="520px"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
    >
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="明文只出现这一次，关闭后无法再看。"
        class="secret-alert"
      />
      <p class="secret-name">{{ issuedName }}</p>
      <el-input :model-value="issuedPlaintext" readonly type="textarea" :rows="3" />
      <template #footer>
        <el-button type="primary" @click="copyPlaintext">复制明文</el-button>
        <el-button @click="secretDialog = false">我已保存</el-button>
      </template>
    </el-dialog>
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
}

.scope-box__toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 4px;
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

.secret-alert {
  margin-bottom: 12px;
}

.secret-name {
  margin: 0 0 8px;
  font-weight: 600;
}
</style>
