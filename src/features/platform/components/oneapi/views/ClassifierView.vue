<script setup lang="ts">
/**
 * 请求分类：按规则认出每个请求是什么（酒馆、小手机、Claude Code……），给它打一个标签。左侧 Vendor、右侧这个 Vendor 上生效的规则。
 *
 * 规则是 OneApi 网关读的一整份文档；这一页经平台网关直接找 OneApi 的号池后台读写它（不经 Bff）。存进去网关马上换上新的，
 * 所以这一页没有「发布」：每个动作（新建、改、开关、调顺序、删）都是当场存，存成了就是生效了。
 *
 * **现在只认和打标签，不拦请求。** 认出来的结果在遥测里看（每个请求的标签、是哪条规则认的、按 Vendor 的统计）。
 * 文档里如果有人手写了渠道的放行和拒绝（`channels`），这一页不显示也不改，存的时候原样带回去。
 *
 * 规则可以只管一部分 Vendor。选中一个 Vendor 看到的是它的请求会依次经过的全部规则——专门给它的加上通用的——
 * 因为网关是从上往下看、第一条命中的说了算：只列专门给它的，会看漏排在前面的通用规则先把请求认走了。
 */
import { computed, onMounted, ref, shallowRef } from 'vue';
import { Bottom, Delete, Edit, Plus, Refresh, Top } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

import { confirmDanger } from '@/shared/composables/useConfirm';
import EmptyState from '@/shared/ui/EmptyState.vue';
import PageHeader from '@/shared/ui/PageHeader.vue';
import WorkspaceDetailPanel from '@/shared/ui/workspace/WorkspaceDetailPanel.vue';
import WorkspaceLayout from '@/shared/ui/workspace/WorkspaceLayout.vue';
import { useAuthStore } from '@/stores/auth';

import ClassifierRuleDialog from '../components/classifier/ClassifierRuleDialog.vue';
import {
  SCOPE_ALL,
  describeCondition,
  isCommon,
  isEnabled,
  moveRule,
  problemsOfRule,
  removeRule,
  rowsInScope,
  rulesOf,
  setEnabled,
  upsertRule,
  vendorScopes,
  type RuleRow,
} from '../model/classifier';
import type { ClassifierDoc, ClassifierRule, ClassifierSchema } from '../model/classifier.types';
import { failureText } from '../model/ratecard';
import { getOneApiClassifierPort } from '../services';

const port = getOneApiClassifierPort();
const auth = useAuthStore();
/** 没有写权限的人只能看。 */
const canWrite = computed(() => auth.hasPermission('platform.settings.write'));

// ---- 文档 -----------------------------------------------------------------------

/** 文档每次都是整份换（读回来的、存完回来的），不在原地改，所以不用深层响应。 */
const doc = shallowRef<ClassifierDoc>({});
/** 存的时候带回去的版本号；还没有文档时是 null。 */
const version = ref<string | null>(null);
const schema = shallowRef<ClassifierSchema>({ fields: [], operators: {}, vendors: [] });
const loading = ref(false);
const loaded = ref(false);
const loadError = ref<string | null>(null);
/** 正在存。一次只存一个动作：两个动作叠着发，后一个带的是旧版本号，会被自己前一个挤掉。 */
const saving = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  const [snapshot, options] = await Promise.all([port.load(), port.schema()]);
  loading.value = false;
  loaded.value = true;

  if (!snapshot.success) {
    loadError.value = failureText(snapshot.error);
    return;
  }
  doc.value = snapshot.data.doc;
  version.value = snapshot.data.version;
  // 选项没取到不挡着看规则：下拉框是空的，规则照样列得出来
  if (options.success) schema.value = options.data;
  else ElMessage.warning(`没取到字段和 Vendor 的选项：${failureText(options.error)}`);

  if (scope.value !== SCOPE_ALL && !scopes.value.some((s) => s.key === scope.value)) scope.value = SCOPE_ALL;
}

onMounted(load);

// ---- 按 Vendor 看 ---------------------------------------------------------------

