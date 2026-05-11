<script setup lang="ts">
import { computed, ref, toRef } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowLeft, User } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

import PageHeader from '@/shared/ui/PageHeader.vue';
import StatusTag from '@/shared/ui/StatusTag.vue';
import { formatDateTime } from '@/shared/lib/date';
import { confirmDanger } from '@/shared/composables/useConfirm';
import WalletTab from '@/features/billing/components/WalletTab.vue';
import OrdersTab from '@/features/billing/components/OrdersTab.vue';
import SubscriptionsTab from '@/features/billing/components/SubscriptionsTab.vue';
import InvoicesTab from '@/features/billing/components/InvoicesTab.vue';

import {
  accountStatusLabel,
  accountStatusTone,
  accountTypeLabel,
  type AccountStatus,
} from '../model/account.types';
import { useAccountDetail } from '../composables/useAccountDetail';
import { getAccountAdminPort } from '../services';

import IamUserDrawer from '../components/IamUserDrawer.vue';

const props = defineProps<{ uid: string }>();

const router = useRouter();
const uidRef = toRef(props, 'uid');
const detail = useAccountDetail(uidRef);
const drawerOpen = ref(false);

const port = getAccountAdminPort();
const togglingStatus = ref(false);

const account = computed(() => detail.account.value);
const isSuspended = computed(() => account.value?.status === 'suspended');
const billingUid = computed(() => account.value?.uid ?? null);

const activeTab = ref('wallet');

async function toggleSuspend(): Promise<void> {
  const a = account.value;
  if (!a) return;
  const target: AccountStatus = a.status === 'active' ? 'suspended' : 'active';
  const ok = await confirmDanger({
    title: target === 'suspended' ? '停用账户' : '恢复账户',
    message: target === 'suspended'
      ? `停用后该账户将无法登录，是否继续？账户：${a.name}`
      : `恢复账户 ${a.name} 至活跃状态？`,
    confirmText: target === 'suspended' ? '停用' : '恢复',
  });
  if (!ok) return;
  togglingStatus.value = true;
  try {
    const r = await port.setAccountStatus(a.uid, target);
    if (r.success) {
      ElMessage.success(target === 'suspended' ? '已停用' : '已恢复');
      detail.refresh();
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    togglingStatus.value = false;
  }
}
</script>

<template>
  <div class="page">
    <PageHeader title="账户详情">
      <template #actions>
        <el-button :icon="ArrowLeft" plain @click="router.push('/accounts')">返回</el-button>
      </template>
    </PageHeader>

    <!-- 基本信息 -->
    <el-card v-loading="detail.loading.value" shadow="never" class="detail-card">
      <el-alert
        v-if="detail.error.value"
        type="error"
        :title="`加载失败：${detail.error.value.code}`"
        :description="detail.error.value.message"
        show-icon
        :closable="false"
      />
      <template v-else-if="account">
        <div class="detail-head">
          <div class="detail-head__icon">
            <el-icon :size="24"><User /></el-icon>
          </div>
          <div class="detail-head__main">
            <div class="detail-head__title">{{ account.name }}</div>
            <div class="detail-head__sub">
              <span>{{ accountTypeLabel[account.type] }}</span>
              <el-divider direction="vertical" />
              <span>slug：{{ account.slug }}</span>
              <el-divider direction="vertical" />
              <span>UID {{ account.uid }}</span>
            </div>
          </div>
          <StatusTag
            :label="accountStatusLabel[account.status]"
            :tone="accountStatusTone[account.status]"
          />
        </div>

        <el-descriptions :column="2" border class="detail-info">
          <el-descriptions-item label="Owner">
            <span>{{ account.ownerDisplayName ?? '—' }}</span>
            <span v-if="account.ownerEmail" class="owner-email">{{ account.ownerEmail }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="IAM 账户数">
            <template v-if="account.type === 'organization'">
              {{ account.iamUserCount ?? '—' }}
            </template>
            <span v-else>—</span>
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">
            {{ formatDateTime(account.createdAtUtc) }}
          </el-descriptions-item>
          <el-descriptions-item label="更新时间">
            {{ formatDateTime(account.updatedAtUtc) }}
          </el-descriptions-item>
        </el-descriptions>

        <div class="detail-actions">
          <el-button type="primary" @click="drawerOpen = true">管理子账号</el-button>
          <el-button :loading="togglingStatus" :type="isSuspended ? 'success' : 'warning'" @click="toggleSuspend">
            {{ isSuspended ? '恢复账户' : '停用账户' }}
          </el-button>
        </div>
      </template>
    </el-card>

    <!-- 账单详情 -->
    <el-card v-if="account" shadow="never" class="billing-card">
      <template #header>
        <span class="billing-card__title">账单详情</span>
      </template>
      <el-tabs v-model="activeTab" type="border-card" class="billing-tabs">
        <el-tab-pane label="钱包" name="wallet" lazy>
          <WalletTab :account-uid="billingUid" />
        </el-tab-pane>
        <el-tab-pane label="订单" name="orders" lazy>
          <OrdersTab :account-uid="billingUid" />
        </el-tab-pane>
        <el-tab-pane label="订阅" name="subs" lazy>
          <SubscriptionsTab :account-uid="billingUid" />
        </el-tab-pane>
        <el-tab-pane label="发票" name="inv" lazy>
          <InvoicesTab :account-uid="billingUid" />
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <IamUserDrawer
      v-if="account"
      v-model:visible="drawerOpen"
      :account-uid="account.uid"
      :account-name="account.name"
    />
  </div>
</template>

<style scoped>
.detail-card {
  border-radius: 12px;
  margin-bottom: 16px;
}
.detail-head {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 18px;
}
.detail-head__icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: linear-gradient(135deg, #dbeafe, #e0e7ff);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #1d4ed8;
}
.detail-head__main {
  flex: 1;
}
.detail-head__title {
  font-size: 18px;
  font-weight: 600;
}
.detail-head__sub {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.detail-info {
  margin-top: 8px;
}
.detail-actions {
  display: flex;
  gap: 10px;
  margin-top: 18px;
}
.owner-email {
  display: block;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
.billing-card {
  border-radius: 12px;
}
.billing-card__title {
  font-size: 15px;
  font-weight: 600;
}
.billing-tabs {
  border-radius: 8px;
}
</style>
