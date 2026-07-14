<script setup lang="ts">
import { computed, reactive, watch } from 'vue';

import type {
  CreateStorageBackendPayload,
  StorageBackendDto,
  UpdateStorageBackendPayload,
} from '../model/storageBackend.types';

type Mode = 'create' | 'edit';

const props = defineProps<{
  mode: Mode;
  initial?: StorageBackendDto | null;
}>();

const emit = defineEmits<{
  submit: [value: CreateStorageBackendPayload | UpdateStorageBackendPayload];
}>();

const form = reactive({
  name: '',
  providerType: 'aliyun-oss' as 'local' | 'aliyun-oss',
  endpoint: '',
  region: '',
  bucket: '',
  publicEndpoint: '',
  cdnStaticBaseUrl: '',
  cdnStoreBaseUrl: '',
  accessKeyId: '',
  accessKeySecret: '',
  localRoot: 'data/storage',
  isActive: true,
  isDefault: false,
});

const isLocal = computed(() => form.providerType === 'local');
const isOss = computed(() => form.providerType === 'aliyun-oss');

watch(
  () => props.initial,
  (row) => {
    if (!row) return;
    form.name = row.name;
    form.providerType = row.providerType;
    form.endpoint = row.endpoint;
    form.region = row.region;
    form.bucket = row.bucket;
    form.publicEndpoint = row.publicEndpoint ?? '';
    form.cdnStaticBaseUrl = row.cdnStaticBaseUrl ?? '';
    form.cdnStoreBaseUrl = row.cdnStoreBaseUrl ?? '';
    form.accessKeyId = row.accessKeyId;
    form.accessKeySecret = '';
    form.localRoot = row.localRoot ?? 'data/storage';
    form.isActive = row.isActive;
    form.isDefault = row.isDefault;
  },
  { immediate: true },
);

function onSubmit(): void {
  const base = {
    name: form.name,
    providerType: form.providerType,
    endpoint: isLocal.value ? 'local' : form.endpoint,
    region: isLocal.value ? 'local' : form.region,
    bucket: isLocal.value ? 'local' : form.bucket,
    publicEndpoint: form.publicEndpoint || undefined,
    cdnStaticBaseUrl: form.cdnStaticBaseUrl || undefined,
    cdnStoreBaseUrl: form.cdnStoreBaseUrl || undefined,
    accessKeyId: isLocal.value ? 'local' : form.accessKeyId,
    localRoot: isLocal.value ? form.localRoot || undefined : undefined,
    isActive: form.isActive,
    isDefault: form.isDefault,
  };

  if (props.mode === 'create') {
    const payload: CreateStorageBackendPayload = {
      ...base,
      accessKeySecret: form.accessKeySecret || undefined,
    };
    emit('submit', payload);
    return;
  }

  const payload: UpdateStorageBackendPayload = {
    ...base,
    accessKeySecret: form.accessKeySecret ? form.accessKeySecret : undefined,
  };
  emit('submit', payload);
}

defineExpose({
  resetCreate(): void {
    form.name = '';
    form.providerType = 'aliyun-oss';
    form.endpoint = '';
    form.region = '';
    form.bucket = '';
    form.publicEndpoint = '';
    form.cdnStaticBaseUrl = '';
    form.cdnStoreBaseUrl = '';
    form.accessKeyId = '';
    form.accessKeySecret = '';
    form.localRoot = 'data/storage';
    form.isActive = true;
    form.isDefault = false;
  },
});
</script>

<template>
  <el-form label-width="120px" class="storage-form">
    <el-form-item label="名称" required>
      <el-input v-model="form.name" />
    </el-form-item>
    <el-form-item label="类型" required>
      <el-select v-model="form.providerType" style="width: 100%">
        <el-option label="阿里云 OSS" value="aliyun-oss" />
        <el-option label="本地磁盘" value="local" />
      </el-select>
    </el-form-item>

    <template v-if="isOss">
      <el-form-item label="Endpoint" required>
        <el-input v-model="form.endpoint" placeholder="oss-cn-hangzhou.aliyuncs.com" />
      </el-form-item>
      <el-form-item label="Region" required>
        <el-input v-model="form.region" placeholder="cn-hangzhou" />
      </el-form-item>
      <el-form-item label="Bucket" required>
        <el-input v-model="form.bucket" />
      </el-form-item>
      <el-form-item label="AccessKey ID" required>
        <el-input v-model="form.accessKeyId" autocomplete="off" />
      </el-form-item>
      <el-form-item label="AccessKey Secret">
        <el-input
          v-model="form.accessKeySecret"
          type="password"
          show-password
          autocomplete="new-password"
          :placeholder="mode === 'edit' ? '留空则保留原值' : '必填'"
        />
        <div v-if="mode === 'edit' && initial?.accessKeySecretConfigured" class="hint">
          已配置密钥
        </div>
      </el-form-item>
      <el-form-item label="公网 Endpoint">
        <el-input v-model="form.publicEndpoint" placeholder="Platform AP 外网 endpoint" />
      </el-form-item>
      <el-form-item label="Static CDN">
        <el-input
          v-model="form.cdnStaticBaseUrl"
          placeholder="https://static.oss.meeyo.org"
        />
        <div class="hint">头像等 static 资源，对应 OSS <code>static/</code> 前缀</div>
      </el-form-item>
      <el-form-item label="Store CDN">
        <el-input
          v-model="form.cdnStoreBaseUrl"
          placeholder="https://store.oss.meeyo.org"
        />
        <div class="hint">聊天媒体等 store 资源，对应 OSS <code>store/</code> 前缀，需 URL 鉴权</div>
      </el-form-item>
    </template>

    <template v-if="isLocal">
      <el-form-item label="本地根目录" required>
        <el-input v-model="form.localRoot" placeholder="data/storage" />
      </el-form-item>
      <el-form-item label="Static 基址" required>
        <el-input
          v-model="form.cdnStaticBaseUrl"
          placeholder="http://localhost:7000/api/storage/files"
        />
      </el-form-item>
      <el-form-item label="Store 基址">
        <el-input
          v-model="form.cdnStoreBaseUrl"
          placeholder="留空则与 Static 基址相同"
        />
      </el-form-item>
    </template>

    <el-form-item label="启用">
      <el-switch v-model="form.isActive" />
    </el-form-item>
    <el-form-item label="默认">
      <el-switch v-model="form.isDefault" />
    </el-form-item>
    <el-form-item>
      <el-button type="primary" @click="onSubmit">{{ mode === 'create' ? '创建' : '保存' }}</el-button>
    </el-form-item>
  </el-form>
</template>

<style scoped>
.storage-form {
  max-width: 560px;
}

.hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
