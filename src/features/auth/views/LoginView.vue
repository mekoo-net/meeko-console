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

const form = reactive<LoginForm>({ username: 'admin', password: 'mock' });
const loading = ref(false);

async function submit(): Promise<void> {
  if (!form.username || !form.password) {
    ElMessage.warning('请输入用户名与密码');
    return;
  }
  loading.value = true;
  try {
    auth.login(form.username, form.password);
    ElMessage.success(`欢迎回来，${form.username}`);
    const redirect = (route.query.redirect as string | undefined) ?? '/accounts';
    await router.replace(redirect);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login">
    <div class="login__card">
      <div class="login__brand">
        <div class="login__logo">M</div>
        <div>
          <h1 class="login__title">Meeko 管理后台</h1>
          <p class="login__hint">Mock 模式：admin / owner / member 任选用户名快速登录。</p>
        </div>
      </div>
      <el-form label-position="top" @submit.prevent="submit">
        <el-form-item label="用户名">
          <el-input v-model="form.username" autocomplete="username" placeholder="admin" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" type="password" autocomplete="current-password" show-password />
        </el-form-item>
        <el-button type="primary" native-type="submit" :loading="loading" class="login__submit">
          登录
        </el-button>
      </el-form>
      <div class="login__tips">
        <span>角色示例：</span>
        <el-tag size="small" type="danger" effect="light" round>admin → Admin</el-tag>
        <el-tag size="small" effect="light" round>owner → Owner</el-tag>
        <el-tag size="small" type="info" effect="light" round>其他 → Member</el-tag>
      </div>
    </div>
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
.login__submit {
  width: 100%;
  margin-top: 4px;
}
.login__tips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 16px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
