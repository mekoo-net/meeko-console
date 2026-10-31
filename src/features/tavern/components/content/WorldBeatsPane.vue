<script setup lang="ts">
/**
 * 心理节拍：演员每次被唤醒的结局（开口、沉默、延后……）和当时的心声，服务端分页、最新在前。
 * 玩家在场景里看到「他没接话」时，员工在这里查是分诊判的、他自己选的，还是预算 / 发言权卡住了。
 */
import { onMounted, ref } from 'vue';

import StatusTag from '@/shared/ui/StatusTag.vue';
import { formatDateTime } from '@/shared/lib/date';

import { usePagedList } from '../../composables/usePagedList';
import {
  BeatOutcomeLabel,
  BeatOutcomeTone,
  BeatReasonLabel,
  BeatTriggerLabel,
  type Beat,
  type WorldKey,
  type WorldMember,
} from '../../model/content.types';
import { formatStoryAt } from '../../model/contentFormat';
import { getTavernContentPort } from '../../services';

const props = defineProps<{ world: WorldKey; members: WorldMember[] }>();

const port = getTavernContentPort();

/** 只看某个角色；空 = 全部。 */
const personaId = ref<number | undefined>();

const { items, total, page, pageSize, loading, load } = usePagedList(
  (p) => port.beats(props.world, { personaId: personaId.value }, p),
  personaId,
);

onMounted(() => void load());
</script>

<template>
  <div class="acc-page">
    <div class="tab-filter">
      <el-form
        :inline="true"
        @submit.prevent
      >
        <el-form-item label="角色">
          <el-select
            v-model="personaId"
            placeholder="全部"
            clearable
            style="width: 180px"
          >
            <el-option
              v-for="m in members"
              :key="m.persona.id"
              :label="m.persona.name"
              :value="m.persona.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
    </div>

    <div class="acc-table-wrap">
      <el-table
        v-loading="loading"
        :data="items"
        row-key="id"
        size="small"
        height="100%"
        class="compact-table"
        empty-text="没有心理节拍"
      >
        <el-table-column
          label="时间"
          width="150"
        >
          <template #default="{ row }: { row: Beat }">
            <span class="cell-date">{{ formatDateTime(row.createdAt) }}</span>
          </template>
        </el-table-column>
        <el-table-column
          label="故事时刻"
          width="130"
        >
          <template #default="{ row }: { row: Beat }">
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
          label="角色"
          width="96"
        >
          <template #default="{ row }: { row: Beat }">
            <el-button
              link
              type="primary"
              class="cell-link"
              :title="`只看「${row.persona.name}」`"
              @click="personaId = row.persona.id"
            >
              {{ row.persona.name }}
            </el-button>
          </template>
        </el-table-column>
        <el-table-column
          label="触发"
          width="96"
        >
          <template #default="{ row }: { row: Beat }">
            <span :title="row.trigger">{{ BeatTriggerLabel[row.trigger] ?? row.trigger }}</span>
          </template>
        </el-table-column>
        <el-table-column
          label="结局"
          width="88"
        >
          <template #default="{ row }: { row: Beat }">
            <StatusTag
              :label="BeatOutcomeLabel[row.outcome]"
              :tone="BeatOutcomeTone[row.outcome]"
            />
          </template>
        </el-table-column>
        <el-table-column
          label="感知"
          min-width="200"
        >
          <template #default="{ row }: { row: Beat }">
            <span
              v-if="row.perceived"
              class="cell-text"
            >{{ row.perceived }}</span>
            <span
              v-else
              class="cell-muted"
            >—</span>
          </template>
        </el-table-column>
        <el-table-column
          label="心声"
          min-width="180"
        >
          <template #default="{ row }: { row: Beat }">
            <span
              v-if="row.innerThought"
              class="cell-inner"
            >{{ row.innerThought }}</span>
            <span
              v-else
              class="cell-muted"
            >—</span>
          </template>
        </el-table-column>
        <el-table-column
          label="原因"
          min-width="160"
        >
          <template #default="{ row }: { row: Beat }">
            <div
              v-if="row.reason"
              class="cell-reason"
            >
              <span :title="row.reason.code">{{ BeatReasonLabel[row.reason.code] ?? row.reason.code }}</span>
              <span
                v-if="row.reason.detail"
                class="cell-sub"
              >{{ row.reason.detail }}</span>
            </div>
            <span
              v-else
              class="cell-muted"
            >—</span>
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
.tab-filter {
  flex-shrink: 0;
}

.tab-filter :deep(.el-form-item) {
  margin-bottom: 0;
}

.cell-link {
  padding: 0;
  height: auto;
  font-size: 12.5px;
}

.cell-text {
  white-space: pre-wrap;
  word-break: break-word;
}

.cell-inner {
  font-style: italic;
  color: var(--el-text-color-secondary);
  white-space: pre-wrap;
  word-break: break-word;
}

.cell-reason {
  display: flex;
  flex-direction: column;
  line-height: 1.35;
}
</style>
