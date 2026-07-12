<script setup lang="ts">
import { ElMessage } from 'element-plus';
import { computed, nextTick, ref, unref } from 'vue';

import DataTableShell from '@/shared/ui/DataTableShell.vue';
import PageHeader from '@/shared/ui/PageHeader.vue';
import { confirmDanger } from '@/shared/composables/useConfirm';
import { formatDateTime } from '@/shared/lib/date';

import StorageBackendForm from '../components/StorageBackendForm.vue';
import { useStorageBackends } from '../composables/useStorageBackends';
import type { CreateStorageBackendPayload, UpdateStorageBackendPayload } from '../model/storageBackend.types';
import { getStorageAdminPort } from '../services';

const list = useStorageBackends();

const rows = computed(() => list.data.value ?? []);
const loading = computed(() => unref(list.loading));
const error = computed(() => unref(list.error));

const drawer = ref(false);
const drawerMode = ref<'create' | 'edit'>('create');
const editingId = ref<string | null>(null);
const formRef = ref<InstanceType<typeof StorageBackendForm> | null>(null);

function providerLabel(type: string): string {
  return type === 'local' ? '本地磁盘' : type === 'aliyun-oss' ? '阿里云 OSS' : type;
}

async function openCreate(): Promise<void> {
  drawerMode.value = 'create';
  editingId.value = null;
  drawer.value = true;
  await nextTick();
  formRef.value?.resetCreate();
}

function openEdit(id: string): void {
  drawerMode.value = 'edit';
  editingId.value = id;
  drawer.value = true;
}

const editingRow = computed(() => rows.value.find((r) => r.id === editingId.value) ?? null);

async function onSubmit(payload: CreateStorageBackendPayload | UpdateStorageBackendPayload): Promise<void> {
  const port = getStorageAdminPort();
  if (drawerMode.value === 'create') {
    const r = await port.createBackend(payload as CreateStorageBackendPayload);
    if (r.success) {
      ElMessage.success('已创建');
      drawer.value = false;
      void list.run();
    } else {
      ElMessage.error(r.error.message);
    }
    return;
  }
  const id = editingId.value;
  if (!id) return;
  const r = await port.updateBackend(id, payload as UpdateStorageBackendPayload);
  if (r.success) {
    ElMessage.success('已保存');
    drawer.value = false;
    void list.run();
  } else {
    ElMessage.error(r.error.message);
  }
}

async function onDelete(id: string): Promise<void> {
  const ok = await confirmDanger({
    title: '删除存储后端',
    message: '确定删除该存储后端配置吗？',
    type: 'danger',
  });
  if (!ok) return;
  const r = await list.remove(id);
  if (r.success) {
    ElMessage.success('已删除');
    void list.run();
  } else {
    ElMessage.error(r.error.message);
  }
}

async function onTest(id: string): Promise<void> {
  const r = await getStorageAdminPort().testBackend(id);
  if (r.success) {
    ElMessage.success(`测试完成：${r.data.success ? '成功' : '失败'}（${r.data.elapsedMs}ms）`);
  } else {
    ElMessage.error(r.error.message);
  }
}
</script>

<template>
  <div>
    <PageHeader title="存储设置" description="管理平台对象存储后端（密钥仅存服务端）">
      <template #actions>
        <el-button type="primary" @click="openCreate">新建</el-button>
        <el-button @click="list.run()">刷新</el-button>
      </template>
    </PageHeader>

    <DataTableShell
      :loading="loading"
      :error="error"
      :items="rows"
      empty-title="暂无存储后端"
    >
      <el-table :data="rows" stripe style="width: 100%">
        <el-table-column prop="name" label="名称" min-width="140" />
        <el-table-column label="类型" min-width="120">
          <template #default="{ row }">{{ providerLabel(row.providerType) }}</template>
        </el-table-column>
        <el-table-column prop="bucket" label="Bucket" min-width="140" />
        <el-table-column label="默认" width="88">
          <template #default="{ row }">
            <el-tag v-if="row.isDefault" type="success" round>是</el-tag>
            <span v-else>否</span>
          </template>
        </el-table-column>
        <el-table-column label="启用" width="88">
          <template #default="{ row }">
            <el-tag v-if="row.isActive" type="success" round>是</el-tag>
            <span v-else>否</span>
          </template>
        </el-table-column>
        <el-table-column label="更新时间">
          <template #default="{ row }">{{ formatDateTime(row.updatedAtUtc) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row.id)">编辑</el-button>
            <el-button link @click="onTest(row.id)">测试</el-button>
            <el-button link type="danger" @click="onDelete(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </DataTableShell>

    <el-drawer
      v-model="drawer"
      :title="drawerMode === 'create' ? '新建存储后端' : '编辑存储后端'"
      size="560px"
    >
      <StorageBackendForm
        ref="formRef"
        :mode="drawerMode"
        :initial="editingRow"
        @submit="onSubmit"
      />
    </el-drawer>
  </div>
</template>
