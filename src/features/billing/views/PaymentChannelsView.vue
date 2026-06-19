<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Refresh, Setting } from '@element-plus/icons-vue';

import PageHeader from '@/shared/ui/PageHeader.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import ChannelConfigDrawer from '../components/ChannelConfigDrawer.vue';
import { channelBg, channelColor, type PaymentChannel } from '../model/paymentChannel.types';
import { getPaymentChannelPort } from '../services';

const port = getPaymentChannelPort();
const channels = ref<PaymentChannel[]>([]);
const loading = ref(false);
const togglingCode = ref<string | null>(null);

const configDrawerVisible = ref(false);
const configTarget = ref<PaymentChannel | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const r = await port.listChannels();
    if (r.success) channels.value = r.data;
  } finally {
    loading.value = false;
  }
}

async function toggle(ch: PaymentChannel): Promise<void> {
  togglingCode.value = ch.code;
  try {
    const r = await port.setActive(ch.code, !ch.isActive);
    if (r.success) {
      const idx = channels.value.findIndex((c) => c.code === ch.code);
      if (idx >= 0) channels.value[idx] = r.data;
      ElMessage.success(`渠道「${ch.name}」已${r.data.isActive ? '启用' : '停用'}`);
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    togglingCode.value = null;
  }
}

function openConfig(ch: PaymentChannel): void {
  configTarget.value = ch;
  configDrawerVisible.value = true;
}

function onConfigSaved(): void {
  void load();
}

onMounted(() => void load());
</script>

<template>
  <div class="page">
    <PageHeader
      title="充值渠道"
      description="支付渠道由插件自动注册；配置密钥后启用，用户即可在充值时选择。"
    >
      <template #actions>
        <el-button :icon="Refresh" :loading="loading" @click="load()">刷新</el-button>
      </template>
    </PageHeader>

    <EmptyState
      v-if="!loading && channels.length === 0"
      title="暂无充值渠道"
      description="未检测到已注册的支付渠道插件。"
    />

    <div v-else v-loading="loading" class="channel-grid">
      <el-card
        v-for="ch in channels"
        :key="ch.code"
        shadow="never"
        class="channel-card"
        :class="{ 'channel-card--inactive': !ch.isActive }"
      >
        <div class="channel-card__header">
          <div
            class="channel-card__logo"
            :style="{ background: channelBg(ch.code), color: channelColor(ch.code) }"
          >
            <span class="channel-card__logo-text">{{ ch.name.charAt(0) }}</span>
          </div>
          <div class="channel-card__meta">
            <div class="channel-card__name">{{ ch.name }}</div>
            <div class="channel-card__code">code: {{ ch.code }}</div>
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
          <el-button :icon="Setting" type="primary" plain size="small" @click="openConfig(ch)">
            配置
          </el-button>
          <el-button
            :type="ch.isActive ? 'warning' : 'success'"
            plain
            size="small"
            :loading="togglingCode === ch.code"
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
  justify-content: flex-end;
  gap: 8px;
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 12px;
}
.cell-muted {
  color: var(--el-text-color-placeholder);
}
</style>
