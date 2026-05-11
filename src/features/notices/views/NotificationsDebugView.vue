<script setup lang="ts">
import { ElMessage } from 'element-plus';
import { reactive, ref } from 'vue';

import PageHeader from '@/shared/ui/PageHeader.vue';

import { NoticeChannelLabel, NoticePurposeLabel, OtpPurposeLabel } from '../model/noticeEnums';
import type { NoticeChannel, OtpPurpose } from '../model/noticeEnums';
import { getNotificationsPort } from '../services';

const sendNotify = reactive({
  channel: 'Email',
  purpose: 'Generic',
  recipient: '',
  templateCode: 'welcome',
  locale: 'zh-CN',
});

const sendOtpForm = reactive({
  purpose: 1 as OtpPurpose,
  channel: 1 as NoticeChannel,
  recipient: '',
  accountUid: '',
});

const verifyForm = reactive({
  purpose: 1 as OtpPurpose,
  channel: 1 as NoticeChannel,
  recipient: '',
  code: '',
});

const busy = ref(false);

async function sendNotification(): Promise<void> {
  busy.value = true;
  try {
    const r = await getNotificationsPort().sendNotification({
      channel: sendNotify.channel,
      purpose: sendNotify.purpose,
      recipient: sendNotify.recipient,
      templateCode: sendNotify.templateCode,
      locale: sendNotify.locale,
    });
    if (r.success) {
      ElMessage.success(`已投递（Mock）：${r.data.messageId} / ${r.data.status}`);
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    busy.value = false;
  }
}

async function sendOtp(): Promise<void> {
  busy.value = true;
  try {
    const r = await getNotificationsPort().sendOtp({
      purpose: sendOtpForm.purpose,
      channel: sendOtpForm.channel,
      recipient: sendOtpForm.recipient,
      accountUid: sendOtpForm.accountUid ? sendOtpForm.accountUid : undefined,
      locale: 'zh-CN',
    });
    if (r.success) {
      ElMessage.success(`OTP 已发送（Mock），audit=${r.data.auditUid}`);
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    busy.value = false;
  }
}

async function verifyOtp(): Promise<void> {
  busy.value = true;
  try {
    const r = await getNotificationsPort().verifyOtp({
      purpose: verifyForm.purpose,
      channel: verifyForm.channel,
      recipient: verifyForm.recipient,
      code: verifyForm.code,
    });
    if (r.success) {
      ElMessage.success(`校验结果：${r.data.status}，剩余 ${r.data.remainingAttempts} 次`);
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="debug">
    <PageHeader title="通知调试" description="调用 /api/notifications 与 OTP 端点的 Mock，不上真实网。" />

    <div class="debug__grid">
      <el-card shadow="never">
        <template #header>发送通知</template>
        <el-form label-width="112px">
          <el-form-item label="Channel">
            <el-input v-model="sendNotify.channel" placeholder="Email / 枚举名" />
          </el-form-item>
          <el-form-item label="Purpose">
            <el-input v-model="sendNotify.purpose" placeholder="Generic" />
          </el-form-item>
          <el-form-item label="收件人" required>
            <el-input v-model="sendNotify.recipient" />
          </el-form-item>
          <el-form-item label="模板代码">
            <el-input v-model="sendNotify.templateCode" />
          </el-form-item>
          <el-form-item label="语言">
            <el-input v-model="sendNotify.locale" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="busy" @click="sendNotification">发送</el-button>
          </el-form-item>
        </el-form>
        <p class="debug__hint">
          枚举参考：Channel {{ Object.entries(NoticeChannelLabel).map(([k, v]) => `${k}:${v}`).join('；') }}；
          Purpose {{ Object.entries(NoticePurposeLabel).map(([k, v]) => `${k}:${v}`).join('；') }}
        </p>
      </el-card>

      <el-card shadow="never">
        <template #header>发送 OTP</template>
        <el-form label-width="112px">
          <el-form-item label="用途">
            <el-select v-model="sendOtpForm.purpose" style="width: 100%">
              <el-option v-for="(label, k) in OtpPurposeLabel" :key="k" :label="label" :value="Number(k)" />
            </el-select>
          </el-form-item>
          <el-form-item label="渠道">
            <el-select v-model="sendOtpForm.channel" style="width: 100%">
              <el-option v-for="(label, k) in NoticeChannelLabel" :key="k" :label="label" :value="Number(k)" />
            </el-select>
          </el-form-item>
          <el-form-item label="收件人" required>
            <el-input v-model="sendOtpForm.recipient" />
          </el-form-item>
          <el-form-item label="账户 UID">
            <el-input v-model="sendOtpForm.accountUid" placeholder="可选" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="busy" @click="sendOtp">发送 OTP</el-button>
          </el-form-item>
        </el-form>
      </el-card>

      <el-card shadow="never">
        <template #header>校验 OTP</template>
        <el-form label-width="112px">
          <el-form-item label="用途">
            <el-select v-model="verifyForm.purpose" style="width: 100%">
              <el-option v-for="(label, k) in OtpPurposeLabel" :key="k" :label="label" :value="Number(k)" />
            </el-select>
          </el-form-item>
          <el-form-item label="渠道">
            <el-select v-model="verifyForm.channel" style="width: 100%">
              <el-option v-for="(label, k) in NoticeChannelLabel" :key="k" :label="label" :value="Number(k)" />
            </el-select>
          </el-form-item>
          <el-form-item label="收件人" required>
            <el-input v-model="verifyForm.recipient" />
          </el-form-item>
          <el-form-item label="验证码" required>
            <el-input v-model="verifyForm.code" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="busy" @click="verifyOtp">校验</el-button>
          </el-form-item>
        </el-form>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.debug__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 16px;
}
.debug__hint {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
