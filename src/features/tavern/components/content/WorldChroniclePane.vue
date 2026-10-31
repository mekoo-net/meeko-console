<script setup lang="ts">
/**
 * 世界纪事：世界里发生过的事，一条一句，服务端分页、最新在前。版式同账户页里的分页表。
 */
import { onMounted } from 'vue';

import { formatDateTime } from '@/shared/lib/date';

import { usePagedList } from '../../composables/usePagedList';
import { ChronicleKindLabel, type ChronicleEntry, type WorldKey } from '../../model/content.types';
import { formatStoryAt } from '../../model/contentFormat';
import { getTavernContentPort } from '../../services';

const props = defineProps<{ world: WorldKey }>();

const port = getTavernContentPort();

const { items, total, page, pageSize, loading, load } = usePagedList((p) => port.chronicle(props.world, p));

onMounted(() => void load());
</script>

<template>
  <div class="acc-page">
    <div class="acc-table-wrap">
      <el-table
        v-loading="loading"
        :data="items"
        row-key="id"
        size="small"
        height="100%"
        class="compact-table"
        empty-text="还没有纪事"
      >
        <el-table-column
          label="时间"
          width="150"
        >
          <template #default="{ row }: { row: ChronicleEntry }">
            <span class="cell-date">{{ formatDateTime(row.createdAt) }}</span>
          </template>
        </el-table-column>
        <el-table-column
          label="故事时刻"
          width="140"
        >
          <template #default="{ row }: { row: ChronicleEntry }">
            <span
              v-if="row.storyAt"
              class="cell-date"
            >{{ formatStoryAt(row.storyAt) }}</span>
            <span
              v-else
              class="cell-muted"
            >—</span>
          </template>
        </el-table-column>
        <el-table-column
          label="类型"
          width="96"
        >
          <template #default="{ row }: { row: ChronicleEntry }">
            <el-tag
              size="small"
              type="info"
              effect="plain"
            >
              {{ ChronicleKindLabel[row.kind] ?? row.kind }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          label="角色"
          width="110"
        >
          <template #default="{ row }: { row: ChronicleEntry }">
            <span v-if="row.persona">{{ row.persona.name }}</span>
            <span
              v-else
              class="cell-muted"
            >—</span>
          </template>
        </el-table-column>
        <el-table-column
          label="内容"
          min-width="320"
        >
          <template #default="{ row }: { row: ChronicleEntry }">
            <span class="cell-text">{{ row.text }}</span>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div class="pagination-bar">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        background
      />
    </div>
  </div>
</template>

<style scoped>
.cell-text {
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
