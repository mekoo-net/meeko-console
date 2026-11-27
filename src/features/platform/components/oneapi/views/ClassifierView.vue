<script setup lang="ts">
/**
 * 分类器（安全策略 → 分类器）：什么样的请求算哪一类——`chat.app`、`chat.tavern`、`agent.claude`……
 *
 * 规则下发给 OneApi 网关，网关编译好以后拿它匹配每个请求，认出是哪一类。分类器本身没有任何动作，
 * 不放行也不拒绝：拦不拦是「过滤器」那一页的事，过滤规则引用分类器做条件。遥测里一个请求「是哪一类」，
 * 看从上往下第一个成立的分类器，所以这一页的顺序有意义；过滤规则引用分类器时只看它自己成不成立，不看顺序。
 *
 * 版面和过滤器页一样左右分栏：左边按类别（id 的第一级）挑，右边是这一类的分类器，一行一个、分页。
 * 分类器一多（一整套有二十几个），全摊在一页里找不着。
 *
 * 分类器和过滤规则在网关那边是一整份文档，这一页只改分类器那一块，存的是整份（见 useFilterDocument）。
 */
import { computed, ref, watch } from 'vue';
import { Bottom, CollectionTag, Delete, Edit, Plus, Refresh, Top } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

import { confirmDanger } from '@/shared/composables/useConfirm';
import EmptyState from '@/shared/ui/EmptyState.vue';
import PageHeader from '@/shared/ui/PageHeader.vue';
import WorkspaceDetailPanel from '@/shared/ui/workspace/WorkspaceDetailPanel.vue';
import WorkspaceLayout from '@/shared/ui/workspace/WorkspaceLayout.vue';
import { useAuthStore } from '@/stores/auth';

import ClassifierDialog from '../components/filter/ClassifierDialog.vue';
import ConditionChips from '../components/filter/ConditionChips.vue';
import FilterProblemsAlert from '../components/filter/FilterProblemsAlert.vue';
import { categoryLook, categoryOf, lookOfCategory } from '../components/filter/classifierCategory';
import { useFilterDocument } from '../composables/useFilterDocument';
import {
  blockingUses,
  classifierUses,
  classifiersOf,
  moveClassifier,
  problemsOfClassifier,
  removeClassifier,
  upsertClassifier,
  vendorList,
} from '../model/filter';
import type { FilterClassifier } from '../model/filter.types';

const auth = useAuthStore();
/** 没有写权限的人只能看。 */
const canWrite = computed(() => auth.hasPermission('platform.settings.write'));

const { doc, schema, problems, loading, loaded, loadError, saving, load, commit, checkThenCommit } =
  useFilterDocument();

const classifiers = computed(() => classifiersOf(doc.value));
const usesOf = (c: FilterClassifier) => classifierUses(doc.value, c.id);
const vendorName = (key: string): string =>
  vendorList(doc.value, schema.value.vendors).find((v) => v.key.toLowerCase() === key.toLowerCase())?.displayName ??
  key;
const rowProblems = (c: FilterClassifier, index: number): string[] => problemsOfClassifier(problems.value, c.id, index);

// ---- 左边：按类别挑 ----------------------------------------------------------------

const ALL = '';
const category = ref(ALL);
const categories = computed(() => {
  const counts = new Map<string, number>();
  for (const c of classifiers.value) counts.set(categoryOf(c.id), (counts.get(categoryOf(c.id)) ?? 0) + 1);
  return [...counts].map(([key, count]) => ({ key, count, look: lookOfCategory(key) }));
});
/** 每一行带着它在整份里的位置：顺序那一格显示的是它，筛过以后不重新编号。 */
const rows = computed(() =>
  classifiers.value
    .map((c, index) => ({ c, index }))
    .filter(({ c }) => category.value === ALL || categoryOf(c.id) === category.value),
);
const usedCount = computed(() => rows.value.filter(({ c }) => usesOf(c).length > 0).length);
const title = computed(() => (category.value === ALL ? '全部分类器' : lookOfCategory(category.value).label));
/** 顺序是整份的，筛着的时候上移下移会跨过看不见的那些，所以不让调。 */
const canReorder = computed(() => category.value === ALL);

function selectCategory(key: string): void {
  category.value = key;
  page.value = 1;
}

// ---- 右边：分页 --------------------------------------------------------------------

