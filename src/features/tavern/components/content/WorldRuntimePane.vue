<script setup lang="ts">
/**
 * 世界记忆：世界 grain 的运行态快照——概要、故事钟、日程里还没发生的事件、地点。
 * 规则变量的值在规则书页，挨着变量定义看。
 */
import EmptyState from '@/shared/ui/EmptyState.vue';

import type { Place, StoryEvent, WorldRuntime } from '../../model/content.types';
import { formatStoryAt } from '../../model/contentFormat';

defineProps<{ runtime: WorldRuntime | null }>();
</script>

<template>
  <EmptyState
    v-if="!runtime"
    title="世界尚未运行过"
  />
  <div
    v-else
    class="pane"
  >
    <h4 class="section-title">
      世界概要
    </h4>
    <div
      v-if="runtime.overview"
      class="text-block"
    >
      {{ runtime.overview }}
    </div>
    <span
      v-else
      class="cell-muted"
    >无</span>

    <h4 class="section-title section-title--gap">
      故事时钟
    </h4>
    <span
      v-if="runtime.storyClockIso"
      class="mono"
    >{{ formatStoryAt(runtime.storyClockIso) }}</span>
    <span
      v-else
      class="cell-muted"
    >未开始</span>

    <el-divider />

    <h4 class="section-title">
      日程
    </h4>
    <el-table
      :data="runtime.events"
      row-key="id"
      size="small"
      class="compact-table"
      empty-text="没有待发生的事件"
    >
      <el-table-column
        label="故事时刻"
        width="150"
      >
        <template #default="{ row }: { row: StoryEvent }">
          <span class="mono">{{ formatStoryAt(row.atIso) }}</span>
        </template>
      </el-table-column>
      <el-table-column
        prop="title"
        label="事件"
        min-width="200"
      />
      <el-table-column
        label="备注"
        min-width="160"
      >
        <template #default="{ row }: { row: StoryEvent }">
          <span v-if="row.note">{{ row.note }}</span>
          <span
            v-else
            class="cell-muted"
          >—</span>
        </template>
      </el-table-column>
    </el-table>

    <el-divider />

    <h4 class="section-title">
      地点
    </h4>
    <el-table
      :data="runtime.places"
      row-key="id"
      size="small"
      class="compact-table"
      empty-text="没有地点"
    >
      <el-table-column
        prop="name"
        label="名称"
        min-width="140"
      />
      <el-table-column
        label="区域"
        width="120"
      >
        <template #default="{ row }: { row: Place }">
          <span v-if="row.zone">{{ row.zone }}</span>
          <span
            v-else
            class="cell-muted"
          >—</span>
        </template>
      </el-table-column>
      <el-table-column
        label="备注"
        min-width="160"
      >
        <template #default="{ row }: { row: Place }">
          <span v-if="row.note">{{ row.note }}</span>
          <span
            v-else
            class="cell-muted"
          >—</span>
        </template>
      </el-table-column>
      <el-table-column
        label="ID"
        min-width="200"
      >
        <template #default="{ row }: { row: Place }">
          <span class="mono mono--muted">{{ row.id }}</span>
        </template>
      </el-table-column>
    </el-table>
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

.section-title {
  margin: 6px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}

.section-title--gap {
  margin-top: 16px;
}

.text-block {
  padding: 8px 10px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  font-size: 12.5px;
  color: var(--el-text-color-regular);
  white-space: pre-wrap;
  word-break: break-word;
}

.mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
}

.mono--muted {
  color: var(--el-text-color-secondary);
}

.cell-muted {
  color: var(--el-text-color-placeholder);
}
</style>
