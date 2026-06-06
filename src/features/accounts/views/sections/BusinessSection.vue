<script setup lang="ts">
import { inject } from 'vue';

import BusinessTab from '@/features/billing/components/BusinessTab.vue';

import { AccountDetailKey } from '../../composables/accountDetailContext';

const ctx = inject(AccountDetailKey);
</script>

<template>
  <BusinessTab v-if="ctx?.account.value" :account-uid="ctx.account.value.uid" />
</template>
