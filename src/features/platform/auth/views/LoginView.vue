<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';

import { useAuthStore } from '@/stores/auth';

interface LoginForm {
  username: string;
  password: string;
}

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const form = reactive<LoginForm>({
  username: '',
  password: '',
});
const loading = ref(false);

const twoFaVisible = ref(false);
const challengeToken = ref('');
const twoFaCode = ref('');
const backupCode = ref('');
const useBackupCode = ref(false);
const twoFaLoading = ref(false);

async function redirectAfterLogin(): Promise<void> {
  ElMessage.success(`欢迎回来，${auth.displayName}`);
  const redirect = (route.query.redirect as string | undefined) ?? '/accounts';
  await router.replace(redirect);
}

async function submit(): Promise<void> {
  if (!form.username || !form.password) {
    ElMessage.warning('请输入用户名与密码');
    return;
  }
  loading.value = true;
  try {
    const result = await auth.login(form.username, form.password);
    if (!result.success) {
      ElMessage.error(result.error.message || '登录失败');
      return;
    }
    if (result.data.kind === 'twofa') {
      challengeToken.value = result.data.challengeToken;
      twoFaCode.value = '';
      backupCode.value = '';
      useBackupCode.value = false;
      twoFaVisible.value = true;
      return;
    }
    await redirectAfterLogin();
  } finally {
    loading.value = false;
  }
}

async function submitTwoFa(): Promise<void> {
  if (!challengeToken.value) {
    ElMessage.error('2FA 挑战已失效，请重新登录');
    twoFaVisible.value = false;
    return;
  }

  const code = twoFaCode.value.trim();
  const backup = backupCode.value.trim();
  if (!useBackupCode.value && code.length !== 6) {
    ElMessage.warning('请输入 6 位验证码');
    return;
  }
  if (useBackupCode.value && !backup) {
    ElMessage.warning('请输入备份码');
    return;
  }

  twoFaLoading.value = true;
  try {
    const result = await auth.verifyTwoFa(
      challengeToken.value,
      useBackupCode.value ? { backupCode: backup } : { code },
      form.username,
    );
    if (!result.success) {
      ElMessage.error(result.error.message || '2FA 验证失败');
      return;
    }
    twoFaVisible.value = false;
    await redirectAfterLogin();
  } finally {
    twoFaLoading.value = false;
  }
}

function closeTwoFa(): void {
  twoFaVisible.value = false;
  challengeToken.value = '';
  twoFaCode.value = '';
  backupCode.value = '';
}
</script>

<template>
  <div class="login">
    <div class="login__card">
      <div class="login__brand">
        <div class="login__logo">M</div>
        <div>
          <h1 class="login__title">Meeko 管理后台</h1>
          <p class="login__hint">使用 Staff 用户名与密码登录。</p>
        </div>
      </div>
      <el-form label-position="top" @submit.prevent="submit">
        <el-form-item label="用户名">
          <el-input v-model="form.username" autocomplete="username" placeholder="用户名" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" type="password" autocomplete="current-password" show-password />
        </el-form-item>
        <el-button type="primary" native-type="submit" :loading="loading" class="login__submit">
          登录
        </el-button>
      </el-form>
    </div>

    <el-dialog
      v-model="twoFaVisible"
      title="两步验证"
      width="400px"
      :close-on-click-modal="false"
      @close="closeTwoFa"
    >
      <p class="login__twofa-hint">
        该账号已启用 2FA，请输入身份验证器中的 6 位验证码。
      </p>

      <template v-if="!useBackupCode">
        <el-form label-position="top" @submit.prevent="submitTwoFa">
          <el-form-item label="验证码">
            <el-input
              v-model="twoFaCode"
              maxlength="6"
              inputmode="numeric"
              autocomplete="one-time-code"
              placeholder="000000"
              autofocus
            />
          </el-form-item>
        </el-form>
        <el-button link type="primary" @click="useBackupCode = true">使用备份码</el-button>
      </template>

      <template v-else>
        <el-form label-position="top" @submit.prevent="submitTwoFa">
          <el-form-item label="备份码">
            <el-input
              v-model="backupCode"
              autocomplete="off"
              placeholder="XXXX-XXXX"
              autofocus
            />
          </el-form-item>
        </el-form>
        <el-button link type="primary" @click="useBackupCode = false">使用验证码</el-button>
      </template>

      <template #footer>
        <el-button @click="closeTwoFa">取消</el-button>
        <el-button type="primary" :loading="twoFaLoading" @click="submitTwoFa">
          验证并登录
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.login {
  min-height: 100vh;
  background: linear-gradient(135deg, #eef2ff 0%, #f8fafc 50%, #ecfeff 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.login__card {
  width: 100%;
  max-width: 380px;
  background: #fff;
  border-radius: 16px;
  padding: 28px 28px 24px;
  box-shadow: 0 24px 60px -20px rgba(15, 23, 42, 0.18);
  border: 1px solid rgba(15, 23, 42, 0.04);
}
.login__brand {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 22px;
}
.login__logo {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: linear-gradient(135deg, #2563eb, #7c3aed);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 700;
}
.login__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.login__hint {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.login__twofa-hint {
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.login__submit {
  width: 100%;
  margin-top: 4px;
}
</style>
