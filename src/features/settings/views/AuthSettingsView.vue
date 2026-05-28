<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Refresh } from '@element-plus/icons-vue';

import { confirmDanger } from '@/shared/composables/useConfirm';
import { formatDateTime } from '@/shared/lib/date';
import type {
  AuthSettingsAdmin,
  CaptchaProvider,
  RegistrationChannel,
  UpdateAuthSettingsInput,
} from '../model/settings.types';
import { getAuthSettingsPort } from '../services';

interface AuthSettingsForm {
  registrationEnabled: boolean;
  passwordLogin: boolean;
  registrationChannel: RegistrationChannel;
  captchaEnabled: boolean;
  captchaProvider: CaptchaProvider;
  captchaSiteKey: string;
  captchaSecretKey: string;
  captchaSecretConfigured: boolean;
  updatedAtUtc: string;
}

const port = getAuthSettingsPort();
const loading = ref(false);
const saving = ref(false);
const snapshot = ref<AuthSettingsForm | null>(null);
const form = reactive<AuthSettingsForm>({
  registrationEnabled: true,
  passwordLogin: true,
  registrationChannel: 'email',
  captchaEnabled: false,
  captchaProvider: 'none',
  captchaSiteKey: '',
  captchaSecretKey: '',
  captchaSecretConfigured: false,
  updatedAtUtc: '',
});

const captchaProviderOptions: Array<{ value: CaptchaProvider; label: string }> = [
  { value: 'none', label: '未启用' },
  { value: 'turnstile', label: 'Cloudflare Turnstile' },
  { value: 'recaptcha_v2', label: 'Google reCAPTCHA v2' },
  { value: 'recaptcha_v3', label: 'Google reCAPTCHA v3' },
  { value: 'hcaptcha', label: 'hCaptcha' },
];

const captchaProviderLabel = computed(() =>
  captchaProviderOptions.find((o) => o.value === form.captchaProvider)?.label ?? form.captchaProvider,
);

const registrationChannelOptions: Array<{ value: RegistrationChannel; label: string; hint: string }> = [
  { value: 'email', label: '邮箱注册', hint: '用户使用邮箱 + 密码注册' },
  { value: 'phone', label: '手机注册', hint: '用户使用手机 + 验证码注册' },
  { value: 'both', label: '邮箱 + 手机', hint: '同时开放两种注册方式' },
];

function applyStatus(status: AuthSettingsAdmin): void {
  const next: AuthSettingsForm = {
    registrationEnabled: status.registrationEnabled,
    passwordLogin: status.passwordLogin,
    registrationChannel: status.registrationChannel,
    captchaEnabled: status.captchaEnabled,
    captchaProvider: status.captchaProvider,
    captchaSiteKey: status.captchaSiteKey,
    captchaSecretKey: '',
    captchaSecretConfigured: status.captchaSecretConfigured,
    updatedAtUtc: status.updatedAtUtc,
  };
  Object.assign(form, next);
  snapshot.value = { ...next };
}

const isDirty = computed(() => {
  if (!snapshot.value) return false;
  const s = snapshot.value;
  return (
    form.registrationEnabled !== s.registrationEnabled
    || form.passwordLogin !== s.passwordLogin
    || form.registrationChannel !== s.registrationChannel
    || form.captchaEnabled !== s.captchaEnabled
    || form.captchaProvider !== s.captchaProvider
    || form.captchaSiteKey !== s.captchaSiteKey
    || form.captchaSecretKey.length > 0
  );
});

watch(
  () => form.captchaEnabled,
  (enabled) => {
    if (!enabled) {
      form.captchaProvider = 'none';
      form.captchaSecretKey = '';
    } else if (form.captchaProvider === 'none') {
      form.captchaProvider = 'turnstile';
    }
  },
);

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
    registrationEnabled: snapshot.value.registrationEnabled,
    passwordLogin: snapshot.value.passwordLogin,
    registrationChannel: snapshot.value.registrationChannel,
    captchaEnabled: snapshot.value.captchaEnabled,
    captchaProvider: snapshot.value.captchaProvider,
    captchaSiteKey: snapshot.value.captchaSiteKey,
    captchaSecretConfigured: snapshot.value.captchaSecretConfigured,
    updatedAtUtc: snapshot.value.updatedAtUtc,
  });
}

function validateForm(): string | null {
  if (form.captchaEnabled) {
    if (form.captchaProvider === 'none') return '启用人机验证时必须选择提供商。';
    if (!form.captchaSiteKey.trim()) return '启用人机验证时必须填写 Site Key。';
    if (!form.captchaSecretConfigured && !form.captchaSecretKey.trim()) {
      return '首次启用人机验证时必须填写 Secret Key。';
    }
  }
  return null;
}

