<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus, Refresh, Setting } from '@element-plus/icons-vue';

import PageHeader from '@/shared/ui/PageHeader.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import ChannelConfigDrawer from '../components/ChannelConfigDrawer.vue';
import {
  draftPaymentChannel,
  paymentChannelTemplates,
  paymentProviderCodes,
  PaymentProviderLabel,
  type PaymentChannel,
  type PaymentProviderCode,
} from '../model/paymentChannel.types';
import { getPaymentChannelPort } from '../services';
import { PaymentSceneLabel } from '../model/billingEnums';

const port = getPaymentChannelPort();
const channels = ref<PaymentChannel[]>([]);
const loading = ref(false);
const togglingCode = ref<PaymentProviderCode | null>(null);

const configDrawerVisible = ref(false);
const configTarget = ref<PaymentChannel | null>(null);

const createDialogVisible = ref(false);
const createCode = ref<PaymentProviderCode>('alipay');

const existingCodes = computed(() => new Set(channels.value.map((c) => c.code)));
const availableToCreate = computed(() =>
  paymentProviderCodes.filter((code) => !existingCodes.value.has(code)),
);
const canCreate = computed(() => availableToCreate.value.length > 0);

const providerColor: Record<PaymentProviderCode, string> = {
  alipay: '#1677ff',
  wechat_pay: '#07c160',
};

const providerBg: Record<PaymentProviderCode, string> = {
  alipay: '#e8f3ff',
  wechat_pay: '#e8f9ef',
};

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

function openCreate(): void {
  if (!canCreate.value) {
    ElMessage.warning('支付宝与微信支付渠道均已添加');
    return;
  }
  const next = availableToCreate.value[0];
  if (next) createCode.value = next;
  createDialogVisible.value = true;
}

function selectCreateCode(code: PaymentProviderCode): void {
  createCode.value = code;
}

function confirmCreate(): void {
  configTarget.value = draftPaymentChannel(createCode.value);
  createDialogVisible.value = false;
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
      description="管理平台接入的支付渠道，启用后用户可在充值时选择；点击配置按钮填写接入参数。"
    >
      <template #actions>
        <el-button :icon="Refresh" :loading="loading" @click="load()">刷新</el-button>
        <el-button type="primary" :icon="Plus" :disabled="!canCreate" @click="openCreate">
          创建渠道
        </el-button>
      </template>
    </PageHeader>

    <EmptyState
      v-if="!loading && channels.length === 0"
      title="暂无充值渠道"
      description="接入支付宝或微信支付后，用户可在充值时选择对应方式。"
    >
      <el-button type="primary" :icon="Plus" @click="openCreate">创建渠道</el-button>
    </EmptyState>

    <div v-else v-loading="loading" class="channel-grid">
      <el-card
        v-for="ch in channels"
        :key="ch.id"
        shadow="never"
        class="channel-card"
        :class="{ 'channel-card--inactive': !ch.isActive }"
      >
        <!-- 卡片头部 -->
        <div class="channel-card__header">
          <div
            class="channel-card__logo"
            :style="{ background: providerBg[ch.code], color: providerColor[ch.code] }"
          >
            <span class="channel-card__logo-text">{{ ch.name.charAt(0) }}</span>
          </div>
          <div class="channel-card__meta">
            <div class="channel-card__name">
              {{ PaymentProviderLabel[ch.code] }}
            </div>
            <div class="channel-card__code">code: {{ ch.code }}</div>
          </div>
          <div class="channel-card__badges">
            <el-tag
              :type="ch.isActive ? 'success' : 'info'"
              size="small"
              effect="light"
              round
            >
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
            <el-tag
              v-else
              type="warning"
              size="small"
              effect="plain"
              round
              style="margin-left: 4px"
            >
              待配置
            </el-tag>
          </div>
        </div>

        <!-- 描述 -->
        <p class="channel-card__desc">{{ ch.description }}</p>

        <!-- 支持场景 -->
        <div class="channel-card__scenes">
          <span class="channel-card__scenes-label">支持场景：</span>
          <template v-if="ch.supportedScenes.length > 0">
            <el-tag
              v-for="s in ch.supportedScenes"
              :key="s"
              size="small"
              type="info"
              effect="plain"
            >
              {{ (PaymentSceneLabel as Record<number, string>)[s] ?? `Scene ${s}` }}
            </el-tag>
          </template>
          <span v-else class="cell-muted">无限制</span>
        </div>

        <!-- 操作按钮 -->
        <div class="channel-card__footer">
          <el-button
            :icon="Setting"
            type="primary"
            plain
            size="small"
            @click="openConfig(ch)"
          >
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

    <el-dialog
      v-model="createDialogVisible"
      title="创建充值渠道"
      width="640px"
      destroy-on-close
      class="create-dialog"
    >
      <p class="create-dialog__hint">选择要接入的支付方式，创建后在配置页填写密钥与回调地址。</p>
      <div class="create-dialog__cards">
        <button
          v-for="code in availableToCreate"
          :key="code"
          type="button"
          class="pick-card"
          :class="{ 'pick-card--selected': createCode === code }"
          @click="selectCreateCode(code)"
        >
          <div class="pick-card__header">
            <div
              class="pick-card__logo"
              :style="{ background: providerBg[code], color: providerColor[code] }"
            >
              <span class="pick-card__logo-text">{{ paymentChannelTemplates[code].name.charAt(0) }}</span>
            </div>
            <div class="pick-card__meta">
              <div class="pick-card__name">{{ PaymentProviderLabel[code] }}</div>
              <div class="pick-card__code">code: {{ code }}</div>
            </div>
            <span v-if="createCode === code" class="pick-card__check" aria-hidden="true">✓</span>
          </div>
          <p class="pick-card__desc">{{ paymentChannelTemplates[code].description }}</p>
          <div class="pick-card__scenes">
            <span class="pick-card__scenes-label">支持场景：</span>
            <el-tag
              v-for="s in paymentChannelTemplates[code].supportedScenes"
              :key="s"
              size="small"
              type="info"
              effect="plain"
            >
              {{ (PaymentSceneLabel as Record<number, string>)[s] ?? `Scene ${s}` }}
            </el-tag>
          </div>
        </button>
      </div>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmCreate">下一步：配置</el-button>
      </template>
    </el-dialog>

    <!-- 配置抽屉 -->
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
.channel-card__desc {
  font-size: 13px;
  color: var(--el-text-color-regular);
  line-height: 1.7;
  margin: 0 0 12px;
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
.create-dialog__hint {
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  line-height: 1.6;
}
.create-dialog__cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}
.pick-card {
  display: block;
  width: 100%;
  padding: 16px;
  text-align: left;
  border: 2px solid var(--el-border-color);
  border-radius: 12px;
  background: var(--el-bg-color);
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
}
.pick-card:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
}
.pick-card--selected {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  box-shadow: 0 0 0 1px var(--el-color-primary-light-7);
}
.pick-card__header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}
.pick-card__logo {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.pick-card__logo-text {
  font-size: 18px;
  font-weight: 800;
}
.pick-card__meta {
  flex: 1;
  min-width: 0;
}
.pick-card__name {
  font-size: 15px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}
.pick-card__code {
  font-size: 12px;
  font-family: monospace;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
.pick-card__check {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--el-color-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
}
.pick-card__desc {
  margin: 0 0 10px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}
.pick-card__scenes {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
.pick-card__scenes-label {
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}
</style>
