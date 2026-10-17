<script setup lang="ts">
import AccountSubPage from '../../components/AccountSubPage.vue';

const options = [
  { label: '邀请列表', value: 'invitees' },
  { label: '返利流水', value: 'rebates' },
  { label: '提现记录', value: 'withdrawals' },
] as const;
</script>

<template>
  <AccountSubPage
    section="referral"
    :options="options"
  />
</template>