const scope = ref<string>(SCOPE_ALL);
const scopes = computed(() => vendorScopes(doc.value, schema.value.vendors));
const activeScope = computed(() => scopes.value.find((s) => s.key === scope.value) ?? null);
const rows = computed<RuleRow[]>(() => rowsInScope(doc.value, scope.value));
const total = computed(() => rulesOf(doc.value).length);
/** 文档里有这一页不管的渠道设置：提一句，免得有人以为这一页就是全部。 */
const hasChannels = computed(() => doc.value.channels !== undefined && doc.value.channels !== null);

const scopeTitle = computed(() => (scope.value === SCOPE_ALL ? '全部规则' : (activeScope.value?.displayName ?? scope.value)));
const scopeSub = computed(() =>
  scope.value === SCOPE_ALL
    ? `${total.value} 条规则 · 网关从上往下看，第一条命中的说了算`
    : `这个 Vendor 的请求依次过这 ${rows.value.length} 条规则（专门给它的 ${activeScope.value?.own ?? 0} 条，其余是通用的）`,
);

const vendorNames = (rule: ClassifierRule): string[] => rule.vendors ?? [];

// ---- 存 -------------------------------------------------------------------------

/**
 * 把改好的整份文档存下去。成了换上号池后台回来的那一份（连同新版本号）；
 * 别人先存过就重新读一遍，这次的改动不算——让人看着最新的再改，不替他合并。
 */
async function commit(next: ClassifierDoc): Promise<boolean> {
  if (saving.value) return false;
  saving.value = true;
  const res = await port.save(next, version.value);
  saving.value = false;

  if (res.success) {
    doc.value = res.data.doc;
    version.value = res.data.version;
    return true;
  }
  if (res.error.code === 'conflict') {
    ElMessage.warning('别人刚改过这份规则，已经换成最新的，请看一下再改');
    await load();
    return false;
  }
  ElMessage.error(failureText(res.error));
  return false;
}

async function onToggle(rule: ClassifierRule, value: boolean | string | number): Promise<void> {
  await commit(setEnabled(doc.value, rule.id, value === true));
}

async function onMove(rule: ClassifierRule, direction: -1 | 1): Promise<void> {
  const next = moveRule(doc.value, scope.value, rule.id, direction);
  if (next !== doc.value) await commit(next);
}

async function onRemove(rule: ClassifierRule): Promise<void> {
  const sure = await confirmDanger({
    title: '删除规则',
    message: `删除规则「${rule.id}」？它认出来的请求以后不再打「${rule.label}」这个标签。`,
    confirmText: '删除',
  });
  if (!sure) return;
  if (await commit(removeRule(doc.value, rule.id))) ElMessage.success('已删除');
}

// ---- 新建 / 编辑 ----------------------------------------------------------------

const dialogOpen = ref(false);
const editingRule = ref<ClassifierRule | null>(null);
const dialogProblems = ref<string[]>([]);
const submitting = ref(false);

const takenIds = computed(() => rulesOf(doc.value).map((r) => r.id));
const knownLabels = computed(() => rulesOf(doc.value).map((r) => r.label));
/** 在某个 Vendor 下面点新建，先替他勾上这个 Vendor。 */
const defaultVendors = computed(() => (scope.value === SCOPE_ALL ? [] : [scope.value]));

function openCreate(): void {
  editingRule.value = null;
  dialogProblems.value = [];
  dialogOpen.value = true;
}

function openEdit(rule: ClassifierRule): void {
  editingRule.value = rule;
  dialogProblems.value = [];
  dialogOpen.value = true;
}

/**
 * 弹窗交出一条规则：先让号池后台只查不存，把网关读不懂的地方落到这条规则上（存的那个接口不过时只回一句话，
 * 分不出是哪一条）；这条没问题再存。
 */
