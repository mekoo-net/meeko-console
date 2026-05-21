<script setup lang="ts">
import { ElMessage } from 'element-plus';
import { computed, nextTick, ref, unref } from 'vue';

import DataTableShell from '@/shared/ui/DataTableShell.vue';
import PageHeader from '@/shared/ui/PageHeader.vue';
import { confirmDanger } from '@/shared/composables/useConfirm';
import { formatDateTime } from '@/shared/lib/date';

import SmtpForm from '../components/SmtpForm.vue';
import { useSmtpList } from '../composables/useSmtpList';
import type { CreateSmtpPayload, UpdateSmtpPayload } from '../model/smtpProvider.types';
import { getNoticeAdminPort } from '../services';

const list = useSmtpList();

const rows = computed(() => list.data.value ?? []);
const loading = computed(() => unref(list.loading));
const error = computed(() => unref(list.error));

const drawer = ref(false);
const drawerMode = ref<'create' | 'edit'>('create');
const editingId = ref<string | null>(null);
const formRef = ref<InstanceType<typeof SmtpForm> | null>(null);

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

async function onSubmit(payload: CreateSmtpPayload | UpdateSmtpPayload): Promise<void> {
  const port = getNoticeAdminPort();
  if (drawerMode.value === 'create') {
    const r = await port.createSmtpProvider(payload as CreateSmtpPayload);
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
  const r = await port.updateSmtpProvider(id, payload as UpdateSmtpPayload);
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
    title: '删除 SMTP',
    message: '确定删除该 SMTP 渠道配置吗？',
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
  const r = await getNoticeAdminPort().testSmtpProvider(id, {
    recipient: 'qa@example.com',
    subject: 'Meeko SMTP Test',
    body: 'hello',
  });
  if (r.success) {
    ElMessage.success(`测试完成：${r.data.success ? '成功' : '失败'}（${r.data.elapsedMs}ms）`);
  } else {
    ElMessage.error(r.error.message);
  }
}
</script>

<template>
  <div>
    <PageHeader title="SMTP 渠道" description="管理发信 SMTP（口令不落日志；Mock 仅存占位）">
      <template #actions>
        <el-button type="primary" @click="openCreate">新建</el-button>
        <el-button @click="list.run()">刷新</el-button>
      </template>
    </PageHeader>

    <DataTableShell
      :loading="loading"
      :error="error"
      :items="rows"
      empty-title="暂无 SMTP"
    >
      <el-table :data="rows" stripe style="width: 100%">
        <el-table-column prop="name" label="名称" min-width="140" />
        <el-table-column label="主机" min-width="200">
          <template #default="{ row }">{{ row.host }}:{{ row.port }}</template>
        </el-table-column>
        <el-table-column prop="fromAddress" label="发件邮箱" min-width="180" />
        <el-table-column label="默认" width="88">
          <template #default="{ row }">
            <el-tag v-if="row.isDefault" type="success" round>是</el-tag>
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

    <el-drawer v-model="drawer" :title="drawerMode === 'create' ? '新建 SMTP' : '编辑 SMTP'" size="520px">
      <SmtpForm
        ref="formRef"
        :mode="drawerMode"
        :initial="editingRow"
        @submit="onSubmit"
      />
    </el-drawer>
  </div>
</template>
