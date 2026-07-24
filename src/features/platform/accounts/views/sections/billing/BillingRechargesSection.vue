<script setup lang="ts">
import { computed, inject } from 'vue';
import { useRoute } from 'vue-router';

import RechargesPanel from '@/features/platform/billing/components/RechargesPanel.vue';

import { AccountDetailKey } from '../../../composables/accountDetailContext';

const ctx = inject(AccountDetailKey);
const route = useRoute();

const highlightRechargeId = computed(() => {
  const q = route.query.highlight;
  return typeof q === 'string' ? q : null;
});
</script>

<template>
  <RechargesPanel
    v-if="ctx?.account.value"
    :account-uid="ctx.account.value.uid"
    :highlight-recharge-id="highlightRechargeId"
  />
</template>
