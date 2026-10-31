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
    <el-descriptions-item label="市场角色卡">
      <router-link
        :to="{ name: 'tavern-market-cards', query: { cardId: content.cardId } }"
        class="link mono"
        title="在市场里看这张角色卡"
      >
        {{ content.cardId }}
      </router-link>
      <CopyableId
        :value="content.cardId"
        label="市场角色卡 ID"
        display=""
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

.link {
  color: var(--el-color-primary);
  text-decoration: none;
}

.mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
}

.cell-muted {
  color: var(--el-text-color-placeholder);
}
</style>