const PAGE_SIZES = [10, 20, 50];
const page = ref(1);
const pageSize = ref(PAGE_SIZES[0]!);
const pageCount = computed(() => Math.max(1, Math.ceil(rows.value.length / pageSize.value)));
const pagedRows = computed(() => rows.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value));
// 删掉最后一页的最后一个、或者换成每页更多条时，别停在一个空页上。
watch(pageCount, (count) => {
  if (page.value > count) page.value = count;
});

async function onMove(c: FilterClassifier, direction: -1 | 1): Promise<void> {
  const next = moveClassifier(doc.value, c.id, direction);
  if (next !== doc.value) await commit(next);
}

/**
 * 还有过滤规则点名引用它就不让删：删了那几个 Vendor 的过滤器网关读不懂，会整个不生效。
 * 经 `agent.*` 这种一整类引用的不拦，除非它是这一类的最后一个（见 blockingUses）。
 */
async function onRemove(c: FilterClassifier): Promise<void> {
  const uses = blockingUses(doc.value, c.id);
  if (uses.length > 0) {
    const where = uses.map((u) => `${vendorName(u.vendor)} 的「${u.ruleId}」`).join('、');
    ElMessage.warning(`先到过滤器里改掉引用它的规则：${where}`);
    return;
  }
  const sure = await confirmDanger({
    title: '删除分类器',
    message: `删除分类器「${c.id}」？它认的请求以后不再算这一类。`,
    confirmText: '删除',
  });
  if (!sure) return;
  if (await commit(removeClassifier(doc.value, c.id))) ElMessage.success('已删除');
}

// ---- 新建和编辑 -------------------------------------------------------------------

const dialogOpen = ref(false);
const editing = ref<FilterClassifier | null>(null);
const dialogProblems = ref<string[]>([]);
const submitting = ref(false);
const takenIds = computed(() => classifiers.value.map((c) => c.id));

function openCreate(): void {
  editing.value = null;
  dialogProblems.value = [];
  dialogOpen.value = true;
}

function openEdit(c: FilterClassifier): void {
  editing.value = c;
  dialogProblems.value = [];
  dialogOpen.value = true;
}

/** 新建的排在最后：翻到它所在的那一页；它不属于正在看的类别就回到「全部」。 */
function reveal(id: string): void {
  if (category.value !== ALL && categoryOf(id) !== category.value) category.value = ALL;
  const at = rows.value.findIndex(({ c }) => c.id === id);
  if (at >= 0) page.value = Math.floor(at / pageSize.value) + 1;
}

async function onSubmit(c: FilterClassifier, originalId: string | undefined): Promise<void> {
  if (submitting.value) return;
  const next = upsertClassifier(doc.value, c, originalId);
  const index = classifiersOf(next).findIndex((x) => x.id === c.id);

  submitting.value = true;
  const left = await checkThenCommit(next, (found) => problemsOfClassifier(found, c.id, index));
  submitting.value = false;
  if (left !== null) {
    dialogProblems.value = left;
    return;
  }
  dialogOpen.value = false;
  if (originalId === undefined) reveal(c.id);
  ElMessage.success(originalId === undefined ? '已新建，网关已经在用了' : '已保存，网关已经在用了');
}
</script>

