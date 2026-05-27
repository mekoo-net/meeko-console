<script setup lang="ts">
import { reactive, ref } from 'vue';

import { CopyDocument, Key } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

import PageHeader from '@/shared/ui/PageHeader.vue';
import { isMockMode } from '@/shared/runtime';

import type { IssuedBackendCredentials } from '../model/backend.types';
import { getDemuxaiBackendPort } from '../services';

const backendPort = getDemuxaiBackendPort();

const form = reactive({
  name: '',
  scopesText: 'llm.resolve\nllm.bill',
});

const submitting = ref(false);
const issued = ref<IssuedBackendCredentials | null>(null);
const dialogVisible = ref(false);

function parseScopes(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function submitIssue(): Promise<void> {
  const name = form.name.trim();
  if (!name) {
    ElMessage.warning('请填写后端名称');
    return;
  }
  submitting.value = true;
  try {
    const r = await backendPort.issue({
      name,
      scopes: parseScopes(form.scopesText),
    });
    if (!r.success) {
      ElMessage.error(r.error.message);
      return;
    }
    issued.value = r.data;
    dialogVisible.value = true;
    ElMessage.success('凭据已签发');
  } finally {
    submitting.value = false;
  }
}

async function copyText(label: string, value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    ElMessage.success(`${label} 已复制`);
  } catch {
    ElMessage.error('复制失败');
  }
}
</script>

<template>
  <div>
    <PageHeader
      title="系统设置"
      description="为自部署 LLM Gateway 签发 client_id / client_secret（POST /demuxai/api/admin/backends）。明文 Secret 仅展示一次。"
    />

    <el-alert
      v-if="isMockMode"
      type="warning"
      :closable="false"
      show-icon
      class="settings-alert"
      title="Mock 模式"
      description="当前为本地 Mock 数据。联调请设 VITE_USE_MOCK=false 并确保 Gateway 已路由 DemuxAi 服务。"
    />

    <el-row :gutter="16">
      <el-col :xs="24" :lg="14">
        <el-card shadow="never">
          <template #header>
            <span class="card-title">
              <el-icon><Key /></el-icon>
              签发 Gateway 凭据
            </span>
          </template>

          <el-form label-position="top" @submit.prevent="submitIssue">
            <el-form-item label="后端名称" required>
              <el-input
                v-model="form.name"
                placeholder="例如 production-gateway-01"
                autocomplete="off"
                clearable
              />
            </el-form-item>
            <el-form-item label="Scopes（每行一个，可选）">
              <el-input
                v-model="form.scopesText"
                type="textarea"
                :rows="4"
                placeholder="llm.resolve&#10;llm.bill"
                class="scopes-input"
              />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="submitting" @click="submitIssue">
                签发凭据
              </el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>

      <el-col :xs="24" :lg="10">
        <el-card shadow="never">
          <template #header>说明</template>
          <p class="hint">
            签发后的凭据供 LLM 后端实例调用 DemuxAi RPC（令牌解析、计量回写等）。
            ClientSecret 为 HMAC 自验证凭据，不落库。
          </p>
        </el-card>
      </el-col>
    </el-row>

    <el-dialog v-model="dialogVisible" title="凭据已签发" width="520px" destroy-on-close>
      <p class="dialog-warn">请立即保存以下信息，关闭后将无法再次查看 ClientSecret。</p>
      <template v-if="issued">
        <div class="cred-row">
          <span class="cred-label">Backend ID</span>
          <code class="cred-value">{{ issued.backendId }}</code>
          <el-button
            text
            type="primary"
            :icon="CopyDocument"
            @click="copyText('Backend ID', issued.backendId)"
          />
        </div>
        <div class="cred-row">
          <span class="cred-label">Client ID</span>
          <code class="cred-value">{{ issued.clientId }}</code>
          <el-button
            text
            type="primary"
            :icon="CopyDocument"
            @click="copyText('Client ID', issued.clientId)"
          />
        </div>
        <div class="cred-row">
          <span class="cred-label">Client Secret</span>
          <code class="cred-value cred-value--break">{{ issued.clientSecret }}</code>
          <el-button
            text
            type="primary"
            :icon="CopyDocument"
            @click="copyText('Client Secret', issued.clientSecret)"
          />
        </div>
      </template>
      <template #footer>
        <el-button type="primary" @click="dialogVisible = false">我已保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.settings-alert {
  margin-bottom: 16px;
}
.card-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}
.scopes-input :deep(textarea) {
  font-family: ui-monospace, monospace;
  font-size: 12px;
}
.hint {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}
.dialog-warn {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--el-color-warning);
}
.cred-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 12px;
}
.cred-label {
  flex: 0 0 96px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.cred-value {
  flex: 1;
  font-size: 12px;
  padding: 4px 8px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
}
.cred-value--break {
  word-break: break-all;
}
</style>
