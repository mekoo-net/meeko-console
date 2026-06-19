<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Refresh, Setting, Plus, Delete } from '@element-plus/icons-vue';

import PageHeader from '@/shared/ui/PageHeader.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import ChannelConfigDrawer from '../components/ChannelConfigDrawer.vue';
import { channelBg, channelColor, type ChannelType, type PaymentChannel } from '../model/paymentChannel.types';
import { getPaymentChannelPort } from '../services';

const port = getPaymentChannelPort();
const channels = ref<PaymentChannel[]>([]);
const types = ref<ChannelType[]>([]);
const loading = ref(false);
const togglingId = ref<number | null>(null);

const configDrawerVisible = ref(false);
const configTarget = ref<PaymentChannel | null>(null);

// 新建渠道对话框
const createVisible = ref(false);
const createDriver = ref<string>('');
const createName = ref<string>('');
const creating = ref(false);

const allowMultipleByDriver = computed<Record<string, boolean>>(() =>
  Object.fromEntries(types.value.map((t) => [t.code, t.allowMultiple])),
);

function canDelete(ch: PaymentChannel): boolean {
  return allowMultipleByDriver.value[ch.driverCode] !== false;
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    const [chRes, typeRes] = await Promise.all([port.listChannels(), port.listChannelTypes()]);
    if (chRes.success) channels.value = chRes.data;
    if (typeRes.success) types.value = typeRes.data;
  } finally {
    loading.value = false;
  }
}

