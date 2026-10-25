<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';

import PageHeader from '@/shared/ui/PageHeader.vue';
import FilterBar from '@/shared/ui/FilterBar.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import FillListPageLayout from '@/shared/ui/FillListPageLayout.vue';
import { useListQuery } from '@/shared/composables/useListQuery';
import { formatDateTime } from '@/shared/lib/date';

import {
  activityStatusLabels,
  activityTitle,
  imageSrc,
  type ActivityCounts,
  type ActivityStatus,
  type ActivityStatusFilter,
  type YomiActivity,
} from '../model/activity.types';
import { DEFAULT_LOCALE } from '../model/activityMessages';
import { getYomiActivityPort } from '../services';

const port = getYomiActivityPort();
const router = useRouter();

interface Filter {
  status: ActivityStatusFilter;
  published: 'all' | 'published' | 'draft';
}

const defaultFilter = (): Filter => ({ status: 'all', published: 'all' });
const filter = ref<Filter>(defaultFilter());

function resetFilter(): void {
  filter.value = defaultFilter();
}
const counts = ref<ActivityCounts>({ all: 0, ongoing: 0, upcoming: 0, ended: 0 });

const list = useListQuery({
  filter,
  filterKey: () => `${filter.value.status}|${filter.value.published}`,
  fetcher: async ({ page, pageSize, filter: f }) => {
    const r = await port.list({
      page,
      pageSize,
      status: f.status,
      isPublished: f.published === 'all' ? null : f.published === 'published',
    });
    if (r.success) counts.value = r.data.counts;
    return r;
  },
  pageSize: 20,
});

const rows = computed(() => list.items.value?.items ?? []);

const statusOptions = computed(() => [
  { value: 'all', label: `全部 ${counts.value.all}` },
  { value: 'ongoing', label: `进行中 ${counts.value.ongoing}` },
  { value: 'upcoming', label: `即将开始 ${counts.value.upcoming}` },
  { value: 'ended', label: `已结束 ${counts.value.ended}` },
]);

const statusTagType: Record<ActivityStatus, 'success' | 'primary' | 'warning' | 'info'> = {
  ongoing: 'success',
  long_term: 'primary',
  upcoming: 'warning',
  ended: 'info',
};

/** 默认语言以外已有的标题，一眼看出哪些语言翻好了。 */
function otherTitles(a: YomiActivity): string {
  return Object.entries(a.titles).filter(([l, t]) => l !== DEFAULT_LOCALE && t).map(([, t]) => t).join(' / ');
}

function windowText(a: YomiActivity): string {
  if (!a.startAtUtc && !a.endAtUtc) return '长期有效';
  const s = a.startAtUtc ? formatDateTime(a.startAtUtc) : '即时';
  const e = a.endAtUtc ? formatDateTime(a.endAtUtc) : '长期';
  return `${s} ~ ${e}`;
}

function openCreate(): void {
  void router.push({ name: 'yomi-activity-new' });
}

function openEdit(a: YomiActivity): void {
  void router.push({ name: 'yomi-activity-edit', params: { id: a.id } });
}

function openClaims(a: YomiActivity): void {
  void router.push({ name: 'yomi-activity-claims', params: { id: a.id } });
}

const toggling = ref<string | null>(null);

async function togglePublished(a: YomiActivity, value: boolean): Promise<void> {
  toggling.value = a.id;
  try {
    const r = await port.setPublished(a.id, value);
    if (!r.success) {
      ElMessage.error(r.error.message);
      return;
    }
    ElMessage.success(value ? '已发布到官网' : '已撤回为草稿');
    void list.refresh();
  } finally {
    toggling.value = null;
  }
}

