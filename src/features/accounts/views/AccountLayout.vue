<script setup lang="ts">
import { computed, provide, ref, toRef } from 'vue';
import { useRoute } from 'vue-router';
import { CopyDocument } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

import StatusTag from '@/shared/ui/StatusTag.vue';
import { confirmDanger } from '@/shared/composables/useConfirm';
import { formatMoney } from '@/shared/lib/money';

import {
  accountStatusLabel,
  accountStatusTone,
  accountTypeLabel,
  type AccountStatus,
} from '../model/account.types';
import { useAccountDetail } from '../composables/useAccountDetail';
import { AccountDetailKey } from '../composables/accountDetailContext';
import { getAccountAdminPort } from '../services';
import AccountSideMenu from '../components/AccountSideMenu.vue';

import ManualRechargeDialog from '@/features/billing/components/ManualRechargeDialog.vue';
import RouteViewport from '@/shared/ui/RouteViewport.vue';

const props = defineProps<{ uid: string }>();

const route = useRoute();
const uidRef = toRef(props, 'uid');
const detail = useAccountDetail(uidRef);

const port = getAccountAdminPort();
const togglingStatus = ref(false);
const manualDialogVisible = ref(false);

const account = computed(() => detail.account.value);
const isSuspended = computed(() => account.value?.status === 'suspended');

provide(AccountDetailKey, {
  account: detail.account,
  loading: detail.loading,
  refresh: detail.refresh,
});

interface SectionMeta {
  title: string;
  desc: string;
}

const overviewMeta: SectionMeta = { title: '概览', desc: '账户基础信息、等级与钱包快照' };
const sectionMeta: Record<string, SectionMeta> = {
  overview: overviewMeta,
  business: { title: '业务', desc: '该账户已开通的业务实例' },
  billing: { title: '账单', desc: '充值订单与钱包扣款流水' },
  referral: { title: '返利', desc: '邀请关系、返利流水与提现记录' },
  achievements: { title: '徽章', desc: '账户已授予的成就勋章' },
  iam: { title: 'IAM', desc: '账户下的子账号与角色权限' },
  settings: { title: '设置', desc: '返利率等账户级配置' },
};

const currentMeta = computed<SectionMeta>(() => {
  const seg = route.path.split('/')[3] ?? 'overview';
  return sectionMeta[seg] ?? overviewMeta;
});

function accountLabel(): string {
  const a = account.value;
  if (!a) return props.uid;
  return a.displayName || a.owner.email || a.owner.phone || a.uid;
}

const avatarChar = computed(() => accountLabel().charAt(0).toUpperCase());

async function copyUid(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.uid);
    ElMessage.success('UID 已复制');
  } catch {
    ElMessage.warning('复制失败，请手动复制');
  }
}

async function toggleSuspend(): Promise<void> {
  const a = account.value;
  if (!a) return;
  const target: AccountStatus = a.status === 'active' ? 'suspended' : 'active';
  const ok = await confirmDanger({
    title: target === 'suspended' ? '停用账户' : '恢复账户',
    message:
      target === 'suspended'
        ? `停用后该账户将无法登录，是否继续？账户：${accountLabel()}`
        : `恢复账户 ${accountLabel()} 至活跃状态？`,
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
  <div class="acc-shell">
    <aside class="acc-shell__side">
      <div class="acc-profile">
        <div class="acc-profile__avatar">{{ avatarChar }}</div>
        <div class="acc-profile__name">{{ accountLabel() }}</div>
        <div v-if="account" class="acc-profile__tags">
          <el-tag
            :type="account.type === 'organization' ? 'primary' : 'info'"
            effect="light"
            round
            size="small"
          >
            {{ accountTypeLabel[account.type] }}
          </el-tag>
          <StatusTag
            :label="accountStatusLabel[account.status]"
            :tone="accountStatusTone[account.status]"
          />
        </div>
        <button type="button" class="acc-profile__uid" @click="copyUid">
          <span>UID {{ uid }}</span>
          <el-icon :size="12"><CopyDocument /></el-icon>
        </button>
      </div>

      <div v-if="account" class="acc-stats">
        <div class="acc-stats__item">
          <span class="acc-stats__label">余额</span>
          <span class="acc-stats__value">
            {{ account.wallet ? formatMoney(account.wallet.available, { currency: account.wallet.currency }) : '—' }}
          </span>
        </div>
        <div class="acc-stats__item">
          <span class="acc-stats__label">等级</span>
          <span class="acc-stats__value">L{{ account.tier }}</span>
        </div>
        <div class="acc-stats__item">
          <span class="acc-stats__label">邀请</span>
          <span class="acc-stats__value">{{ account.inviteCount }}</span>
        </div>
      </div>

      <div class="acc-shell__nav">
        <AccountSideMenu :uid="uid" />
      </div>
    </aside>

    <main class="acc-shell__main">
      <header class="acc-topbar">
        <div class="acc-topbar__title">
          <h1>{{ currentMeta.title }}</h1>
          <p>{{ currentMeta.desc }}</p>
        </div>
        <div v-if="account" class="acc-topbar__actions">
          <el-button type="primary" @click="manualDialogVisible = true">人工入账</el-button>
          <el-button
            :loading="togglingStatus"
            :type="isSuspended ? 'success' : 'warning'"
            plain
            @click="toggleSuspend"
          >
            {{ isSuspended ? '恢复账户' : '停用账户' }}
          </el-button>
        </div>
      </header>

      <el-alert
        v-if="detail.error.value"
        type="error"
        :title="`加载失败：${detail.error.value.code}`"
        :description="detail.error.value.message"
        show-icon
        :closable="false"
        class="acc-shell__alert"
      />

      <section v-loading="detail.loading.value && !account" class="acc-shell__content">
        <RouteViewport />
      </section>
    </main>

    <ManualRechargeDialog
      v-if="account"
      v-model:visible="manualDialogVisible"
      :account-uid="account.uid"
      :account-label="accountLabel()"
      @success="detail.refresh()"
    />
  </div>
</template>

<style scoped>
.acc-shell {
  display: flex;
  height: 100vh;
  background: #f5f6f8;
}
.acc-shell__side {
  flex: 0 0 280px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 18px 16px;
  background: #fff;
  border-right: 1px solid var(--el-border-color-lighter);
  overflow-y: auto;
}
.acc-profile {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 10px;
  padding: 8px 4px 18px;
  border-bottom: 1px solid var(--el-border-color-extra-light);
}
.acc-profile__avatar {
  width: 64px;
  height: 64px;
  border-radius: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #2563eb, #7c3aed);
  box-shadow: 0 10px 24px -12px rgba(37, 99, 235, 0.7);
}
.acc-profile__name {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  word-break: break-all;
}
.acc-profile__tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
}
.acc-profile__uid {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: none;
  background: var(--el-fill-color-light);
  cursor: pointer;
  padding: 4px 10px;
  border-radius: 999px;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  transition: color 0.15s ease;
}
.acc-profile__uid:hover {
  color: var(--el-color-primary);
}
.acc-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--el-border-color-extra-light);
}
.acc-stats__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 4px;
  border-radius: 10px;
  background: var(--el-fill-color-lighter);
}
.acc-stats__label {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.acc-stats__value {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.acc-shell__nav {
  flex: 1;
}
.acc-shell__main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 20px 24px 24px;
}
.acc-topbar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}
.acc-topbar__title h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.acc-topbar__title p {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.acc-topbar__actions {
  display: flex;
  gap: 10px;
}
.acc-shell__alert {
  margin-bottom: 16px;
}
.acc-shell__content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 16px;
  padding: 20px 22px;
  overflow: hidden;
}
</style>
