<script setup lang="ts">
/**
 * 用户视角 › 市场：这个人买过的（订单）、发布过的（角色卡、世界书）、卖出赚的钱（收益）和提现，
 * 用的就是市场那几张表，按这个人筛好。
 */
import { ref } from 'vue';

import MarketItemsView from '../market/MarketItemsView.vue';
import MarketOrdersView from '../market/MarketOrdersView.vue';
import MarketWithdrawalsView from '../market/MarketWithdrawalsView.vue';
import UserEarningsPanel from './UserEarningsPanel.vue';

defineProps<{ accountUid: number }>();

const part = ref<'bought' | 'published' | 'earnings' | 'withdrawals'>('bought');
const parts = [
  { label: '购买的', value: 'bought' },
  { label: '发布的', value: 'published' },
  { label: '收益', value: 'earnings' },
  { label: '提现', value: 'withdrawals' },
];
</script>

<template>
  <div class="user-market">
    <el-segmented
      v-model="part"
      :options="parts"
      class="user-market__switch"
    />
    <MarketOrdersView
      v-if="part === 'bought'"
      :buyer-uid="accountUid"
    />
    <MarketItemsView
      v-else-if="part === 'published'"
      :creator-uid="accountUid"
    />
    <UserEarningsPanel
      v-else-if="part === 'earnings'"
      :account-uid="accountUid"
    />
    <MarketWithdrawalsView
      v-else
      :account-uid="accountUid"
    />
  </div>
</template>

<style scoped>
.user-market {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.user-market__switch {
  align-self: flex-start;
}
</style>
