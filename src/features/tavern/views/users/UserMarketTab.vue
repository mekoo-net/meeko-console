<script setup lang="ts">
/**
 * 用户视角 › 市场：这个人当卖家的一面——上架（挂在市场上卖的）、收益（卖出赚的钱）、提现。
 * 手里有的卡在「仓库」页签，不在这里。用的就是市场那几张表，按这个人筛好。
 */
import { ref } from 'vue';

import MarketItemsView from '../market/MarketItemsView.vue';
import MarketWithdrawalsView from '../market/MarketWithdrawalsView.vue';
import UserEarningsPanel from './UserEarningsPanel.vue';

defineProps<{ accountUid: number }>();

const part = ref<'listed' | 'earnings' | 'withdrawals'>('listed');
const parts = [
  { label: '上架', value: 'listed' },
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
    <MarketItemsView
      v-if="part === 'listed'"
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
