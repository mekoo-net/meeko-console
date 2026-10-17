<script setup lang="ts">
import { computed, provide, ref, toRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { CopyDocument } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

import StatusTag from '@/shared/ui/StatusTag.vue';
import RouteViewport from '@/shared/ui/RouteViewport.vue';
import { confirmDanger } from '@/shared/composables/useConfirm';
import { formatDate, fromNow } from '@/shared/lib/date';
import { formatMoney } from '@/shared/lib/money';
import ManualRechargeDrawer from '@/features/platform/billing/components/ManualRechargeDrawer.vue';
import BalanceRefundDrawer from '@/features/platform/billing/components/BalanceRefundDrawer.vue';

import {
  accountStatusLabel,
  accountStatusTone,
  accountTypeLabel,
  type AccountStatus,
} from '../model/account.types';
import { useAccountDetail } from '../composables/useAccountDetail';
import { AccountDetailKey } from '../composables/accountDetailContext';
import { getAccountAdminPort } from '../services';

const props = defineProps<{ uid: string }>();

const route = useRoute();
const router = useRouter();
const detail = useAccountDetail(toRef(props, 'uid'));
const port = getAccountAdminPort();

const account = computed(() => detail.account.value);
const isSuspended = computed(() => account.value?.status === 'suspended');
const togglingStatus = ref(false);
const rechargeDrawerVisible = ref(false);
const refundDrawerVisible = ref(false);

provide(AccountDetailKey, {
  account: detail.account,
  loading: detail.loading,
  refresh: detail.refresh,
});

const tabs = [
  { key: 'overview', label: '概览' },
  { key: 'billing', label: '账单' },
  { key: 'referral', label: '返利' },
  { key: 'iam', label: '子账号' },
  { key: 'achievements', label: '徽章' },
  { key: 'settings', label: '设置' },
] as const;

const activeTab = computed(() => {
  const seg = route.path.split('/')[3];
  return tabs.find((t) => t.key === seg)?.key ?? 'overview';
});

function onTabChange(key: string | number): void {
  if (key === activeTab.value) return;
  void router.push(`/accounts/${props.uid}/${String(key)}`);
}

const accountLabel = computed(() => {
  const a = account.value;
  if (!a) return props.uid;
  return a.displayName || a.owner.email || a.owner.phone || a.uid;
});

const avatarChar = computed(() => accountLabel.value.charAt(0).toUpperCase());

const stats = computed(() => {
  const a = account.value;
  if (!a) return [];
  const currency = a.wallet?.currency ?? 'CNY';
  const money = (v: number) => formatMoney(v, { currency });
  return [
    { key: 'available', label: '可用余额', value: a.wallet ? money(a.wallet.available) : '—' },
    { key: 'held', label: '冻结金额', value: a.wallet ? money(a.wallet.held) : '—' },
    { key: 'recharged', label: '累计充值', value: money(a.totalRechargedAmount) },
    { key: 'invites', label: '邀请人数', value: String(a.inviteCount) },
  ];
});

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
        ? `停用后该账户将无法登录，是否继续？账户：${accountLabel.value}`
        : `恢复账户 ${accountLabel.value} 至活跃状态？`,
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
  <div class="account-page">
    <section class="account-head">
      <el-breadcrumb class="account-head__crumb">
        <el-breadcrumb-item :to="{ name: 'accounts' }">
          账户列表
        </el-breadcrumb-item>
        <el-breadcrumb-item>{{ accountLabel }}</el-breadcrumb-item>
      </el-breadcrumb>

      <div class="account-head__main">
        <el-avatar
          :size="56"
          shape="square"
          class="account-head__avatar"
        >
          {{ avatarChar }}
        </el-avatar>
        <div class="account-head__info">
          <div class="account-head__title">
            <h1>{{ accountLabel }}</h1>
            <template v-if="account">
              <el-tag
                type="info"
                effect="plain"
                size="small"
              >
                {{ accountTypeLabel[account.type] }}
              </el-tag>
              <StatusTag
                :label="accountStatusLabel[account.status]"
                :tone="accountStatusTone[account.status]"
              />
            </template>
          </div>
          <div class="account-head__meta">
            <span class="meta">
              UID <span class="meta__mono">{{ uid }}</span>
              <el-icon
                class="meta__copy"
                title="复制 UID"
                @click="copyUid"
              ><CopyDocument /></el-icon>
            </span>
            <template v-if="account">
              <span
                v-if="account.owner.email"
                class="meta"
              >{{ account.owner.email }}</span>
              <span
                v-if="account.owner.phone"
                class="meta"
              >{{ account.owner.phone }}</span>
              <span
                v-if="account.createdAtUtc"
                class="meta"
              >注册于 {{ formatDate(account.createdAtUtc) }}</span>
              <span
                v-if="account.lastActiveAtUtc"
                class="meta"
              >最近活跃 {{ fromNow(account.lastActiveAtUtc) }}</span>
            </template>
          </div>
        </div>
        <div
          v-if="account"
          class="account-head__actions"
        >
          <el-button
            type="primary"
            @click="rechargeDrawerVisible = true"
          >
            充值
          </el-button>
          <el-button
            :disabled="!account.wallet || account.wallet.available <= 0"
            @click="refundDrawerVisible = true"
          >
            退款
          </el-button>
          <el-button
            :type="isSuspended ? 'success' : 'danger'"
            plain
            :loading="togglingStatus"
            @click="toggleSuspend"
          >
            {{ isSuspended ? '恢复账户' : '停用账户' }}
          </el-button>
        </div>
      </div>

      <dl
        v-if="stats.length"
        class="account-head__stats"
      >
        <div
          v-for="s in stats"
          :key="s.key"
          class="stat"
        >
          <dt>{{ s.label }}</dt>
          <dd>{{ s.value }}</dd>
        </div>
      </dl>

      <el-tabs
        :model-value="activeTab"
        class="account-head__tabs"
        @tab-change="onTabChange"
      >
        <el-tab-pane
          v-for="t in tabs"
          :key="t.key"
          :name="t.key"
          :label="t.label"
        />
      </el-tabs>
    </section>

    <el-alert
      v-if="detail.error.value"
      type="error"
      :title="`加载失败：${detail.error.value.code}`"
      :description="detail.error.value.message"
      show-icon
      :closable="false"
    />

    <section
      v-loading="detail.loading.value && !account"
      class="account-body"
    >
      <RouteViewport />
    </section>

    <template v-if="account">
      <ManualRechargeDrawer
        v-model:visible="rechargeDrawerVisible"
        :account-uid="account.uid"
        :account-label="accountLabel"
        @success="detail.refresh()"
      />
      <BalanceRefundDrawer
        v-model:visible="refundDrawerVisible"
        :account-uid="account.uid"
        :account-label="accountLabel"
        :available="account.wallet?.available ?? 0"
        @success="detail.refresh()"
      />
    </template>
  </div>
</template>

<style scoped>
/* 撑满主区域：标签页里的表格要能在内容卡片里自己滚动、分页贴底。 */
.account-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: calc(100vh - 56px - 52px);
  min-height: 640px;
}

