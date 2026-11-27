<script setup lang="ts">
/**
 * 分类器（安全策略 → 分类器）：什么样的请求算哪一类——`chat.app`、`chat.tavern`、`agent.claude`……
 *
 * 规则下发给 OneApi 网关，网关编译好以后拿它匹配每个请求，认出是哪一类。分类器本身没有任何动作，
 * 不放行也不拒绝：拦不拦是「过滤器」那一页的事，过滤规则引用分类器做条件。遥测里一个请求「是哪一类」，
 * 看从上往下第一个成立的分类器，所以这一页的顺序有意义；过滤规则引用分类器时只看它自己成不成立，不看顺序。
 *
 * 条件现在能看的是请求头。能看哪些字段是网关的编译器自己报的（号池后台的 schema 接口），网关以后多认内容里的字段，
 * 这一页的下拉框跟着就有，不用改这里。
 *
 * 分类器和过滤规则在网关那边是一整份文档，这一页只改分类器那一块，存的是整份（见 useFilterDocument）。
 */
import { computed, ref } from 'vue';
import { Bottom, Delete, Edit, Plus, Refresh, Top } from '@element-plus/icons-vue';
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
const usedCount = computed(() => classifiers.value.filter((c) => usesOf(c).length > 0).length);
const vendorName = (key: string): string =>
  vendorList(doc.value, schema.value.vendors).find((v) => v.key.toLowerCase() === key.toLowerCase())?.displayName ??
  key;
const rowProblems = (c: FilterClassifier, index: number): string[] => problemsOfClassifier(problems.value, c.id, index);

// ---- 按类别看 ----------------------------------------------------------------------

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
/** 顺序是整份的，筛着的时候上移下移会跨过看不见的那些，所以不让调。 */
const canReorder = computed(() => category.value === ALL);

async function onMove(c: FilterClassifier, direction: -1 | 1): Promise<void> {
  const next = moveClassifier(doc.value, c.id, direction);
  if (next !== doc.value) await commit(next);
}

