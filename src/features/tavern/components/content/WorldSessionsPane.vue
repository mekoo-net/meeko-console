<script setup lang="ts">
/**
 * 世界树上的所有频道，玩家删掉的（保留期内）也在：处置要能翻到。点一行在抽屉里看消息和记忆。
 */
import StatusTag from '@/shared/ui/StatusTag.vue';
import { formatDateTime } from '@/shared/lib/date';

import {
  LifecycleStateLabel,
  LifecycleStateTone,
  SessionKindLabel,
  SessionKindTone,
  type SessionRow,
} from '../../model/content.types';
import { sessionName } from '../../model/contentFormat';

defineProps<{ sessions: SessionRow[] }>();
defineEmits<{ open: [sessionId: string] }>();
</script>

<template>
  <div class="acc-table-wrap">
    <el-table
      :data="sessions"
      row-key="id"
      size="small"
      height="100%"
      class="compact-table session-table"
      empty-text="没有会话"
      @row-click="(row: SessionRow) => $emit('open', row.id)"
    >
      <el-table-column
        label="类型"
        width="96"
      >
        <template #default="{ row }: { row: SessionRow }">
          <el-tag
            size="small"
            :type="SessionKindTone[row.kind]"
            effect="plain"
          >
            {{ SessionKindLabel[row.kind] }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        label="会话"
        min-width="220"
      >
        <template #default="{ row }: { row: SessionRow }">
          <div class="cell-stack">
            <span class="cell-name">{{ sessionName(row) }}</span>
            <span class="cell-sub mono">{{ row.id }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column
        label="消息"
        width="88"
        align="right"
      >
        <template #default="{ row }: { row: SessionRow }">
          <span class="num">{{ row.messages.toLocaleString() }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="最近活跃"
        width="160"
      >
        <template #default="{ row }: { row: SessionRow }">
          <span class="cell-date">{{ formatDateTime(row.lastActiveAt) }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="创建时间"
        width="160"
      >
        <template #default="{ row }: { row: SessionRow }">
          <span class="cell-date">{{ formatDateTime(row.createdAt) }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="状态"
        width="90"
      >
        <template #default="{ row }: { row: SessionRow }">
          <StatusTag
            v-if="row.deletedAt != null"
            :label="LifecycleStateLabel.deleted"
            :tone="LifecycleStateTone.deleted"
          />
        </template>
      </el-table-column>
      <el-table-column
        label="操作"
        width="72"
        align="right"
      >
        <template #default="{ row }: { row: SessionRow }">
          <el-button
            link
            type="primary"
            size="small"
            @click.stop="$emit('open', row.id)"
          >
            查看
          </el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}
.num {
  font-variant-numeric: tabular-nums;
}
.cell-stack {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.35;
}
.cell-name {
  font-weight: 500;
  color: var(--el-text-color-primary);
}
.session-table :deep(.el-table__row) {
  cursor: pointer;
}
</style>