async function confirmRiskyChanges(): Promise<boolean> {
  if (!snapshot.value) return true;

  if (snapshot.value.registrationEnabled && !form.registrationEnabled) {
    const ok = await confirmDanger({
      title: '关闭用户注册',
      message: '关闭后，所有接入前端的注册入口将不可用。已有账号不受影响。确定继续？',
      type: 'danger',
    });
    if (!ok) return false;
  }

  if (snapshot.value.passwordLogin && !form.passwordLogin) {
    const ok = await confirmDanger({
      title: '关闭密码登录',
      message: '关闭后，用户将无法使用用户名/邮箱 + 密码登录。确定继续？',
      type: 'danger',
    });
    if (!ok) return false;
  }

  return true;
}

function buildPayload(): UpdateAuthSettingsInput {
  const payload: UpdateAuthSettingsInput = {
    registrationEnabled: form.registrationEnabled,
    passwordLogin: form.passwordLogin,
    registrationChannel: form.registrationChannel,
    captchaEnabled: form.captchaEnabled,
    captchaProvider: form.captchaEnabled ? form.captchaProvider : 'none',
    captchaSiteKey: form.captchaSiteKey.trim(),
  };
  if (form.captchaSecretKey.trim()) {
    payload.captchaSecretKey = form.captchaSecretKey.trim();
  }
  return payload;
}

async function save(): Promise<void> {
  if (!snapshot.value || !isDirty.value) return;

  const validationError = validateForm();
  if (validationError) {
    ElMessage.warning(validationError);
    return;
  }

  const ok = await confirmRiskyChanges();
  if (!ok) return;

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
        <h3 class="settings-panel__title">注册与登录</h3>
        <p class="settings-panel__desc">配置平台注册渠道、人机验证与登录方式</p>
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
      :class="{ 'settings-panel__form--muted': !form.registrationEnabled }"
    >
      <section class="settings-panel__section">
        <h4 class="settings-panel__section-title">注册</h4>

        <el-form-item label="开放用户注册">
          <el-switch v-model="form.registrationEnabled" />
          <span class="settings-panel__item-tip">关闭后所有前端注册入口不可用</span>
        </el-form-item>

        <el-form-item label="注册渠道">
          <el-radio-group
            v-model="form.registrationChannel"
            :disabled="!form.registrationEnabled"
          >
            <el-radio-button
              v-for="opt in registrationChannelOptions"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </el-radio-button>
          </el-radio-group>
          <p class="settings-panel__item-tip">
            {{
              registrationChannelOptions.find((o) => o.value === form.registrationChannel)?.hint
            }}
          </p>
        </el-form-item>
      </section>

      <el-divider />

      <section class="settings-panel__section">
        <h4 class="settings-panel__section-title">人机验证</h4>

        <el-form-item label="启用人机验证">
          <el-switch v-model="form.captchaEnabled" :disabled="!form.registrationEnabled" />
          <span class="settings-panel__item-tip">注册 / 登录提交前完成 CAPTCHA 校验</span>
        </el-form-item>

        <el-form-item label="验证提供商" :required="form.captchaEnabled">
          <el-select
            v-model="form.captchaProvider"
            class="settings-panel__input-wide"
            :disabled="!form.captchaEnabled || !form.registrationEnabled"
          >
            <el-option
              v-for="opt in captchaProviderOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
              :disabled="opt.value === 'none' && form.captchaEnabled"
            />
          </el-select>
          <span v-if="!form.captchaEnabled" class="settings-panel__item-tip">
            当前：{{ captchaProviderLabel }}
          </span>
        </el-form-item>

        <el-form-item label="Site Key" :required="form.captchaEnabled">
          <el-input
            v-model="form.captchaSiteKey"
            class="settings-panel__input-wide"
            placeholder="前端 widget 公钥"
            autocomplete="off"
            :disabled="!form.captchaEnabled || !form.registrationEnabled"
          />
        </el-form-item>

        <el-form-item label="Secret Key">
          <el-input
            v-model="form.captchaSecretKey"
            class="settings-panel__input-wide"
            type="password"
            show-password
            autocomplete="new-password"
            :disabled="!form.captchaEnabled || !form.registrationEnabled"
            :placeholder="
              form.captchaSecretConfigured ? '留空则不修改' : '服务端校验私钥（首次启用必填）'
            "
          />
          <span class="settings-panel__item-tip">
            Secret 状态：
            <el-tag
              size="small"
              :type="form.captchaSecretConfigured ? 'success' : 'info'"
              effect="light"
              round
            >
              {{ form.captchaSecretConfigured ? '已配置' : '未配置' }}
            </el-tag>
          </span>
        </el-form-item>
      </section>

      <el-divider />

      <section class="settings-panel__section">
        <h4 class="settings-panel__section-title">登录</h4>

        <el-form-item label="密码登录">
          <el-switch v-model="form.passwordLogin" />
          <span class="settings-panel__item-tip">关闭后无法使用用户名/邮箱 + 密码登录</span>
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

.settings-panel__form--muted :deep(.el-form-item:not(:first-child)) {
  opacity: 0.55;
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
