<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Refresh } from '@element-plus/icons-vue';

import { formatDateTime } from '@/shared/lib/date';
import type { EmailSettingsAdmin, UpdateEmailSettingsInput } from '../model/settings.types';
import { getEmailSettingsPort } from '../services';

interface EmailSettingsForm {
  emailSuffixRestrictionEnabled: boolean;
  allowedEmailSuffixes: string[];
  verificationCodeEnabled: boolean;
  updatedAtUtc: string;
}

const port = getEmailSettingsPort();
const loading = ref(false);
const saving = ref(false);
const snapshot = ref<EmailSettingsForm | null>(null);
const form = reactive<EmailSettingsForm>({
  emailSuffixRestrictionEnabled: false,
  allowedEmailSuffixes: [],
  verificationCodeEnabled: false,
  updatedAtUtc: '',
});

function applyStatus(status: EmailSettingsAdmin): void {
  const next: EmailSettingsForm = {
    emailSuffixRestrictionEnabled: status.emailSuffixRestrictionEnabled,
    allowedEmailSuffixes: [...status.allowedEmailSuffixes],
    verificationCodeEnabled: status.verificationCodeEnabled,
    updatedAtUtc: status.updatedAtUtc,
  };
  Object.assign(form, next);
  snapshot.value = {
    ...next,
    allowedEmailSuffixes: [...next.allowedEmailSuffixes],
  };
}

const isDirty = computed(() => {
  if (!snapshot.value) return false;
  const s = snapshot.value;
  return (
    form.emailSuffixRestrictionEnabled !== s.emailSuffixRestrictionEnabled
    || form.verificationCodeEnabled !== s.verificationCodeEnabled
    || !sameSuffixes(form.allowedEmailSuffixes, s.allowedEmailSuffixes)
  );
});

function sameSuffixes(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].map(normalizeSuffix).sort();
  const right = [...b].map(normalizeSuffix).sort();
  return left.every((v, i) => v === right[i]);
}

function normalizeSuffix(raw: string): string {
  return raw.trim().replace(/^@+/, '').toLowerCase();
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    const r = await port.get();
    if (r.success) {
      applyStatus(r.data);
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    loading.value = false;
  }
}

function reset(): void {
  if (!snapshot.value) return;
  applyStatus({
    emailSuffixRestrictionEnabled: snapshot.value.emailSuffixRestrictionEnabled,
    allowedEmailSuffixes: [...snapshot.value.allowedEmailSuffixes],
    verificationCodeEnabled: snapshot.value.verificationCodeEnabled,
    updatedAtUtc: snapshot.value.updatedAtUtc,
  });
}

function validateForm(): string | null {
  if (form.emailSuffixRestrictionEnabled && form.allowedEmailSuffixes.length === 0) {
    return '启用邮箱后缀限制后，至少添加一个合法后缀（如 example.com）。';
  }
  return null;
}

function buildPayload(): UpdateEmailSettingsInput {
  return {
    emailSuffixRestrictionEnabled: form.emailSuffixRestrictionEnabled,
    allowedEmailSuffixes: form.allowedEmailSuffixes.map(normalizeSuffix).filter(Boolean),
    verificationCodeEnabled: form.verificationCodeEnabled,
  };
}

async function save(): Promise<void> {
  if (!snapshot.value || !isDirty.value) return;

  const validationError = validateForm();
  if (validationError) {
    ElMessage.warning(validationError);
    return;
  }

  saving.value = true;
  try {
    const r = await port.update(buildPayload());
    if (r.success) {
      applyStatus(r.data);
      ElMessage.success('已保存');
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div v-loading="loading" class="settings-panel">
    <header class="settings-panel__head">
      <div>
        <h3 class="settings-panel__title">邮箱策略</h3>
        <p class="settings-panel__desc">
          配置邮箱后缀白名单与注册验证码；仅当注册渠道包含邮箱时后缀限制生效
        </p>
      </div>
      <div class="settings-panel__head-actions">
        <span v-if="snapshot?.updatedAtUtc && !isDirty" class="settings-panel__meta">
          最后保存 {{ formatDateTime(snapshot.updatedAtUtc) }}
        </span>
        <el-button :icon="Refresh" text @click="load">刷新</el-button>
      </div>
    </header>

    <el-alert
      v-if="isDirty"
      class="settings-panel__alert"
      type="warning"
      show-icon
      :closable="false"
      title="有未保存的更改，请保存后生效。"
    />

    <el-form
      v-if="snapshot"
      label-width="168px"
      label-position="left"
      class="settings-panel__form"
    >
      <section class="settings-panel__section">
        <h4 class="settings-panel__section-title">后缀白名单</h4>

        <el-form-item label="邮箱后缀白名单">
          <el-switch v-model="form.emailSuffixRestrictionEnabled" />
          <span class="settings-panel__item-tip">仅允许指定域名后缀注册</span>
        </el-form-item>

        <el-form-item
          v-if="form.emailSuffixRestrictionEnabled"
          label="允许的后缀"
          required
        >
          <el-select
            v-model="form.allowedEmailSuffixes"
            multiple
            filterable
            allow-create
            default-first-option
            :reserve-keyword="false"
            placeholder="输入 example.com 后回车"
            class="settings-panel__input-wide"
          >
            <el-option
              v-for="suffix in form.allowedEmailSuffixes"
              :key="suffix"
              :label="suffix"
              :value="suffix"
            />
          </el-select>
        </el-form-item>
      </section>

      <el-divider />

      <section class="settings-panel__section">
        <h4 class="settings-panel__section-title">验证码</h4>

        <el-form-item label="注册验证码">
          <el-switch v-model="form.verificationCodeEnabled" />
          <span class="settings-panel__item-tip">注册时校验邮箱验证码</span>
        </el-form-item>
      </section>
    </el-form>

    <el-empty v-else-if="!loading" description="暂无配置" />

    <footer v-if="snapshot" class="settings-panel__footer">
      <el-button :disabled="!isDirty" @click="reset">取消</el-button>
      <el-button type="primary" :loading="saving" :disabled="!isDirty" @click="save">
        保存
      </el-button>
    </footer>
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

.settings-panel__meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.settings-panel__alert {
  margin: 12px 24px 0;
}

.settings-panel__form {
  flex: 1;
  padding: 8px 24px 24px;
  max-width: 880px;
}

.settings-panel__section-title {
  margin: 16px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}

.settings-panel__form :deep(.el-form-item) {
  margin-bottom: 20px;
}

.settings-panel__form :deep(.el-form-item__label) {
  color: var(--el-text-color-primary);
}

.settings-panel__item-tip {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}

.settings-panel__input-wide {
  width: 100%;
  max-width: 420px;
}

.settings-panel__footer {
  position: sticky;
  bottom: 0;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 24px;
  border-top: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
}
</style>