/** 还有过滤规则引用它就不让删：删了那几个 Vendor 的过滤器网关读不懂，会整个不生效。 */
async function onRemove(c: FilterClassifier): Promise<void> {
  const uses = usesOf(c);
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
              全部分类器
            </h2>
            <p class="cls-head__sub">
              一个请求是哪一类，看从上往下第一个成立的分类器；过滤器引用分类器时只看它自己成不成立。
            </p>
          </div>
          <div class="cls-stats">
            <div class="cls-stat">
              <span class="cls-stat__value">{{ classifiers.length }}</span>
              <span class="cls-stat__label">分类器</span>
            </div>
            <div class="cls-stat">
              <span class="cls-stat__value">{{ usedCount }}</span>
              <span class="cls-stat__label">被过滤器引用</span>
            </div>
          </div>
        </div>
      </template>

      <template #toolbar>
        <div
          class="cat-bar"
          role="tablist"
        >
          <button
            type="button"
            class="cat-chip"
            :class="{ 'cat-chip--active': category === ALL }"
            data-test="category-all"
            @click="category = ALL"
          >
            全部
            <span class="cat-chip__count">{{ classifiers.length }}</span>
          </button>
          <button
            v-for="cat in categories"
            :key="cat.key"
            type="button"
            class="cat-chip"
            :class="{ 'cat-chip--active': category === cat.key }"
            :style="{ '--cat-color': cat.look.color }"
            :data-category="cat.key"
            @click="category = cat.key"
          >
            <el-icon :size="13">
              <component :is="cat.look.icon" />
            </el-icon>
            {{ cat.look.label }}
            <span class="cat-chip__count">{{ cat.count }}</span>
          </button>
        </div>
      </template>

      <ol
        v-loading="saving"
        class="cls-list"
      >
        <li
          v-for="{ c, index } in rows"
          :key="c.id"
          class="cls-card"
          :style="{ '--cat-color': categoryLook(c.id).color }"
          :data-classifier="c.id"
        >
          <span class="cls-card__order">{{ index + 1 }}</span>
          <span class="cls-card__mark">
            <el-icon :size="17"><component :is="categoryLook(c.id).icon" /></el-icon>
          </span>

          <div class="cls-card__main">
            <div class="cls-card__title">
              <span class="cls-card__name">{{ c.name || c.id }}</span>
              <code
                v-if="c.name"
                class="cls-card__id"
              >{{ c.id }}</code>
              <el-tag
                v-if="rowProblems(c, index).length > 0"
                size="small"
                type="danger"
                effect="light"
                round
              >
                网关读不懂
              </el-tag>
            </div>
            <ConditionChips :when="c.when" />
          </div>

          <div class="cls-card__uses">
            <span class="cls-card__uses-label">被引用</span>
            <div
              v-if="usesOf(c).length > 0"
              class="cls-card__use-list"
            >
              <span
                v-for="u in usesOf(c)"
                :key="`${u.vendor}/${u.ruleId}`"
                class="cls-card__use"
              >{{ vendorName(u.vendor) }} · {{ u.ruleId }}</span>
            </div>
            <span
              v-else
              class="cls-card__unused"
            >没有过滤器引用</span>
          </div>

          <div
            v-if="canWrite"
            class="cls-card__ops"
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
    </WorkspaceDetailPanel>

    <ClassifierDialog
      v-model="dialogOpen"
      :classifier="editing"
      :schema="schema"
      :taken-ids="takenIds"
      :submitting="submitting"
      :problems="dialogProblems"
      @submit="onSubmit"
    />
  </WorkspaceLayout>
</template>

<style scoped>
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
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.cls-stats {
  display: flex;
  gap: 10px;
}
.cls-stat {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  min-width: 84px;
  padding: 8px 14px;
  border-radius: 10px;
  background: var(--el-fill-color-light);
}
.cls-stat__value {
  font-size: 20px;
  font-weight: 700;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-primary);
}
.cls-stat__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.cat-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.cat-chip {
  --cat-color: var(--el-color-primary);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  border-radius: 15px;
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
  font-size: 13px;
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition:
    background-color 0.15s,
    border-color 0.15s,
    color 0.15s;
}
.cat-chip:hover {
  border-color: color-mix(in srgb, var(--cat-color) 40%, transparent);
  color: var(--cat-color);
}
.cat-chip--active {
  color: var(--cat-color);
  border-color: color-mix(in srgb, var(--cat-color) 45%, transparent);
  background: color-mix(in srgb, var(--cat-color) 9%, transparent);
  font-weight: 600;
}
.cat-chip__count {
  min-width: 18px;
  padding: 0 5px;
  border-radius: 9px;
  font-size: 11.5px;
  line-height: 18px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  background: var(--el-fill-color);
  color: var(--el-text-color-secondary);
}

.cls-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.cls-card {
  display: grid;
  grid-template-columns: 24px 38px minmax(0, 1fr) minmax(160px, 240px) auto;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  background: var(--el-bg-color);
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}
.cls-card:hover {
  border-color: color-mix(in srgb, var(--cat-color) 35%, var(--el-border-color-lighter));
  box-shadow: 0 6px 18px rgb(15 23 42 / 6%);
}
.cls-card__order {
  justify-self: center;
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-placeholder);
}
.cls-card__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 11px;
  color: var(--cat-color);
  background: color-mix(in srgb, var(--cat-color) 12%, transparent);
}
.cls-card__main {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.cls-card__title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
}
.cls-card__name {
  font-size: 14.5px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.cls-card__id {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.cls-card__uses {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.cls-card__uses-label {
  font-size: 11.5px;
  color: var(--el-text-color-placeholder);
}
.cls-card__use-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.cls-card__use {
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--el-text-color-regular);
  background: var(--el-fill-color-light);
  white-space: nowrap;
}
.cls-card__unused {
  font-size: 12.5px;
  color: var(--el-text-color-placeholder);
}
.cls-card__ops {
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0.55;
  transition: opacity 0.15s;
}
.cls-card:hover .cls-card__ops,
.cls-card__ops:focus-within {
  opacity: 1;
}
.cls-card__ops .el-button + .el-button {
  margin-left: 0;
}

@media (max-width: 1100px) {
  .cls-card {
    grid-template-columns: 24px 38px minmax(0, 1fr) auto;
  }
  .cls-card__uses {
    grid-column: 3 / 4;
  }
}
</style>