<template>
  <WorkspaceLayout :loading="loading && !loaded">
    <template #header>
      <PageHeader
        title="分类器"
        description="网关按这里的规则认出一个请求是哪一类，本身不放行也不拒绝。要拦请求，到「过滤器」里引用它。"
      >
        <template #actions>
          <el-button
            :icon="Refresh"
            :loading="loading && loaded"
            @click="load"
          >
            刷新
          </el-button>
          <el-button
            v-if="canWrite && !loadError"
            :icon="Plus"
            type="primary"
            data-test="classifier-create"
            @click="openCreate"
          >
            新建分类器
          </el-button>
        </template>
      </PageHeader>
      <FilterProblemsAlert :problems="problems" />
    </template>

    <aside class="provider-sidebar cat-sidebar">
      <div
        class="provider-sidebar__list"
        role="tablist"
      >
        <button
          type="button"
          class="provider-sidebar__item cat-item"
          :class="{ 'provider-sidebar__item--active': category === ALL }"
          data-test="category-all"
          @click="selectCategory(ALL)"
        >
          <span class="cat-item__mark">
            <el-icon :size="15"><CollectionTag /></el-icon>
          </span>
          <span class="cat-item__name">全部</span>
          <span class="cat-item__count">{{ classifiers.length }}</span>
        </button>
        <button
          v-for="cat in categories"
          :key="cat.key"
          type="button"
          class="provider-sidebar__item cat-item"
          :class="{ 'provider-sidebar__item--active': category === cat.key }"
          :style="{ '--cat-color': cat.look.color }"
          :data-category="cat.key"
          @click="selectCategory(cat.key)"
        >
          <span class="cat-item__mark">
            <el-icon :size="15"><component :is="cat.look.icon" /></el-icon>
          </span>
          <span class="cat-item__name">{{ cat.look.label }}</span>
          <span class="cat-item__count">{{ cat.count }}</span>
        </button>
      </div>
    </aside>

    <WorkspaceDetailPanel :show-placeholder="loadError !== null || (loaded && classifiers.length === 0)">
      <template #placeholder>
        <EmptyState
          v-if="loadError"
          title="没读到分类器"
          :description="loadError"
        >
          <el-button
            :icon="Refresh"
            @click="load"
          >
            重试
          </el-button>
        </EmptyState>
        <EmptyState
          v-else
          title="还没有分类器"
          description="分类器说一个请求是哪一类，过滤器引用它来决定拦不拦。"
        >
          <el-button
            v-if="canWrite"
            :icon="Plus"
            type="primary"
            @click="openCreate"
          >
            新建分类器
          </el-button>
        </EmptyState>
      </template>

      <template #header>
        <div class="cls-head">
          <div class="cls-head__text">
            <h2 class="provider-detail__title">
              {{ title }}
            </h2>
            <p class="cls-head__sub">
              一个请求是哪一类，看从上往下第一个成立的分类器；过滤器引用分类器时只看它自己成不成立。
            </p>
          </div>
          <div class="cls-stats">
            <span class="cls-stat"><b>{{ rows.length }}</b> 个</span>
            <span class="cls-stat"><b>{{ usedCount }}</b> 个被过滤器引用</span>
          </div>
        </div>
      </template>

      <div
        v-loading="saving"
        class="cls-table"
      >
        <div
          class="cls-row cls-row--head"
          :class="{ 'cls-row--readonly': !canWrite }"
          aria-hidden="true"
        >
          <span>#</span>
          <span />
          <span>分类器</span>
          <span>条件</span>
          <span>被引用</span>
          <span v-if="canWrite" />
        </div>
        <ol class="cls-list">
          <li
            v-for="{ c, index } in pagedRows"
            :key="c.id"
            class="cls-row"
            :class="{ 'cls-row--readonly': !canWrite }"
            :style="{ '--cat-color': categoryLook(c.id).color }"
            :data-classifier="c.id"
          >
            <span class="cls-row__order">{{ index + 1 }}</span>
            <span class="cls-row__mark">
              <el-icon :size="14"><component :is="categoryLook(c.id).icon" /></el-icon>
            </span>

            <div class="cls-row__who">
              <span class="cls-row__name">
                {{ c.name || c.id }}
                <el-tag
                  v-if="rowProblems(c, index).length > 0"
                  size="small"
                  type="danger"
                  effect="light"
                  round
                >
                  网关读不懂
                </el-tag>
              </span>
              <code
                v-if="c.name"
                class="cls-row__id"
              >{{ c.id }}</code>
            </div>

            <div class="cls-row__when">
              <ConditionChips
                :when="c.when"
                compact
              />
            </div>

            <div class="cls-row__uses">
              <span
                v-for="u in usesOf(c)"
                :key="`${u.vendor}/${u.ruleId}`"
                class="cls-row__use"
                :title="u.via ? `经 ${u.via} 引用` : undefined"
              >{{ vendorName(u.vendor) }} · {{ u.ruleId }}</span>
              <span
                v-if="usesOf(c).length === 0"
                class="cls-row__unused"
              >未引用</span>
            </div>

            <div
              v-if="canWrite"
              class="cls-row__ops"
            >
              <el-tooltip
                :content="canReorder ? '上移' : '按类别筛选时不能调顺序'"
                :show-after="400"
              >
                <el-button
                  :icon="Top"
                  text
                  circle
                  size="small"
                  :disabled="!canReorder || index === 0 || saving"
                  aria-label="上移"
                  data-test="classifier-up"
                  @click="onMove(c, -1)"
                />
              </el-tooltip>
              <el-tooltip
                :content="canReorder ? '下移' : '按类别筛选时不能调顺序'"
                :show-after="400"
              >
                <el-button
                  :icon="Bottom"
                  text
                  circle
                  size="small"
                  :disabled="!canReorder || index === classifiers.length - 1 || saving"
                  aria-label="下移"
                  data-test="classifier-down"
                  @click="onMove(c, 1)"
                />
              </el-tooltip>
              <el-button
                :icon="Edit"
                text
                circle
                size="small"
                aria-label="编辑"
                data-test="classifier-edit"
                @click="openEdit(c)"
              />
              <el-button
                :icon="Delete"
                text
                circle
                size="small"
                type="danger"
                :disabled="saving"
                aria-label="删除"
                data-test="classifier-delete"
                @click="onRemove(c)"
              />
            </div>
          </li>
        </ol>
      </div>

      <div class="provider-pagination">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="rows.length"
          :page-sizes="PAGE_SIZES"
          layout="total, sizes, prev, pager, next"
          background
        />
      </div>
    </WorkspaceDetailPanel>

    <ClassifierDialog
      v-model="dialogOpen"
      :classifier="editing"
      :schema="schema"
      :taken-ids="takenIds"
      :groups="categories.map((cat) => cat.key)"
      :default-group="category === ALL ? undefined : category"
      :submitting="submitting"
      :problems="dialogProblems"
      @submit="onSubmit"
    />
  </WorkspaceLayout>