async function remove(a: YomiActivity): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定删除「${activityTitle(a)}」？删除后官网的详情页也会失效，不可恢复。不想展示可以改为草稿。`,
      '删除活动',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  const r = await port.remove(a.id);
  if (!r.success) {
    ElMessage.error(r.error.message);
    return;
  }
  ElMessage.success('已删除');
  void list.refresh();
}
</script>

<template>
  <FillListPageLayout>
    <template #header>
      <PageHeader title="活动中心">
        <template #actions>
          <el-button
            type="primary"
            :icon="Plus"
            @click="openCreate"
          >
            新建活动
          </el-button>
        </template>
      </PageHeader>
    </template>

    <template #filters>
      <FilterBar
        :loading="list.loading.value"
        @refresh="list.refresh()"
        @reset="resetFilter()"
      >
        <el-form-item label="阶段">
          <el-select v-model="filter.status">
            <el-option
              v-for="o in statusOptions"
              :key="o.value"
              :label="o.label"
              :value="o.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="发布">
          <el-select v-model="filter.published">
            <el-option
              label="全部"
              value="all"
            />
            <el-option
              label="已发布"
              value="published"
            />
            <el-option
              label="草稿"
              value="draft"
            />
          </el-select>
        </el-form-item>
      </FilterBar>
    </template>

    <el-table
      v-loading="list.loading.value"
      :data="rows"
      row-key="id"
      size="small"
      class="compact-table"
      height="100%"
      :empty-text="' '"
    >
      <el-table-column
        label="封面"
        width="112"
      >
        <template #default="{ row }: { row: YomiActivity }">
          <div
            class="thumb"
            :style="{ background: row.cover?.url ? undefined : row.theme.banner }"
          >
            <img
              v-if="row.cover?.url"
              :src="imageSrc(row.cover.url)!"
              alt=""
            >
          </div>
        </template>
      </el-table-column>
      <el-table-column
        label="活动"
        min-width="240"
      >
        <template #default="{ row }: { row: YomiActivity }">
          <div class="cell-name">
            <span class="cell-name__title">{{ activityTitle(row) }}</span>
            <span
              v-if="otherTitles(row)"
              class="cell-name__sub"
            >{{ otherTitles(row) }}</span>
            <span class="cell-name__slug">/activities/{{ row.slug }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column
        label="阶段"
        width="96"
      >
        <template #default="{ row }: { row: YomiActivity }">
          <el-tag
            size="small"
            :type="statusTagType[row.status]"
            effect="light"
          >
            {{ activityStatusLabels[row.status] }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        label="活动时间"
        min-width="230"
      >
        <template #default="{ row }: { row: YomiActivity }">
          {{ windowText(row) }}
        </template>
      </el-table-column>
      <el-table-column
        label="排序"
        width="70"
        prop="sortOrder"
      />
      <el-table-column
        label="发布"
        width="80"
      >
        <template #default="{ row }: { row: YomiActivity }">
          <el-switch
            :model-value="row.isPublished"
            :loading="toggling === row.id"
            size="small"
            @change="(v: string | number | boolean) => togglePublished(row, Boolean(v))"
          />
        </template>
      </el-table-column>
      <el-table-column
        label="更新于"
        width="140"
      >
        <template #default="{ row }: { row: YomiActivity }">
          {{ formatDateTime(row.updatedAtUtc) }}
        </template>
      </el-table-column>
      <el-table-column
        label="操作"
        width="190"
        fixed="right"
      >
        <template #default="{ row }: { row: YomiActivity }">
          <el-button
            link
            type="primary"
            @click="openEdit(row)"
          >
            编辑
          </el-button>
          <el-divider direction="vertical" />
          <el-button
            link
            @click="openClaims(row)"
          >
            领取记录
          </el-button>
          <el-divider direction="vertical" />
          <el-button
            link
            type="danger"
            @click="remove(row)"
          >
            删除
          </el-button>
        </template>
      </el-table-column>

      <template #empty>
        <EmptyState title="暂无活动" />
      </template>
    </el-table>

    <template #footer>
      <el-pagination
        v-model:current-page="list.pagination.state.page"
        v-model:page-size="list.pagination.state.pageSize"
        :total="list.pagination.state.total"
        :page-sizes="list.pagination.pageSizes"
        layout="total, sizes, prev, pager, next"
        background
      />
    </template>
  </FillListPageLayout>
</template>

<style scoped>
.thumb {
  display: grid;
  place-items: center;
  width: 88px;
  height: 44px;
  border-radius: 6px;
  overflow: hidden;
  font-size: 22px;
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.cell-name {
  display: flex;
  flex-direction: column;
  line-height: 1.35;
}
.cell-name__title {
  font-weight: 500;
}
.cell-name__sub,
.cell-name__slug {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.cell-name__slug {
  font-family: var(--el-font-family-mono, monospace);
}
</style>
