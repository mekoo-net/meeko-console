<script setup lang="ts">
import { ElMessage } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { computed, nextTick, ref, unref } from 'vue';

import { confirmDanger } from '@/shared/composables/useConfirm';
import { formatDateTime } from '@/shared/lib/date';

import SmtpForm from '../components/SmtpForm.vue';
import { useSmtpList } from '../composables/useSmtpList';
import type { CreateSmtpPayload, SmtpProviderDto, UpdateSmtpPayload } from '../model/smtpProvider.types';
import { getNoticeAdminPort } from '../services';

const list = useSmtpList();

const rows = computed(() => list.data.value ?? []);
const loading = computed(() => unref(list.loading));

const drawer = ref(false);
const drawerMode = ref<'create' | 'edit'>('create');
const editingId = ref<string | null>(null);
const testingId = ref<string | null>(null);
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
      ElMessage.success('渠道已创建');
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

async function onDelete(row: SmtpProviderDto): Promise<void> {
  const ok = await confirmDanger({
    title: `删除渠道「${row.name}」`,
    message: '删除后该渠道关联的模板将回退使用默认渠道，确定继续？',
    type: 'danger',
  });
  if (!ok) return;
  const r = await list.remove(row.id);
  if (r.success) {
    ElMessage.success('已删除');
    void list.run();
  } else {
    ElMessage.error(r.error.message);
  }
}