</template>

<style scoped>
/* ---- 左边：类别 ---- */
.cat-sidebar {
  flex-basis: 200px;
}
.cat-item {
  --cat-color: var(--el-color-primary);
  display: flex;
  align-items: center;
  gap: 10px;
}
.cat-item__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 28px;
  height: 28px;
  border-radius: 8px;
  color: var(--cat-color);
  background: color-mix(in srgb, var(--cat-color) 12%, transparent);
}
.cat-item__name {
  flex: 1;
  min-width: 0;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.cat-item__count {
  min-width: 22px;
  padding: 0 6px;
  border-radius: 10px;
  font-size: 12px;
  line-height: 20px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  background: var(--el-fill-color);
  color: var(--el-text-color-secondary);
}
.provider-sidebar__item--active .cat-item__count {
  background: var(--el-color-primary-light-8);
  color: var(--el-color-primary);
}

/* ---- 右边：表头 ---- */
.cls-head {
  display: flex;
  align-items: center;
  gap: 24px;
  width: 100%;
  min-width: 0;
}
.cls-head__text {
  flex: 1;
  min-width: 0;
}
.cls-head__sub {
  margin: 4px 0 0;
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
}
.cls-stats {
  display: flex;
  gap: 16px;
  white-space: nowrap;
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
}
.cls-stat b {
  margin-right: 2px;
  font-size: 15px;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-primary);
}

/* ---- 右边：一行一个 ---- */
.cls-table {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.cls-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.cls-row {
  display: grid;
  grid-template-columns: 28px 26px minmax(160px, 220px) minmax(0, 1fr) minmax(120px, 170px) 112px;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--el-border-color-extra-light);
}
.cls-row--readonly {
  grid-template-columns: 28px 26px minmax(160px, 220px) minmax(0, 1fr) minmax(120px, 170px);
}
.cls-row--head {
  position: sticky;
  top: 0;
  z-index: 1;
  min-height: 36px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-lighter);
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.cls-list .cls-row:hover {
  background: var(--el-fill-color-light);
}
.cls-row__order {
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-placeholder);
  text-align: center;
}
.cls-row__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 7px;
  color: var(--cat-color);
  background: color-mix(in srgb, var(--cat-color) 12%, transparent);
}
.cls-row__who {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.cls-row__name {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  font-size: 13.5px;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--el-text-color-primary);
}
.cls-row__id {
  overflow: hidden;
  font-size: 11.5px;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--el-text-color-secondary);
}
.cls-row__when {
  min-width: 0;
  overflow: hidden;
}
.cls-row__uses {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  min-width: 0;
}
.cls-row__use {
  padding: 2px 7px;
  border-radius: 6px;
  font-size: 12px;
  white-space: nowrap;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.cls-row__unused {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
.cls-row__ops {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
  opacity: 0.45;
  transition: opacity 0.15s;
}
.cls-row:hover .cls-row__ops,
.cls-row__ops:focus-within {
  opacity: 1;
}
.cls-row__ops .el-button + .el-button {
  margin-left: 0;
}

@media (max-width: 1100px) {
  .cls-row,
  .cls-row--readonly {
    grid-template-columns: 28px 26px minmax(140px, 1fr) minmax(0, 1.4fr) 112px;
  }
  .cls-row__uses,
  .cls-row--head > :nth-child(5) {
    display: none;
  }
}
</style>
