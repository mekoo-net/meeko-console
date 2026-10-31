<script setup lang="ts">
/**
 * 用户视角 › 市场：这个人买过的（订单）和发布过的（角色卡、世界书），用的就是市场的两张表，按这个人筛好。
 */
import { ref } from 'vue';

import MarketItemsView from '../market/MarketItemsView.vue';
import MarketOrdersView from '../market/MarketOrdersView.vue';

defineProps<{ accountUid: number }>();

const part = ref<'bought' | 'published'>('bought');
const parts = [
  { label: '购买的', value: 'bought' },
  { label: '发布的', value: 'published' },
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
      v-else
      :creator-uid="accountUid"
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
