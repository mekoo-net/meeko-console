<script setup lang="ts">
import { computed, inject } from 'vue';
import { useRouter } from 'vue-router';
import {
  Coin,
  Medal,
  TrendCharts,
  UserFilled,
} from '@element-plus/icons-vue';

import { formatMoney } from '@/shared/lib/money';
import { formatDateTime, fromNow } from '@/shared/lib/date';

import { AccountDetailKey } from '../../composables/accountDetailContext';
import { accountTypeLabel } from '../../model/account.types';
import AccountTierCard from '../../components/AccountTierCard.vue';
import AccountWalletCard from '../../components/AccountWalletCard.vue';
import AccountOAuthCard from '../../components/AccountOAuthCard.vue';

const ctx = inject(AccountDetailKey);
const router = useRouter();

const account = computed(() => ctx?.account.value);

interface Metric {
  key: string;
  label: string;
  value: string;
  icon: unknown;
  tone: string;
}

const metrics = computed<Metric[]>(() => {
  const a = account.value;
  if (!a) return [];
  return [
    {
      key: 'recharged',
      label: '累计充值',
      value: formatMoney(a.totalRechargedAmount, { currency: a.wallet?.currency ?? 'CNY' }),
      icon: TrendCharts,
      tone: 'blue',
    },
    {
      key: 'iam',
      label: '子账号',
      value: String(a.iamUserCount ?? 0),
      icon: UserFilled,
      tone: 'violet',
    },
    {
      key: 'achievements',
      label: '徽章',
      value: String(a.achievements?.length ?? 0),
      icon: Medal,
      tone: 'amber',
    },
    {
      key: 'invite',
      label: '已邀请',
      value: String(a.inviteCount),
      icon: Coin,
      tone: 'emerald',
    },
  ];
});

const rebateLabel = computed(() => {
  const r = account.value?.rebateRatePercent;
  return r == null ? '默认' : `${r}%`;
});

const inviterAvatarChar = computed(() => {
  const inv = account.value?.inviter;
  const label = inv?.displayName || inv?.email || inv?.uid || '?';
  return label.charAt(0).toUpperCase();
});

function openInviter(): void {
  const uid = account.value?.inviter?.uid;
  if (uid) window.open(router.resolve(`/accounts/${uid}/overview`).href, '_blank', 'noopener');
}
</script>

<template>
  <div v-if="account" class="overview acc-page-fill">
    <div class="overview__metrics">
      <div
        v-for="m in metrics"
        :key="m.key"
        class="metric"
        :class="`metric--${m.tone}`"
      >
        <span class="metric__icon"><el-icon :size="20"><component :is="m.icon" /></el-icon></span>
        <span class="metric__body">
          <span class="metric__value">{{ m.value }}</span>
          <span class="metric__label">{{ m.label }}</span>
        </span>
      </div>
    </div>

    <div class="overview__cards">
      <AccountWalletCard :wallet="account.wallet" />
      <AccountTierCard
        :uid="account.uid"
        :tier="account.tier"
        :total-recharged-amount="account.totalRechargedAmount"
        @changed="ctx?.refresh()"
      />
      <AccountOAuthCard :bindings="account.oauthBindings ?? undefined" />
    </div>

    <section class="panel">
      <h3 class="panel__title">基本信息</h3>
      <dl class="info-grid">
        <div class="info-grid__item">
          <dt>账户类型</dt>
          <dd>{{ accountTypeLabel[account.type] }}</dd>
        </div>
        <div class="info-grid__item">
          <dt>负责人</dt>
          <dd>{{ account.owner.displayName || '—' }}</dd>
        </div>
        <div class="info-grid__item">
          <dt>邮箱</dt>
          <dd>{{ account.owner.email || '—' }}</dd>
        </div>
        <div class="info-grid__item">
          <dt>手机</dt>
          <dd>{{ account.owner.phone || '—' }}</dd>
        </div>
        <div class="info-grid__item">
          <dt>返利率</dt>
          <dd>{{ rebateLabel }}</dd>
        </div>
      </dl>
    </section>

    <section class="panel">
      <h3 class="panel__title">邀请人</h3>
      <div v-if="account.inviter" class="inviter">
        <div class="inviter__avatar">{{ inviterAvatarChar }}</div>
        <div class="inviter__body">
          <div class="inviter__name">
            {{ account.inviter.displayName || account.inviter.email || account.inviter.uid }}
          </div>
          <div class="inviter__meta">
            <span class="inviter__meta-item">UID: {{ account.inviter.uid }}</span>
            <span v-if="account.inviter.email" class="inviter__meta-item">
              {{ account.inviter.email }}
            </span>
          </div>
        </div>
        <el-button type="primary" plain size="small" @click="openInviter">查看账户</el-button>
      </div>
      <p v-else class="inviter__empty">无邀请人（自然注册）</p>
    </section>

    <section class="panel">
      <h3 class="panel__title">时间线</h3>
      <dl class="info-grid">
        <div class="info-grid__item">
          <dt>创建时间</dt>
          <dd>{{ formatDateTime(account.createdAtUtc) }}</dd>
        </div>
        <div class="info-grid__item">
          <dt>最近活跃</dt>
          <dd>
            {{ account.lastActiveAtUtc ? formatDateTime(account.lastActiveAtUtc) : '—' }}
            <span v-if="account.lastActiveAtUtc" class="info-grid__hint">
              （{{ fromNow(account.lastActiveAtUtc) }}）
            </span>
          </dd>
        </div>
        <div class="info-grid__item">
          <dt>更新时间</dt>
          <dd>{{ formatDateTime(account.updatedAtUtc) }}</dd>
        </div>
      </dl>
    </section>
  </div>
</template>

<style scoped>
.overview {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.overview__metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 14px;
}
.metric {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  border-radius: 14px;
  background: var(--el-fill-color-lighter);
}
.metric__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  color: #fff;
  flex-shrink: 0;
}
.metric--blue .metric__icon {
  background: linear-gradient(135deg, #2563eb, #3b82f6);
}
.metric--violet .metric__icon {
  background: linear-gradient(135deg, #7c3aed, #a855f7);
}
.metric--amber .metric__icon {
  background: linear-gradient(135deg, #d97706, #f59e0b);
}
.metric--emerald .metric__icon {
  background: linear-gradient(135deg, #059669, #10b981);
}
.metric__body {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
  min-width: 0;
}
.metric__value {
  font-size: 20px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}
.metric__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.overview__cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 14px;
}
.panel {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 14px;
  padding: 18px 20px;
}
.panel__title {
  margin: 0 0 14px;
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px 28px;
  margin: 0;
}
.info-grid__item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.info-grid__item dt {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.info-grid__item dd {
  margin: 0;
  font-size: 14px;
  color: var(--el-text-color-primary);
}
.info-grid__link {
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  color: var(--el-color-primary);
  font-size: 14px;
}
.info-grid__hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.inviter {
  display: flex;
  align-items: center;
  gap: 14px;
}
.inviter__avatar {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #2563eb, #7c3aed);
  flex-shrink: 0;
}
.inviter__body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}
.inviter__name {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.inviter__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.inviter__empty {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
</style>