async function onSubmit(rule: ClassifierRule, originalId: string | undefined): Promise<void> {
  if (submitting.value) return;
  const next = upsertRule(doc.value, rule, originalId);
  const index = rulesOf(next).findIndex((r) => r.id === rule.id);

  submitting.value = true;
  const checked = await port.validate(next);
  if (checked.success) {
    dialogProblems.value = problemsOfRule(checked.data, rule.id, index);
    if (dialogProblems.value.length > 0) {
      submitting.value = false;
      return;
    }
  }
  // 校验接口没通不挡着存：存的时候号池后台还会再查一遍
  const saved = await commit(next);
  submitting.value = false;
  if (!saved) return;

  dialogOpen.value = false;
  ElMessage.success(originalId === undefined ? '已新建，网关已经在用了' : '已保存，网关已经在用了');
}
</script>

<template>
  <WorkspaceLayout :loading="loading && !loaded">
    <template #header>
      <PageHeader
        title="请求分类"
        description="认出每个请求是什么，给它打一个标签。现在只打标签、不拦请求；认出来的结果在遥测里看。"
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
            v-if="canWrite"
            :icon="Plus"
            type="primary"
            data-test="rule-create"
            @click="openCreate"
          >
            新建规则
          </el-button>
        </template>
      </PageHeader>

      <el-alert
        v-if="hasChannels"
        title="这份文档里还有渠道的放行和拒绝设置（channels）。这一页不显示也不改它，保存时原样保留。"
        type="info"
        :closable="false"
        show-icon
        class="page-note"
      />
    </template>

    <aside class="provider-sidebar">
      <div class="provider-sidebar__list">
        <button
          type="button"
          class="provider-sidebar__item scope-item"
          :class="{ 'provider-sidebar__item--active': scope === SCOPE_ALL }"
          @click="scope = SCOPE_ALL"
        >
          <span class="scope-item__name">全部规则</span>
          <span class="scope-item__meta">{{ total }} 条</span>
        </button>
        <button
          v-for="s in scopes"
          :key="s.key"
          type="button"
          class="provider-sidebar__item scope-item"
          :class="{ 'provider-sidebar__item--active': scope === s.key }"
          @click="scope = s.key"
        >
          <span class="scope-item__name">
            {{ s.displayName }}
            <el-tag
              v-if="s.unknown"
              size="small"
              type="warning"
              effect="plain"
            >
              未登记
            </el-tag>
          </span>
          <span class="scope-item__meta">{{ s.own > 0 ? `专属 ${s.own} 条` : '只有通用规则' }}</span>
        </button>
      </div>
    </aside>

    <WorkspaceDetailPanel :show-placeholder="loadError !== null || (loaded && total === 0)">
      <template #placeholder>
        <EmptyState
          v-if="loadError"
          title="没读到分类规则"
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
          title="还没有分类规则"
          description="没有规则时网关不给请求打标签。"
        >
          <el-button
            v-if="canWrite"
            :icon="Plus"
            type="primary"
            @click="openCreate"
          >
            新建规则
          </el-button>
        </EmptyState>
      </template>

      <template #header>
        <div class="detail-ident">
          <h2 class="provider-detail__title">
            {{ scopeTitle }}
          </h2>
          <p class="detail-sub">
            {{ scopeSub }}
          </p>
        </div>
      </template>

      <table
        v-if="rows.length > 0"
        v-loading="saving"
        class="rule-table"
      >
        <thead>
          <tr>
            <th class="rule-table__order">
              顺序
            </th>
            <th class="rule-table__on">
              启用
            </th>
            <th>规则</th>
            <th class="rule-table__vendor">
              适用 Vendor
            </th>
            <th
              v-if="canWrite"
              class="rule-table__ops"
            >
              操作
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, i) in rows"
            :key="row.rule.id"
            class="rule-row"
            :class="{ 'rule-row--off': !isEnabled(row.rule) }"
            :data-rule="row.rule.id"
          >
            <td class="rule-table__order">
              {{ row.index + 1 }}
            </td>
            <td class="rule-table__on">
              <el-switch
                :model-value="isEnabled(row.rule)"
                :disabled="!canWrite || saving"
                size="small"
                @change="(v: boolean | string | number) => onToggle(row.rule, v)"
              />
            </td>
            <td>
              <div class="rule-row__head">
                <span class="rule-row__label">{{ row.rule.label }}</span>
                <span class="rule-row__id">{{ row.rule.id }}</span>
              </div>
              <div class="rule-row__when">
                {{ describeCondition(row.rule.when) }}
              </div>
            </td>
            <td>
              <span
                v-if="isCommon(row.rule)"
                class="rule-row__common"
              >通用</span>
              <template v-else>
                <el-tag
                  v-for="v in vendorNames(row.rule)"
                  :key="v"
                  size="small"
                  effect="plain"
                  class="rule-row__vendor"
                >
                  {{ v }}
                </el-tag>
              </template>
            </td>
            <td
              v-if="canWrite"
              class="rule-table__ops"
            >
              <el-button
                :icon="Top"
                link
                :disabled="i === 0 || saving"
                aria-label="上移"
                data-test="rule-up"
                @click="onMove(row.rule, -1)"
              />
              <el-button
                :icon="Bottom"
                link
                :disabled="i === rows.length - 1 || saving"
                aria-label="下移"
                data-test="rule-down"
                @click="onMove(row.rule, 1)"
              />
              <el-button
                :icon="Edit"
                link
                aria-label="编辑"
                data-test="rule-edit"
                @click="openEdit(row.rule)"
              />
              <el-button
                :icon="Delete"
                link
                type="danger"
                :disabled="saving"
                aria-label="删除"
                data-test="rule-delete"
                @click="onRemove(row.rule)"
              />
            </td>
          </tr>
        </tbody>
      </table>
      <EmptyState
        v-else
        title="这个 Vendor 上没有规则"
        description="专门给它的和通用的都没有，它的请求不会被打标签。"
      />
    </WorkspaceDetailPanel>

    <ClassifierRuleDialog
      v-model="dialogOpen"
      :rule="editingRule"
      :schema="schema"
      :taken-ids="takenIds"
      :known-labels="knownLabels"
      :default-vendors="defaultVendors"
      :submitting="submitting"
      :problems="dialogProblems"
      @submit="onSubmit"
    />
  </WorkspaceLayout>