.account-head {
  flex-shrink: 0;
  padding: 16px 24px 0;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}
.account-head__crumb {
  margin-bottom: 14px;
}
.account-head__main {
  display: flex;
  align-items: center;
  gap: 16px;
}
.account-head__avatar {
  flex-shrink: 0;
  font-size: 22px;
  font-weight: 600;
  color: #fff;
  background: var(--el-color-primary);
  border-radius: 8px;
}
.account-head__info {
  flex: 1;
  min-width: 0;
}
.account-head__title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.account-head__title h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  line-height: 28px;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.account-head__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  margin-top: 6px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.meta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.meta + .meta::before {
  content: '';
  width: 1px;
  height: 12px;
  margin: 0 12px;
  background: var(--el-border-color);
}
.meta__mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  color: var(--el-text-color-regular);
}
.meta__copy {
  cursor: pointer;
}
.meta__copy:hover {
  color: var(--el-color-primary);
}
.account-head__actions {
  flex-shrink: 0;
  display: flex;
  gap: 8px;
}
.account-head__actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

.account-head__stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 20px 0 4px;
  padding: 14px 0;
  border-top: 1px solid var(--el-border-color-extra-light);
}
.stat {
  padding: 0 20px;
}
.stat:first-child {
  padding-left: 0;
}
.stat + .stat {
  border-left: 1px solid var(--el-border-color-lighter);
}
.stat dt {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.stat dd {
  margin: 4px 0 0;
  font-size: 20px;
  font-weight: 600;
  line-height: 28px;
  color: var(--el-text-color-primary);
  font-variant-numeric: tabular-nums;
}

/* 标签栏贴在头部卡片底边，卡片本身有边框，去掉标签栏自带的底线。 */
.account-head__tabs :deep(.el-tabs__header) {
  margin: 0;
}
.account-head__tabs :deep(.el-tabs__nav-wrap::after) {
  display: none;
}
.account-head__tabs :deep(.el-tabs__item) {
  height: 44px;
  font-size: 14px;
}

.account-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 16px 20px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  overflow: hidden;
}
.account-body > :deep(.route-viewport) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.account-body > :deep(.route-viewport) > .route-viewport__page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
</style>
