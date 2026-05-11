<script setup lang="ts">
import { reactive, watch } from 'vue';

import type { CreateSmtpPayload, SmtpProviderDto, UpdateSmtpPayload } from '../model/smtpProvider.types';

type Mode = 'create' | 'edit';

const props = defineProps<{
  mode: Mode;
  /** 编辑模式下的初始行（不含口令）。 */
  initial?: SmtpProviderDto | null;
}>();

const emit = defineEmits<{
  submit: [value: CreateSmtpPayload | UpdateSmtpPayload];
}>();

const form = reactive({
  name: '',
  host: '',
  port: 587,
  username: '',
  password: '',
  useStartTls: true,
  fromAddress: '',
  fromName: '',
  isActive: true,
  isDefault: false,
  priority: 10,
});

watch(
  () => props.initial,
  (row) => {
    if (!row) return;
    form.name = row.name;
    form.host = row.host;
    form.port = row.port;
    form.username = row.username ?? '';
    form.password = '';
    form.useStartTls = row.useStartTls;
    form.fromAddress = row.fromAddress;
    form.fromName = row.fromName;
    form.isActive = row.isActive;
    form.isDefault = row.isDefault;
    form.priority = row.priority;
  },
  { immediate: true },
);

function onSubmit(): void {
  if (props.mode === 'create') {
    const payload: CreateSmtpPayload = {
      name: form.name,
      host: form.host,
      port: form.port,
      username: form.username || undefined,
      password: form.password || undefined,
      useStartTls: form.useStartTls,
      fromAddress: form.fromAddress,
      fromName: form.fromName,
      isActive: form.isActive,
      isDefault: form.isDefault,
      priority: form.priority,
    };
    emit('submit', payload);
    return;
  }
  const payload: UpdateSmtpPayload = {
    name: form.name,
    host: form.host,
    port: form.port,
    username: form.username || undefined,
    password: form.password ? form.password : undefined,
    useStartTls: form.useStartTls,
    fromAddress: form.fromAddress,
    fromName: form.fromName,
    isActive: form.isActive,
    isDefault: form.isDefault,
    priority: form.priority,
  };
  emit('submit', payload);
}

defineExpose({
  /** 供父级重置创建表单 */
  resetCreate(): void {
    form.name = '';
    form.host = '';
    form.port = 587;
    form.username = '';
    form.password = '';
    form.useStartTls = true;
    form.fromAddress = '';
    form.fromName = '';
    form.isActive = true;
    form.isDefault = false;
    form.priority = 10;
  },
});
</script>

<template>
  <el-form label-width="112px" class="smtp-form">
    <el-form-item label="名称" required>
      <el-input v-model="form.name" />
    </el-form-item>
    <el-form-item label="主机" required>
      <el-input v-model="form.host" />
    </el-form-item>
    <el-form-item label="端口" required>
      <el-input-number v-model="form.port" :min="1" :max="65535" />
    </el-form-item>
    <el-form-item label="用户名">
      <el-input v-model="form.username" autocomplete="off" />
    </el-form-item>
    <el-form-item label="口令">
      <el-input
        v-model="form.password"
        type="password"
        show-password
        autocomplete="new-password"
        :placeholder="mode === 'edit' ? '留空则保留原值' : '可选'"
      />
    </el-form-item>
    <el-form-item label="STARTTLS">
      <el-switch v-model="form.useStartTls" />
    </el-form-item>
    <el-form-item label="发件邮箱" required>
      <el-input v-model="form.fromAddress" />
    </el-form-item>
    <el-form-item label="发件名称" required>
      <el-input v-model="form.fromName" />
    </el-form-item>
    <el-form-item label="启用">
      <el-switch v-model="form.isActive" />
    </el-form-item>
    <el-form-item label="默认">
      <el-switch v-model="form.isDefault" />
    </el-form-item>
    <el-form-item label="优先级">
      <el-input-number v-model="form.priority" :min="0" :max="999" />
    </el-form-item>
    <el-form-item>
      <el-button type="primary" @click="onSubmit">{{ mode === 'create' ? '创建' : '保存' }}</el-button>
    </el-form-item>
  </el-form>
</template>

<style scoped>
.smtp-form {
  max-width: 520px;
}
</style>
