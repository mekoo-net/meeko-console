<script setup lang="ts">
import { inject } from 'vue';

import { AccountDetailKey } from '../../composables/accountDetailContext';
import IamUsersTab from '../../components/IamUsersTab.vue';

const ctx = inject(AccountDetailKey);
</script>

<template>
  <IamUsersTab v-if="ctx?.account.value" :account-uid="ctx.account.value.uid" />
</template>
