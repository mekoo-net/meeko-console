<script setup lang="ts">
import { inject } from 'vue';

import { AccountDetailKey } from '../../composables/accountDetailContext';
import AccountAchievementsCard from '../../components/AccountAchievementsCard.vue';

const ctx = inject(AccountDetailKey);
</script>

<template>
  <AccountAchievementsCard
    v-if="ctx?.account.value"
    :account="ctx.account.value"
    @changed="ctx.refresh()"
  />
</template>
