<script setup lang="ts">
import { reactive, ref } from 'vue';
import type { FormInstance, FormRules } from 'element-plus';

import type { CreateIamUserPayload } from '../model/validators';
import { iamUserRoleValues } from '../model/iamUser.types';

const emit = defineEmits<{
  (e: 'submit', payload: CreateIamUserPayload): void;
  (e: 'cancel'): void;
}>();

defineProps<{ submitting: boolean }>();

const formEl = ref<FormInstance>();

const form = reactive<CreateIamUserPayload>({
  username: '',
  email: '',
  displayName: '',
  password: '',
  roleName: 'Member',
});

const rules: FormRules<CreateIamUserPayload> = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { pattern: /^[A-Za-z0-9._-]+$/, message: '仅允许字母、数字、下划线、横线、点', trigger: 'blur' },
    { min: 2, max: 64, message: '长度 2 - 64 个字符', trigger: 'blur' },
  ],
  email: [{ type: 'email', message: '邮箱格式不正确', trigger: 'blur' }],
  displayName: [{ required: true, message: '请输入显示名', trigger: 'blur' }],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 8, max: 128, message: '密码长度 8 - 128 位', trigger: 'blur' },
  ],
  roleName: [{ required: true, message: '请选择角色', trigger: 'change' }],
};

async function onSubmit(): Promise<void> {
  const el = formEl.value;
  if (!el) return;
  try {
    await el.validate();
    emit('submit', { ...form });
  } catch {
    /* 验证失败，表单内已显示错误 */
  }
}
</script>

<template>
  <el-form ref="formEl" :model="form" :rules="rules" label-position="top">
    <el-form-item label="用户名" prop="username">
      <el-input v-model="form.username" autocomplete="off" placeholder="例如 alice" />
    </el-form-item>
    <el-form-item label="显示名" prop="displayName">
      <el-input v-model="form.displayName" placeholder="组内昵称" />
    </el-form-item>
    <el-form-item label="邮箱（可选）" prop="email">
      <el-input v-model="form.email" placeholder="alice@example.com" />
    </el-form-item>
    <el-form-item label="角色" prop="roleName">
      <el-radio-group v-model="form.roleName">
        <el-radio-button v-for="r in iamUserRoleValues" :key="r" :label="r" :value="r">
          {{ r }}
        </el-radio-button>
      </el-radio-group>
    </el-form-item>
    <el-form-item label="初始密码" prop="password">
      <el-input
        v-model="form.password"
        type="password"
        show-password
        autocomplete="new-password"
        placeholder="≥8 位，字母+数字"
      />
    </el-form-item>

    <div class="form-actions">
      <el-button @click="emit('cancel')">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="onSubmit">创建子账号</el-button>
    </div>
  </el-form>
</template>

<style scoped>
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 8px;
}
</style>
