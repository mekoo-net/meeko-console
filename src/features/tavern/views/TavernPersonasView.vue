<script setup lang="ts">
/**
 * Tavern 角色卡列表，版式同世界列表：筛选栏 + 满高表格 + 分页，详情在抽屉里看。
 * 账户可以带 `?uid=` 过来；账户格子点一下按这个账户筛。删除是软删，状态选「已删除」能看到。
 */
import { onMounted, ref } from 'vue';
import { Search } from '@element-plus/icons-vue';

import PageHeader from '@/shared/ui/PageHeader.vue';
import StatusTag from '@/shared/ui/StatusTag.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import FilterBar from '@/shared/ui/FilterBar.vue';
import FillListPageLayout from '@/shared/ui/FillListPageLayout.vue';
import { formatDateTime } from '@/shared/lib/date';

import AccountCell from '../components/content/AccountCell.vue';
import PersonaDrawer from '../components/content/PersonaDrawer.vue';
import { deletePersona } from '../composables/contentActions';
import { useContentList } from '../composables/useContentList';
import { LifecycleStateLabel, LifecycleStateTone, lifecycleStateValues, type PersonaRow } from '../model/content.types';
import { initialOf } from '../model/contentFormat';
import { getTavernContentPort } from '../services';

const port = getTavernContentPort();

/** 列表里标签只露几个，全部在详情里。 */
const TAG_LIMIT = 3;

const { filter, reset, items, total, page, pageSize, loading, load } = useContentList((query, p) => port.personas(query, p));

const detailOpen = ref(false);
const detailId = ref<number | null>(null);

function openDetail(row: PersonaRow): void {
  detailId.value = row.id;
  detailOpen.value = true;
}

async function remove(row: PersonaRow): Promise<void> {
  if (await deletePersona(row)) await load();
}

onMounted(() => void load());
</script>

<template>
  <FillListPageLayout>
    <template #header>
      <PageHeader title="角色卡" />
    </template>

    <template #filters>
      <FilterBar
        v-model:account-uid="filter.accountUid"
        :loading="loading"
        @refresh="load"
        @reset="reset"
      >
        <el-form-item label="名字">
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
        label="角色"
        min-width="180"
      >
        <template #default="{ row }: { row: PersonaRow }">
          <div class="cell-persona">
            <el-avatar
              :size="32"
              shape="square"
              :src="row.avatar ?? undefined"
              class="cell-persona__avatar"
            >
              {{ initialOf(row.name) }}
            </el-avatar>
            <div class="cell-stack">
              <el-button
                link
                type="primary"
                class="cell-title"
                @click="openDetail(row)"
              >
                {{ row.name }}
              </el-button>
              <span class="cell-uid">{{ row.id }}</span>
            </div>
          </div>
        </template>
      </el-table-column>

      <el-table-column
        label="账户"
        min-width="180"
      >
        <template #default="{ row }: { row: PersonaRow }">
          <AccountCell
            :account="row.account"
            @filter="(uid) => (filter.accountUid = String(uid))"
          />
        </template>
      </el-table-column>

      <el-table-column
        label="简介"
        min-width="160"
        show-overflow-tooltip
      >
        <template #default="{ row }: { row: PersonaRow }">
          <span v-if="row.profile.tagline">{{ row.profile.tagline }}</span>
          <span
            v-else
            class="cell-muted"
          >—</span>
        </template>
      </el-table-column>

      <el-table-column
        label="标签"
        min-width="150"
      >
        <template #default="{ row }: { row: PersonaRow }">
          <div
            v-if="row.profile.tags.length"
            class="cell-tags"
          >
            <el-tag
              v-for="t in row.profile.tags.slice(0, TAG_LIMIT)"
              :key="t"
              size="small"
              type="info"
              effect="plain"
            >
              {{ t }}
            </el-tag>
            <span
              v-if="row.profile.tags.length > TAG_LIMIT"
              class="cell-muted"
              :title="row.profile.tags.join('、')"
            >+{{ row.profile.tags.length - TAG_LIMIT }}</span>
          </div>
          <span
            v-else
            class="cell-muted"
          >—</span>
        </template>
      </el-table-column>

      <el-table-column
        label="所在世界"
        width="88"
        align="right"
      >
        <template #default="{ row }: { row: PersonaRow }">
          <span class="num">{{ row.worlds }}</span>
        </template>
      </el-table-column>

      <el-table-column
        label="市场卡"
        width="72"
        align="center"
      >
        <template #default="{ row }: { row: PersonaRow }">
          <el-tag
            v-if="row.card"
            size="small"
            type="success"
            effect="plain"
            :title="row.card.id"
          >
            {{ row.card.version != null ? `v${row.card.version}` : '市场' }}
          </el-tag>
          <span
            v-else
            class="cell-muted"
          >—</span>
        </template>
      </el-table-column>

      <el-table-column
        label="更新时间"
        width="140"
      >
        <template #default="{ row }: { row: PersonaRow }">
          <span class="cell-date">{{ formatDateTime(row.updatedAt) }}</span>
        </template>
      </el-table-column>

      <el-table-column
        label="状态"
        width="80"
      >
        <template #default="{ row }: { row: PersonaRow }">
          <StatusTag
            v-if="row.deletedAt != null"
            :label="LifecycleStateLabel.deleted"
            :tone="LifecycleStateTone.deleted"
          />
        </template>
      </el-table-column>

      <el-table-column
        label="操作"
        width="100"
        fixed="right"
        align="right"
      >
        <template #default="{ row }: { row: PersonaRow }">
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
          title="没有符合条件的角色卡"
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

  <PersonaDrawer
    v-model:visible="detailOpen"
    :persona-id="detailId"
    @deleted="load"
  />
</template>

<style scoped>
.num {
  font-variant-numeric: tabular-nums;
}

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

.cell-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
</style>
