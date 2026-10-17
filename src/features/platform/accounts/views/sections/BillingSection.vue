<script setup lang="ts">
import AccountSubPage from '../../components/AccountSubPage.vue';

const options = [
  { label: '充值记录', value: 'recharges' },
  { label: '账单流水', value: 'bills' },
  { label: '代金券', value: 'vouchers' },
] as const;
</script>

<template>
  <AccountSubPage
    section="billing"
    :options="options"
  />
</template>
