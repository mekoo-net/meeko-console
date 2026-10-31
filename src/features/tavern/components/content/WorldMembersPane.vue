<script setup lang="ts">
/**
 * 世界成员：在场的按出场顺序在前，离开的在后（服务端排好）。演员在世界里的身份就是它的私聊，点开看消息和记忆。
 */
import { formatDateTime } from '@/shared/lib/date';

import type { WorldMember } from '../../model/content.types';
import { initialOf } from '../../model/contentFormat';

defineProps<{ members: WorldMember[] }>();
defineEmits<{ open: [sessionId: string] }>();
</script>

<template>
  <div class="acc-table-wrap">
    <el-table
      :data="members"
      :row-key="(m: WorldMember) => String(m.persona.id)"
      size="small"
      height="100%"
      class="compact-table"
      empty-text="没有成员"
    >
      <el-table-column
        label="角色"
        min-width="220"
      >
        <template #default="{ row }: { row: WorldMember }">
          <div class="cell-persona">
            <el-avatar
              :size="32"
              shape="square"
              :src="row.persona.avatar ?? undefined"
              class="cell-persona__avatar"
            >
              {{ initialOf(row.persona.name) }}
            </el-avatar>
            <div class="cell-stack">
              <span class="cell-name">{{ row.persona.name }}</span>
              <span class="cell-uid">{{ row.persona.id }}</span>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column
        label="加入时间"
        width="160"
      >
        <template #default="{ row }: { row: WorldMember }">
          <span class="cell-date">{{ formatDateTime(row.joinedAt) }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="离开时间"
        width="200"
      >
        <template #default="{ row }: { row: WorldMember }">
          <template v-if="row.leftAt != null">
            <el-tag
              size="small"
              type="info"
              effect="plain"
            >
              已离开
            </el-tag>
            <span class="cell-date cell-gap">{{ formatDateTime(row.leftAt) }}</span>
          </template>
          <span
            v-else
            class="cell-muted"
          >—</span>
        </template>
      </el-table-column>
      <el-table-column
        label="私聊"
        width="100"
        align="right"
      >
        <template #default="{ row }: { row: WorldMember }">
          <el-button
            link
            type="primary"
            size="small"
            @click="$emit('open', row.dmSessionId)"
          >
            查看私聊
          </el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.cell-persona {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.cell-persona__avatar {
  flex-shrink: 0;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  background: var(--el-color-primary);
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
.cell-gap {
  margin-left: 6px;
}
</style>
