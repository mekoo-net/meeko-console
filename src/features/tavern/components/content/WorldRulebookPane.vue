<script setup lang="ts">
/**
 * 世界的规则书：版本和更新时间，下面是文档本身带上当前值（RULES.md §2–3）。
 * 当前值是世界 grain 里写过的值，服务端已按变量拆好、角色带上名字；没写过的取默认，这里是「—」。
 */
import { computed } from 'vue';

import EmptyState from '@/shared/ui/EmptyState.vue';
import { formatDateTime } from '@/shared/lib/date';

import type { Rulebook, WorldRuntime } from '../../model/content.types';
import RulebookDocumentView from './RulebookDocumentView.vue';

const props = defineProps<{ rulebook: Rulebook | null; runtime: WorldRuntime | null }>();

const valuesByName = computed(() => new Map(props.runtime?.variables.map((v) => [v.name, v.values])));
</script>

<template>
  <EmptyState
    v-if="!rulebook"
    title="还没有规则书"
  />
  <div
    v-else
    class="pane"
  >
    <div class="pane__meta">
      版本 {{ rulebook.version }} · 更新于 {{ formatDateTime(rulebook.updatedAt, 'YYYY-MM-DD HH:mm:ss') }}
    </div>
    <RulebookDocumentView
      :document="rulebook.document"
      :values="valuesByName"
    />
  </div>
</template>

<style scoped>
.pane {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  font-size: 13px;
  line-height: 1.6;
}

.pane__meta {
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