async function onTest(id: string): Promise<void> {
  testingId.value = id;
  try {
    const r = await getNoticeAdminPort().testSmtpProvider(id, {
      recipient: 'qa@example.com',
      subject: 'Meeko SMTP Test',
      body: 'hello',
    });
    if (r.success) {
      ElMessage.success(
        r.data.success
          ? `连通测试成功（${r.data.elapsedMs}ms）`
          : `测试失败：${r.data.failureMessage ?? '未知错误'}`,
      );
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    testingId.value = null;
  }
}

function providerIcon(row: SmtpProviderDto): string {
  const host = row.host.toLowerCase();
  if (host.includes('sendgrid')) return '📨';
  if (host.includes('mailgun')) return '📬';
  if (host.includes('ses') || host.includes('amazonaws')) return '☁️';
  if (host.includes('postmark')) return '📮';
  if (host.includes('resend')) return '⚡';
  return '✉️';
}

</script>

<template>
  <div class="channels-view">
    <!-- 页头 -->
    <div class="channels-view__header">
      <div class="channels-view__header-text">
        <h2 class="channels-view__title">渠道配置</h2>
        <p class="channels-view__desc">配置 SMTP 发信渠道，不同模板可绑定不同渠道，实现主备分流投递。</p>
      </div>
      <div class="channels-view__actions">
        <el-button @click="list.run()">刷新</el-button>
        <el-button type="primary" @click="openCreate">
          <el-icon class="mr-1"><Plus /></el-icon>
          添加 SMTP 渠道
        </el-button>
      </div>
    </div>

    <!-- 渠道类型区块：邮件 -->
    <div class="channels-section">
      <div class="channels-section__label">
        <span class="channels-section__label-icon">✉️</span>
        <span>邮件渠道（SMTP）</span>
        <el-tag size="small" type="info" class="ml-2">{{ rows.length }} 个</el-tag>
      </div>

      <div v-if="loading" class="channels-grid--loading">
        <el-skeleton v-for="i in 3" :key="i" animated>
          <template #template>
            <div class="channel-card channel-card--skeleton">
              <el-skeleton-item variant="rect" style="height: 120px; border-radius: 8px" />
            </div>
          </template>
        </el-skeleton>
      </div>

      <div v-else-if="rows.length === 0" class="channels-empty">
        <el-empty description="暂无 SMTP 渠道，点击「添加 SMTP 渠道」开始配置">
          <el-button type="primary" @click="openCreate">添加 SMTP 渠道</el-button>
        </el-empty>
      </div>

      <div v-else class="channels-grid">
        <div
          v-for="row in rows"
          :key="row.id"
          class="channel-card"
          :class="{ 'channel-card--inactive': !row.isActive }"
        >
          <!-- 卡片顶部 -->
          <div class="channel-card__top">
            <div class="channel-card__icon-wrap">
              <span class="channel-card__icon">{{ providerIcon(row) }}</span>
            </div>
            <div class="channel-card__badges">
              <el-tag v-if="row.isDefault" type="warning" size="small" effect="light" round>默认</el-tag>
              <el-tag :type="row.isActive ? 'success' : 'info'" size="small" effect="light" round>
                {{ row.isActive ? '启用' : '停用' }}
              </el-tag>
            </div>
          </div>

          <!-- 名称 -->
          <div class="channel-card__name">{{ row.name }}</div>

          <!-- 详情 -->
          <div class="channel-card__meta">
            <div class="channel-card__meta-item">
              <span class="channel-card__meta-label">主机</span>
              <span class="channel-card__meta-val">{{ row.host }}:{{ row.port }}</span>
            </div>
            <div class="channel-card__meta-item">
              <span class="channel-card__meta-label">发件人</span>
              <span class="channel-card__meta-val">{{ row.fromName }} &lt;{{ row.fromAddress }}&gt;</span>
            </div>
            <div class="channel-card__meta-item">
              <span class="channel-card__meta-label">加密</span>
              <span class="channel-card__meta-val">
                <el-tag size="small" type="success" effect="plain" v-if="row.useStartTls">STARTTLS</el-tag>
                <el-tag size="small" type="info" effect="plain" v-else>无</el-tag>
              </span>
            </div>
            <div class="channel-card__meta-item">
              <span class="channel-card__meta-label">优先级</span>
              <span class="channel-card__meta-val">{{ row.priority }}</span>
            </div>
            <div class="channel-card__meta-item">
              <span class="channel-card__meta-label">更新</span>
              <span class="channel-card__meta-val">{{ formatDateTime(row.updatedAtUtc) }}</span>
            </div>
          </div>

          <!-- 操作 -->
          <div class="channel-card__footer">
            <el-button
              size="small"
              :loading="testingId === row.id"
              @click="onTest(row.id)"
            >
              连通测试
            </el-button>
            <div class="channel-card__footer-right">
              <el-button size="small" type="primary" link @click="openEdit(row.id)">编辑</el-button>
              <el-button size="small" type="danger" link @click="onDelete(row)">删除</el-button>
            </div>
          </div>
        </div>

        <!-- 添加渠道占位卡 -->
        <div class="channel-card channel-card--add" @click="openCreate">
          <el-icon :size="28" color="var(--el-text-color-placeholder)"><Plus /></el-icon>
          <span class="channel-card__add-text">添加 SMTP 渠道</span>
        </div>
      </div>
    </div>

    <!-- 编辑抽屉 -->
    <el-drawer
      v-model="drawer"
      :title="drawerMode === 'create' ? '添加 SMTP 渠道' : '编辑 SMTP 渠道'"
      size="520px"
      destroy-on-close
    >
      <SmtpForm
        ref="formRef"
        :mode="drawerMode"
        :initial="editingRow"
        @submit="onSubmit"
      />
    </el-drawer>
  </div>
</template>

<style scoped>
.channels-view {
  padding: 0;
}

.channels-view__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 28px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.channels-view__title {
  margin: 0 0 4px;
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.channels-view__desc {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.channels-view__actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

/* 渠道区块 */
.channels-section {
  margin-bottom: 32px;
}

.channels-section__label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-regular);
  margin-bottom: 16px;
}

.channels-section__label-icon {
  font-size: 16px;
}

/* 卡片网格 */
.channels-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.channels-grid--loading {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

/* 单个渠道卡片 */
.channel-card {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  padding: 18px 20px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: box-shadow 0.2s, border-color 0.2s;
}

.channel-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  border-color: var(--el-border-color);
}

.channel-card--inactive {
  opacity: 0.65;
}

/* 添加卡片 */
.channel-card--add {
  border-style: dashed;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  min-height: 160px;
  gap: 10px;
  color: var(--el-text-color-placeholder);
  transition: background 0.2s, border-color 0.2s;
}

.channel-card--add:hover {
  background: var(--el-fill-color-light);
  border-color: var(--el-color-primary-light-5);
  color: var(--el-color-primary);
}

.channel-card__add-text {
  font-size: 13px;
}

/* 卡片顶部 */
.channel-card__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.channel-card__icon-wrap {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}

.channel-card__badges {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

/* 名称 */
.channel-card__name {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  line-height: 1.3;
}

/* Meta 信息 */
.channel-card__meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.channel-card__meta-item {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 12px;
}

.channel-card__meta-label {
  color: var(--el-text-color-placeholder);
  flex-shrink: 0;
  width: 44px;
}

.channel-card__meta-val {
  color: var(--el-text-color-regular);
  word-break: break-all;
}

/* 卡片底部操作 */
.channel-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 10px;
  border-top: 1px solid var(--el-border-color-lighter);
  margin-top: auto;
}

.channel-card__footer-right {
  display: flex;
  gap: 4px;
}

/* 通用辅助 */
.ml-2 {
  margin-left: 8px;
}

.mr-1 {
  margin-right: 4px;
}
</style>