async function toggle(ch: PaymentChannel): Promise<void> {
  togglingId.value = ch.id;
  try {
    const r = await port.setActive(ch.id, !ch.isActive);
    if (r.success) {
      const idx = channels.value.findIndex((c) => c.id === ch.id);
      if (idx >= 0) channels.value[idx] = r.data;
      ElMessage.success(`渠道「${ch.name}」已${r.data.isActive ? '启用' : '停用'}`);
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    togglingId.value = null;
  }
}

function openConfig(ch: PaymentChannel): void {
  configTarget.value = ch;
  configDrawerVisible.value = true;
}

function onConfigSaved(): void {
  void load();
}

function openCreate(): void {
  createDriver.value = types.value[0]?.code ?? '';
  createName.value = '';
  createVisible.value = true;
}

async function submitCreate(): Promise<void> {
  if (!createDriver.value) {
    ElMessage.warning('请选择支付类型');
    return;
  }
  if (!createName.value.trim()) {
    ElMessage.warning('请输入渠道名称');
    return;
  }
  creating.value = true;
  try {
    const r = await port.createChannel(createDriver.value, createName.value.trim());
    if (r.success) {
      ElMessage.success(`渠道「${r.data.name}」已创建`);
      createVisible.value = false;
      await load();
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    creating.value = false;
  }
}

async function remove(ch: PaymentChannel): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除渠道「${ch.name}」吗？此操作不可恢复。`, '删除渠道', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    });
  } catch {
    return;
  }
  const r = await port.deleteChannel(ch.id);
  if (r.success) {
    ElMessage.success(`渠道「${ch.name}」已删除`);
    await load();
  } else {
    ElMessage.error(r.error.message);
  }
}

onMounted(() => void load());
</script>

<template>
  <div class="page">
    <PageHeader
      title="充值渠道"
      description="为支付类型创建渠道实例（同一类型可建多套），配置密钥并启用后，用户充值时即可选择。"
    >
      <template #actions>
        <el-button :icon="Refresh" :loading="loading" @click="load()">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate()">新建渠道</el-button>
      </template>
    </PageHeader>

    <EmptyState
      v-if="!loading && channels.length === 0"
      title="暂无充值渠道"
      description="点击「新建渠道」选择支付类型并创建一个实例。"
    />

    <div v-else v-loading="loading" class="channel-grid">
      <el-card
        v-for="ch in channels"
        :key="ch.id"
        shadow="never"
        class="channel-card"
        :class="{ 'channel-card--inactive': !ch.isActive }"
      >
        <div class="channel-card__header">
          <div
            class="channel-card__logo"
            :style="{ background: channelBg(ch.driverCode), color: channelColor(ch.driverCode) }"
          >
            <span class="channel-card__logo-text">{{ ch.name.charAt(0) }}</span>
          </div>
          <div class="channel-card__meta">
            <div class="channel-card__name">{{ ch.name }}</div>
            <div class="channel-card__code">{{ ch.driverName ?? ch.driverCode }} · #{{ ch.id }}</div>
          </div>
          <div class="channel-card__badges">
            <el-tag :type="ch.isActive ? 'success' : 'info'" size="small" effect="light" round>
              {{ ch.isActive ? '已启用' : '已停用' }}
            </el-tag>
            <el-tag
              v-if="ch.isConfigured"
              type="primary"
              size="small"
              effect="light"
              round
              style="margin-left: 4px"
            >
              已配置
            </el-tag>
            <el-tag v-else type="warning" size="small" effect="plain" round style="margin-left: 4px">
              待配置
            </el-tag>
          </div>
        </div>

        <div class="channel-card__scenes">
          <span class="channel-card__scenes-label">支持场景：</span>
          <template v-if="ch.supportedScenes.length > 0">
            <el-tag v-for="s in ch.supportedScenes" :key="s" size="small" type="info" effect="plain">
              {{ s }}
            </el-tag>
          </template>
          <span v-else class="cell-muted">无</span>
        </div>

        <div class="channel-card__footer">
          <el-button
            v-if="canDelete(ch)"
            :icon="Delete"
            type="danger"
            plain
            size="small"
            @click="remove(ch)"
          >
            删除
          </el-button>
          <div style="flex: 1" />
          <el-button :icon="Setting" type="primary" plain size="small" @click="openConfig(ch)">
            配置
          </el-button>
          <el-button
            :type="ch.isActive ? 'warning' : 'success'"
            plain
            size="small"
            :loading="togglingId === ch.id"
            @click="toggle(ch)"
          >
            {{ ch.isActive ? '停用' : '启用' }}
          </el-button>
        </div>
      </el-card>
    </div>

    <ChannelConfigDrawer
      v-model:visible="configDrawerVisible"
      :channel="configTarget"
      @saved="onConfigSaved"
    />

    <el-dialog v-model="createVisible" title="新建充值渠道" width="460px">
      <el-form label-position="top">
        <el-form-item label="支付类型" required>
          <el-select v-model="createDriver" placeholder="选择支付类型" style="width: 100%">
            <el-option
              v-for="t in types"
              :key="t.code"
              :label="t.displayName"
              :value="t.code"
              :disabled="!t.allowMultiple && t.instanceCount > 0"
            >
              <span>{{ t.displayName }}</span>
              <span v-if="!t.allowMultiple && t.instanceCount > 0" class="cell-muted" style="float: right">
                单例（已创建）
              </span>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="渠道名称" required>
          <el-input v-model="createName" placeholder="如：支付宝-主账户" maxlength="64" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="submitCreate()">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.channel-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  gap: 16px;
}
.channel-card {
  border-radius: 12px;
  transition: opacity 0.2s, box-shadow 0.2s;
}
.channel-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}
.channel-card--inactive {
  opacity: 0.6;
}
.channel-card__header {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 14px;
}
.channel-card__logo {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.channel-card__logo-text {
  font-size: 22px;
  font-weight: 800;
}
.channel-card__meta {
  flex: 1;
  min-width: 0;
}
.channel-card__name {
  font-size: 16px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}
.channel-card__code {
  font-size: 12px;
  font-family: monospace;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
.channel-card__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}
.channel-card__scenes {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 16px;
  font-size: 13px;
}
.channel-card__scenes-label {
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}
.channel-card__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 12px;
}
.cell-muted {
  color: var(--el-text-color-placeholder);
}
</style>
