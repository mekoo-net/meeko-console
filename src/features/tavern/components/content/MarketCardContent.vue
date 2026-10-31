<script setup lang="ts">
/**
 * 市场卡：人设和世界书在市场那张卡上、跟着市场更新，玩家这边只有卡号和手里的版本。
 */
import type { MarketCardContent } from '../../model/content.types';
import CopyableId from '../metering/CopyableId.vue';

defineProps<{ content: MarketCardContent }>();
</script>

<template>
  <el-descriptions
    :column="2"
    border
    size="small"
  >
    <el-descriptions-item label="市场卡">
      <CopyableId
        :value="content.cardId"
        label="市场卡 ID"
      />
    </el-descriptions-item>
    <el-descriptions-item label="持有版本">
      <span
        v-if="content.version != null"
        class="num"
      >v{{ content.version }}</span>
      <span
        v-else
        class="cell-muted"
      >—</span>
    </el-descriptions-item>
  </el-descriptions>
</template>

<style scoped>
.num {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
}

.cell-muted {
  color: var(--el-text-color-placeholder);
}
</style>
