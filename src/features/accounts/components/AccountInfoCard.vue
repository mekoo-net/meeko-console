<script setup lang="ts">
import { User } from '@element-plus/icons-vue';

import StatusTag from '@/shared/ui/StatusTag.vue';

import {
  accountStatusLabel,
  accountStatusTone,
  accountTypeLabel,
  type Account,
} from '../model/account.types';
import AccountOAuthCard from './AccountOAuthCard.vue';
import AccountTierCard from './AccountTierCard.vue';
import AccountWalletCard from './AccountWalletCard.vue';

defineProps<{ account: Account }>();
</script>

<template>
  <section class="info-card">
    <header class="info-card__header">
      <div class="info-card__avatar">
        <el-icon :size="26"><User /></el-icon>
      </div>
      <div class="info-card__main">
        <div class="info-card__title-row">
          <span class="info-card__title">{{ account.name }}</span>
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
        <div class="info-card__meta">
          <span>UID {{ account.uid }}</span>
          <el-divider direction="vertical" />
          <span>slug: {{ account.slug }}</span>
        </div>
        <div class="info-card__contact">
          <span v-if="account.ownerEmail">{{ account.ownerEmail }}</span>
          <span v-else class="info-card__contact--muted">未绑定邮箱</span>
          <el-divider direction="vertical" />
          <span v-if="account.ownerPhone">{{ account.ownerPhone }}</span>
          <span v-else class="info-card__contact--muted">未绑定手机</span>
        </div>
      </div>
    </header>

    <div class="info-card__grid">
      <AccountTierCard
        :tier="account.tier"
        :total-recharged-amount="account.totalRechargedAmount"
      />
      <AccountWalletCard :account-uid="account.uid" />
      <AccountOAuthCard :bindings="account.oauthBindings" />
    </div>
  </section>
</template>

<style scoped>
.info-card {
  background: #fff;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  padding: 20px 22px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  margin-bottom: 16px;
}
.info-card__header {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}
.info-card__avatar {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  background: linear-gradient(135deg, #dbeafe, #e0e7ff);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #1d4ed8;
  flex-shrink: 0;
}
.info-card__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.info-card__title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.info-card__title {
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.info-card__meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  display: flex;
  align-items: center;
}
.info-card__contact {
  font-size: 13px;
  color: var(--el-text-color-regular);
  display: flex;
  align-items: center;
}
.info-card__contact--muted {
  color: var(--el-text-color-placeholder);
}
.info-card__grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
}
@media (min-width: 1024px) {
  .info-card__grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>
