<script setup lang="ts">
import { computed, ref, toRef } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowLeft } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

import PageHeader from '@/shared/ui/PageHeader.vue';
import { confirmDanger } from '@/shared/composables/useConfirm';

import { type AccountStatus } from '../model/account.types';
import { useAccountDetail } from '../composables/useAccountDetail';
import { getAccountAdminPort } from '../services';

import AccountInfoCard from '../components/AccountInfoCard.vue';
import BillingTab from '@/features/billing/components/BillingTab.vue';
import BusinessTab from '@/features/billing/components/BusinessTab.vue';
import IamUsersTab from '../components/IamUsersTab.vue';

const props = defineProps<{ uid: string }>();

const router = useRouter();
const uidRef = toRef(props, 'uid');
const detail = useAccountDetail(uidRef);

const port = getAccountAdminPort();
const togglingStatus = ref(false);

const account = computed(() => detail.account.value);
const isSuspended = computed(() => account.value?.status === 'suspended');

const activeTab = ref<'business' | 'billing' | 'iam'>('business');

async function toggleSuspend(): Promise<void> {
  const a = account.value;
  if (!a) return;
  const target: AccountStatus = a.status === 'active' ? 'suspended' : 'active';
  const ok = await confirmDanger({
    title: target === 'suspended' ? '停用账户' : '恢复账户',
    message:
      target === 'suspended'
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
        <el-button
          v-if="account"
          :loading="togglingStatus"
          :type="isSuspended ? 'success' : 'warning'"
          @click="toggleSuspend"
        >
          {{ isSuspended ? '恢复账户' : '停用账户' }}
        </el-button>
      </template>
    </PageHeader>

    <el-alert
      v-if="detail.error.value"
      type="error"
      :title="`加载失败：${detail.error.value.code}`"
      :description="detail.error.value.message"
      show-icon
      :closable="false"
    />

    <div v-loading="detail.loading.value">
      <template v-if="account">
        <AccountInfoCard :account="account" @achievements-changed="detail.refresh()" />

        <el-card shadow="never" class="tabs-card">
          <el-tabs v-model="activeTab" class="detail-tabs">
            <el-tab-pane label="业务" name="business" lazy>
              <BusinessTab :account-uid="account.uid" />
            </el-tab-pane>
            <el-tab-pane label="账单" name="billing" lazy>
              <BillingTab :account-uid="account.uid" />
            </el-tab-pane>
            <el-tab-pane label="IAM" name="iam" lazy>
              <IamUsersTab :account-uid="account.uid" />
            </el-tab-pane>
          </el-tabs>
        </el-card>
      </template>
    </div>
  </div>
</template>

<style scoped>
.tabs-card {
  border-radius: 12px;
}
.tabs-card :deep(.el-card__body) {
  padding: 8px 18px 18px;
}
.detail-tabs :deep(.el-tabs__nav-wrap)::after {
  height: 1px;
  background: var(--el-border-color-lighter);
}
.detail-tabs :deep(.el-tabs__item) {
  font-size: 14px;
  font-weight: 500;
}
</style>
