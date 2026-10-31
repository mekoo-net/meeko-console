<script setup lang="ts">
/**
 * Tavern 世界列表，版式同调用日志页：筛选栏 + 满高表格 + 分页。
 *
 *  - 账户可以从账户页、积分账户页带 `?uid=` 过来
 *  - 账户格子点一下按这个账户筛，旁边的箭头去平台账户页
 *  - 删除是软删：默认只列没删的，状态选「已删除」能看到删掉的世界和它的内容
 */
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Search } from '@element-plus/icons-vue';

import PageHeader from '@/shared/ui/PageHeader.vue';
import StatusTag from '@/shared/ui/StatusTag.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import FilterBar from '@/shared/ui/FilterBar.vue';
import FillListPageLayout from '@/shared/ui/FillListPageLayout.vue';
import { formatDateTime } from '@/shared/lib/date';

import AccountCell from '../components/content/AccountCell.vue';
import CopyableId from '../components/metering/CopyableId.vue';
import { deleteWorld } from '../composables/contentActions';
import { useContentList } from '../composables/useContentList';
import { LifecycleStateLabel, LifecycleStateTone, lifecycleStateValues, type WorldRow } from '../model/content.types';
import { shortId } from '../model/meteringFormat';
import { getTavernContentPort } from '../services';

const port = getTavernContentPort();
const router = useRouter();

const { filter, reset, items, total, page, pageSize, loading, load } = useContentList((query, p) => port.worlds(query, p));

function openDetail(row: WorldRow): void {
  void router.push({
    name: 'tavern-world-detail',
    params: { accountUid: String(row.account.uid), worldId: row.id },
  });
}

async function remove(row: WorldRow): Promise<void> {
  if (await deleteWorld(row)) await load();
}

onMounted(() => void load());
</script>

<template>
  <FillListPageLayout>
    <template #header>
      <PageHeader title="世界" />
    </template>

    <template #filters>
      <FilterBar
        v-model:account-uid="filter.accountUid"
        :loading="loading"
        @refresh="load"
        @reset="reset"
      >
        <el-form-item label="标题">
          <el-input
            v-model="filter.keyword"
            :prefix-icon="Search"
            placeholder="模糊匹配"
            clearable
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select
            v-model="filter.state"
            style="width: 140px"
          >
            <el-option
              v-for="s in lifecycleStateValues"
              :key="s"
              :label="LifecycleStateLabel[s]"
              :value="s"
            />
          </el-select>
        </el-form-item>
      </FilterBar>
    </template>

    <el-table
      v-loading="loading"
      :data="items"
      row-key="id"
      size="small"
      class="compact-table"
      height="100%"
      :empty-text="' '"
    >
      <el-table-column
        label="世界"
        min-width="220"
      >
        <template #default="{ row }: { row: WorldRow }">
          <div class="cell-stack">
            <el-button
              link
              type="primary"
              class="cell-title"
              @click="openDetail(row)"
            >
              {{ row.title }}
            </el-button>
            <CopyableId
              :value="row.id"
              :display="shortId(row.id)"
              label="世界 ID"
              class="cell-sub"
            />
          </div>
        </template>
      </el-table-column>

      <el-table-column
        label="账户"
        min-width="200"
      >
        <template #default="{ row }: { row: WorldRow }">
          <AccountCell
            :account="row.account"
            @filter="(uid) => (filter.accountUid = String(uid))"
          />
        </template>
      </el-table-column>

      <el-table-column
        label="成员"
        width="72"
        align="right"
      >
        <template #default="{ row }: { row: WorldRow }">
          <span class="num">{{ row.stats.members }}</span>
        </template>
      </el-table-column>

      <el-table-column
        label="会话"
        width="72"
        align="right"
      >
        <template #default="{ row }: { row: WorldRow }">
          <span class="num">{{ row.stats.sessions }}</span>
        </template>
      </el-table-column>

      <el-table-column
        label="消息"
        width="88"
        align="right"
      >
        <template #default="{ row }: { row: WorldRow }">
          <span class="num">{{ row.stats.messages.toLocaleString() }}</span>
        </template>
      </el-table-column>

      <el-table-column
        label="最近活跃"
        width="150"
      >
        <template #default="{ row }: { row: WorldRow }">
          <span
            v-if="row.lastActiveAt != null"
            class="cell-date"
          >{{ formatDateTime(row.lastActiveAt) }}</span>
          <span
            v-else
            class="cell-muted"
          >—</span>
        </template>
      </el-table-column>

      <el-table-column
        label="创建时间"
        width="150"
      >
        <template #default="{ row }: { row: WorldRow }">
          <span class="cell-date">{{ formatDateTime(row.createdAt) }}</span>
        </template>
      </el-table-column>

      <el-table-column
        label="状态"
        width="90"
      >
        <template #default="{ row }: { row: WorldRow }">
          <StatusTag
            v-if="row.deletedAt != null"
            :label="LifecycleStateLabel.deleted"
            :tone="LifecycleStateTone.deleted"
          />
        </template>
      </el-table-column>

      <el-table-column
        label="操作"
        width="110"
        fixed="right"
        align="right"
      >
        <template #default="{ row }: { row: WorldRow }">
          <el-button
            link
            type="primary"
            size="small"
            @click="openDetail(row)"
          >
            详情
          </el-button>
          <el-button
            v-if="row.deletedAt == null"
            link
            type="danger"
            size="small"
            @click="remove(row)"
          >
            删除
          </el-button>
        </template>
      </el-table-column>

      <template #empty>
        <EmptyState
          title="没有符合条件的世界"
          description="调整筛选条件或重置后重试。"
        />
      </template>
    </el-table>

    <template #footer>
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        background
      />
    </template>
  </FillListPageLayout>
</template>

<style scoped>
.num {
  font-variant-numeric: tabular-nums;
}

.cell-stack {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-width: 0;
  line-height: 1.35;
}

.cell-title {
  max-width: 100%;
  padding: 0;
  height: auto;
  font-size: 13px;
  font-weight: 500;
}

.cell-title :deep(span) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
