<script setup lang="ts">
import { inject } from 'vue';

import BillsPanel from '@/features/billing/components/BillsPanel.vue';

import { AccountDetailKey } from '../../../composables/accountDetailContext';

const ctx = inject(AccountDetailKey);
</script>

<template>
  <BillsPanel v-if="ctx?.account.value" :account-uid="ctx.account.value.uid" />
</template>
