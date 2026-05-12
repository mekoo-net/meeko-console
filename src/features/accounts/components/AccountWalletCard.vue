<script setup lang="ts">
import { computed, toRef, unref } from 'vue';

import MoneyText from '@/shared/ui/MoneyText.vue';
import { useWallet } from '@/features/billing/composables/useWallet';

const props = defineProps<{ accountUid: string }>();

const uidRef = toRef(props, 'accountUid');
const wallet = useWallet(computed(() => uidRef.value || null));

const snapshot = computed(() => unref(wallet.data));
const loading = computed(() => unref(wallet.loading));
</script>

<template>
  <div v-loading="loading" class="wallet-card">
    <div class="wallet-card__head">
      <span class="wallet-card__label">账户余额</span>
      <span v-if="snapshot" class="wallet-card__currency">{{ snapshot.currency }}</span>
    </div>

    <div v-if="snapshot" class="wallet-card__amount">
      <MoneyText :value="snapshot.available" :options="{ currency: snapshot.currency }" />
    </div>
    <div v-else class="wallet-card__amount wallet-card__amount--muted">—</div>

    <div v-if="snapshot" class="wallet-card__row">
      <span>冻结</span>
      <MoneyText :value="snapshot.held" :options="{ currency: snapshot.currency }" />
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