</template>

<style scoped>
.page-note {
  margin: -6px 0 12px;
}

.scope-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 10px 14px;
}
.scope-item__name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.3;
}
.scope-item__meta {
  font-size: 12px;
  line-height: 1.3;
  color: var(--el-text-color-secondary);
}

.detail-ident {
  min-width: 0;
}
.detail-sub {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.rule-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.rule-table th {
  padding: 8px 12px;
  text-align: left;
  font-weight: 500;
  color: var(--el-text-color-secondary);
  border-bottom: 1px solid var(--el-border-color-lighter);
  white-space: nowrap;
}
.rule-table td {
  padding: 10px 12px;
  vertical-align: top;
  border-bottom: 1px solid var(--el-border-color-extra-light);
}
.rule-table__order {
  width: 48px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}
.rule-table__on {
  width: 56px;
}
/* 剩下的宽度都给「规则」那一列：标签、规则 id 和条件那句话都在里面 */
.rule-table__vendor {
  width: 150px;
}
.rule-table__ops {
  width: 132px;
  white-space: nowrap;
  text-align: right;
}

.rule-row--off .rule-row__label,
.rule-row--off .rule-row__id,
.rule-row--off .rule-row__when {
  color: var(--el-text-color-placeholder);
}
.rule-row__label {
  font-family: var(--el-font-family-monospace, ui-monospace, monospace);
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.rule-row__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 12px;
}
.rule-row__id {
  font-family: var(--el-font-family-monospace, ui-monospace, monospace);
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.rule-row__when {
  margin-top: 4px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
  word-break: break-word;
}
.rule-row__common {
  color: var(--el-text-color-secondary);
}
.rule-row__vendor {
  margin-right: 4px;
}
</style>
