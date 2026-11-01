<script setup lang="ts">
/**
 * 用户视角 › 卡片：这个人手里的卡，分世界卡、角色卡两页，同「市场」页签里的分段。
 * 世界线、联系人是用这些卡建出来的，在各自的页签。
 */
import { ref } from 'vue';

import { MarketItemKindLabel, type MarketItemKind } from '../../model/market.types';
import UserCardsPanel from './UserCardsPanel.vue';

defineProps<{ accountUid: number }>();

const kind = ref<MarketItemKind>('world_card');
const kinds = (['world_card', 'character_card'] as const).map((k) => ({ label: MarketItemKindLabel[k], value: k }));
</script>

<template>
  <div class="user-cards">
    <el-segmented
      v-model="kind"
      :options="kinds"
      class="user-cards__switch"
    />
    <UserCardsPanel
      :account-uid="accountUid"
      :kind="kind"
    />
  </div>
</template>

<style scoped>
.user-cards {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.user-cards__switch {
  align-self: flex-start;
}
</style>
