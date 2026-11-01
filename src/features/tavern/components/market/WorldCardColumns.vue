<script setup lang="ts">
/** 世界卡列表才有的两列：规模（几段叙事、几条设定、几条规则）和时间怎么走。只挂在只列世界卡的页面上。 */
import type { MarketItemRowOf } from '../../model/market.types';
import { timeText } from '../../model/marketFormat';
</script>

<template>
  <el-table-column
    label="规模"
    min-width="170"
  >
    <template #default="{ row }: { row: MarketItemRowOf<'world_card'> }">
      <span class="muted-strong">叙事 {{ row.listing.summary.narratives }} · 设定 {{ row.listing.summary.settings }} · 规则 {{ row.listing.summary.rules }}</span>
    </template>
  </el-table-column>
  <el-table-column
    label="时间"
    min-width="140"
  >
    <template #default="{ row }: { row: MarketItemRowOf<'world_card'> }">
      {{ timeText(row.listing.summary.time) }}
    </template>
  </el-table-column>
</template>

<style scoped>
.muted-strong {
  color: var(--el-text-color-regular);
}
</style>
