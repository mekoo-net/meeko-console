<script setup lang="ts">
import MoneyText from '@/shared/ui/MoneyText.vue';

import type { AccountWallet } from '../model/account.types';

defineProps<{
  wallet?: AccountWallet | null;
}>();
</script>

<template>
  <div class="wallet-card">
    <div class="wallet-card__head">
      <span class="wallet-card__label">账户余额</span>
      <span v-if="wallet" class="wallet-card__currency">{{ wallet.currency }}</span>
    </div>

    <div v-if="wallet" class="wallet-card__amount">
      <MoneyText :value="wallet.available" :options="{ currency: wallet.currency }" />
    </div>
    <div v-else class="wallet-card__amount wallet-card__amount--muted">—</div>

    <div v-if="wallet" class="wallet-card__row">
      <span>冻结</span>
      <MoneyText :value="wallet.held" :options="{ currency: wallet.currency }" />
    </div>
  </div>
</template>

<style scoped>
.wallet-card {
  background: linear-gradient(135deg, #ecfeff, #cffafe);
  border-radius: 10px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 152px;
}
.wallet-card__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.wallet-card__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.wallet-card__currency {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.wallet-card__amount {
  font-size: 26px;
  font-weight: 700;
  color: #0e7490;
  font-variant-numeric: tabular-nums;
}
.wallet-card__amount--muted {
  color: var(--el-text-color-placeholder);
}
.wallet-card__row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: auto;
}
</style>
