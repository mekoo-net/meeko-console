<script setup lang="ts">
import { reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { CopyDocument, Key, WarningFilled } from '@element-plus/icons-vue';

import type { AppResult } from '@/shared/api/httpTypes';
import type { IssueBackendInput, IssuedBackendCredentials } from '@/features/demuxai/model/backend.types';

const props = defineProps<{
  productLabel: string;
  configHint: string;
  requireName?: boolean;
  issue: (input: IssueBackendInput) => Promise<AppResult<IssuedBackendCredentials>>;
}>();

const form = reactive({ name: '' });
const issuing = ref(false);
const issued = ref<IssuedBackendCredentials | null>(null);

async function submit(): Promise<void> {
  const name = form.name.trim();
  if (props.requireName && !name) {
    ElMessage.warning('请填写凭据名称');
    return;
  }

  issuing.value = true;
  try {
    const result = await props.issue({ name: name || `${props.productLabel} gateway` });
    if (!result.success) {
      ElMessage.error(result.error.message);
      return;
    }
    issued.value = result.data;
    ElMessage.success('凭据已签发，请立即复制保存');
  } finally {
    issuing.value = false;
  }
}

function reset(): void {
  issued.value = null;
  form.name = '';
}

async function copyText(label: string, value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    ElMessage.success(`${label} 已复制`);
  } catch {
    ElMessage.warning('复制失败，请手动复制');
  }
}

async function copyPair(): Promise<void> {
  if (!issued.value) return;
  const block = [
    `ClientId: ${issued.value.clientId}`,
    `ClientSecret: ${issued.value.clientSecret}`,
  ].join('\n');
  await copyText('凭据', block);
}
</script>

<template>
  <div class="gateway-panel">
    <el-alert type="info" show-icon :closable="false" class="gateway-panel__alert">
      <template #title>签发说明</template>
      <p>
        此处签发的是 <strong>{{ productLabel }}</strong> 网关 RPC 接入凭据（ClientId + <code>cs-</code> Secret）。
        凭据<strong>只显示一次</strong>，请写入网关配置；服务端
        <code>HmacKeyBase64</code> 需在 yaml / secrets 中单独配置。
      </p>
      <p class="gateway-panel__hint">{{ configHint }}</p>
    </el-alert>

    <el-card v-if="!issued" shadow="never" class="gateway-panel__card">
      <el-form label-width="88px" @submit.prevent="submit">
        <el-form-item :label="requireName ? '名称' : '备注'" :required="requireName">
          <el-input
            v-model="form.name"
            maxlength="64"
            show-word-limit
            :placeholder="requireName ? '例如 prod-gateway-east' : '可选，便于运维识别'"
            clearable
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="issuing" @click="submit">
            <el-icon><Key /></el-icon>
            签发凭据
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card v-else shadow="never" class="gateway-panel__card gateway-panel__result">
      <template #header>
        <div class="gateway-panel__result-head">
          <span>签发成功</span>
          <el-button link type="primary" @click="reset">继续签发</el-button>
        </div>
      </template>

      <el-alert type="warning" show-icon :closable="false" class="gateway-panel__warn">
        <template #title>
          <el-icon><WarningFilled /></el-icon>
          请立即复制保存 — ClientSecret 无法再次查看
        </template>
      </el-alert>

      <dl class="gateway-panel__fields">
        <div v-if="issued.backendId" class="gateway-panel__field">
          <dt>Backend ID</dt>
          <dd>
            <code>{{ issued.backendId }}</code>
            <el-button link type="primary" @click="copyText('Backend ID', issued.backendId!)">
              <el-icon><CopyDocument /></el-icon>
            </el-button>
          </dd>
        </div>
        <div class="gateway-panel__field">
          <dt>Client ID</dt>
          <dd>
            <code>{{ issued.clientId }}</code>
            <el-button link type="primary" @click="copyText('Client ID', issued.clientId)">
              <el-icon><CopyDocument /></el-icon>
            </el-button>
          </dd>
        </div>
        <div class="gateway-panel__field">
          <dt>Client Secret</dt>
          <dd>
            <code class="gateway-panel__secret">{{ issued.clientSecret }}</code>
            <el-button link type="primary" @click="copyText('Client Secret', issued.clientSecret)">
              <el-icon><CopyDocument /></el-icon>
            </el-button>
          </dd>
        </div>
      </dl>

      <div class="gateway-panel__actions">
        <el-button type="primary" @click="copyPair">复制 ClientId + Secret</el-button>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.gateway-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 880px;
}

.gateway-panel__alert p {
  margin: 0 0 8px;
  line-height: 1.6;
}

.gateway-panel__alert p:last-child {
  margin-bottom: 0;
}

.gateway-panel__hint {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.gateway-panel__card :deep(.el-card__body) {
  padding-top: 20px;
}

.gateway-panel__result-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.gateway-panel__warn {
  margin-bottom: 16px;
}

.gateway-panel__fields {
  margin: 0;
}

.gateway-panel__field {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 12px;
  align-items: start;
  padding: 10px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.gateway-panel__field:last-child {
  border-bottom: none;
}

.gateway-panel__field dt {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 28px;
}

.gateway-panel__field dd {
  margin: 0;
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.gateway-panel__field code {
  flex: 1;
  word-break: break-all;
  font-size: 13px;
  line-height: 1.5;
  padding: 4px 8px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
}

.gateway-panel__secret {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.gateway-panel__actions {
  margin-top: 16px;
}
</style>
