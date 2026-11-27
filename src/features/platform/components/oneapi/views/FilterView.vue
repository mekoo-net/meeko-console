<script setup lang="ts">
/**
 * 过滤器（安全策略 → 过滤器）：真正拦请求的地方，像防火墙的规则表，一个 Vendor 一张。
 *
 * 每条规则一个条件、一个动作（放行 / 拒绝），从上往下第一条成立的说了算，都不成立走默认动作——
 * 页面上画成一条从上到下的链，最后一环就是默认动作。条件可以引用分类器（「是 chat.app → 拒绝」），
 * 也可以直接比请求头，两样能混着写。没有过滤器的 Vendor 什么都收。
 * 被拒的请求错误码是 `filter_rejected.<规则 id>`，上层按它决定怎么处理（比如扣不扣费）。
 *
 * 新建的过滤器先是「只标记」：判了拒绝的请求照常放行，只在遥测里记一笔「本该拒绝」。看过它会拦掉什么，
 * 再由人切到「执行」。
 *
 * 分类器和过滤规则在网关那边是一整份文档，这一页只改过滤器那一块，存的是整份（见 useFilterDocument）。
 * 存进去网关马上换上新的，所以没有「发布」：每个动作都是当场存，存成了就是生效了。
 */
import { computed, ref, watch } from 'vue';
import { Bottom, Delete, Edit, Flag, Plus, Refresh, Top, View, Warning } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

import { confirmDanger } from '@/shared/composables/useConfirm';
import EmptyState from '@/shared/ui/EmptyState.vue';
import PageHeader from '@/shared/ui/PageHeader.vue';
import WorkspaceDetailPanel from '@/shared/ui/workspace/WorkspaceDetailPanel.vue';
import WorkspaceLayout from '@/shared/ui/workspace/WorkspaceLayout.vue';
import { useAuthStore } from '@/stores/auth';

import ActionBadge from '../components/filter/ActionBadge.vue';
import ConditionChips from '../components/filter/ConditionChips.vue';
import FilterProblemsAlert from '../components/filter/FilterProblemsAlert.vue';
import FilterRuleDialog from '../components/filter/FilterRuleDialog.vue';
import { useFilterDocument } from '../composables/useFilterDocument';
import {
  actionOf,
  channelOf,
  channelSummary,
  classifiersOf,
  isEnabled,
  moveFilterRule,
  problemsOfChannel,
  problemsOfRule,
  removeChannel,
  removeFilterRule,
  setChannelDefault,
  setChannelEnforce,
  setFilterRuleEnabled,
  upsertFilterRule,
  vendorList,
  type ChannelView,
} from '../model/filter';
import type { FilterRule } from '../model/filter.types';

const auth = useAuthStore();
/** 没有写权限的人只能看。 */
const canWrite = computed(() => auth.hasPermission('platform.settings.write'));

const { doc, schema, problems, loading, loaded, loadError, saving, load, commit, checkThenCommit } =
  useFilterDocument();

const vendors = computed(() => vendorList(doc.value, schema.value.vendors));
const vendor = ref('');
// 读回来以后（包括别人改过、重新读的那一次）选中的 Vendor 不在了，换成第一个
watch(vendors, (list) => {
  if (!list.some((v) => v.key === vendor.value)) vendor.value = list[0]?.key ?? '';
});

const view = computed(() => channelOf(doc.value, vendor.value));
const vendorName = computed(() => vendors.value.find((v) => v.key === vendor.value)?.displayName ?? vendor.value);
const channelProblems = computed(() => problemsOfChannel(problems.value, view.value.key));
const classifiers = computed(() => classifiersOf(doc.value));

const vendorBroken = (key: string): boolean =>
  problemsOfChannel(problems.value, channelOf(doc.value, key).key).length > 0;
const ruleProblems = (rule: FilterRule, index: number): string[] =>
  problemsOfRule(problems.value, view.value.key, rule.id, index);

/** 左边每个 Vendor 头像旁边那个点：执行中红、只标记黄、没有过滤器灰。 */
const stateOf = (v: ChannelView): 'live' | 'mark' | 'none' => (!v.exists ? 'none' : v.enforce ? 'live' : 'mark');

const AVATAR_COLORS = ['#4f46e5', '#0891b2', '#db2777', '#ea580c', '#16a34a', '#7c3aed', '#0d9488', '#2563eb'];
function avatarColor(key: string): string {
  let h = 0;
  for (const ch of key.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}
const initial = (name: string): string => name.trim().charAt(0).toUpperCase() || '?';

const DEFAULT_OPTIONS = [
  { label: '放行', value: 'allow' },
  { label: '拒绝', value: 'deny' },
];
const MODE_OPTIONS = [
  { label: '只标记', value: 'mark' },
  { label: '执行', value: 'enforce' },
];

async function onDefault(value: string | number | boolean): Promise<void> {
  await commit(setChannelDefault(doc.value, vendor.value, value === 'deny' ? 'deny' : 'allow'));
}

/** 切到「执行」以后请求会真的被拒，先问一句；退回只标记不用问。 */
async function onMode(value: string | number | boolean): Promise<void> {
  const enforce = value === 'enforce';
  if (enforce === view.value.enforce && view.value.exists) return;
  if (enforce) {
    const sure = await confirmDanger({
      title: '执行过滤器',
      message: `切到执行以后，${vendorName.value} 上判了拒绝的请求会真的被拒掉（403）。先在遥测里确认过「本该拒绝」的都是该拒的了吗？`,
      confirmText: '切到执行',
    });
    if (!sure) return;
  }
  await commit(setChannelEnforce(doc.value, vendor.value, enforce));
}

async function onToggle(rule: FilterRule, value: string | number | boolean): Promise<void> {
  await commit(setFilterRuleEnabled(doc.value, vendor.value, rule.id, value === true));
}

async function onMove(rule: FilterRule, direction: -1 | 1): Promise<void> {
  const next = moveFilterRule(doc.value, vendor.value, rule.id, direction);
  if (next !== doc.value) await commit(next);
}

async function onRemove(rule: FilterRule): Promise<void> {
  const sure = await confirmDanger({
    title: '删除过滤规则',
    message: `删除 ${vendorName.value} 上的规则「${rule.id}」？`,
    confirmText: '删除',
  });
  if (!sure) return;
  if (await commit(removeFilterRule(doc.value, vendor.value, rule.id))) ElMessage.success('已删除');
}

async function onRemoveChannel(): Promise<void> {
  const sure = await confirmDanger({
    title: '去掉过滤器',
    message: `去掉 ${vendorName.value} 的整个过滤器？去掉以后它什么请求都收。`,
    confirmText: '去掉',
  });
  if (!sure) return;
  if (await commit(removeChannel(doc.value, vendor.value))) ElMessage.success('已去掉');
}

// ---- 新建和编辑 -------------------------------------------------------------------

const dialogOpen = ref(false);
const editing = ref<FilterRule | null>(null);
const dialogProblems = ref<string[]>([]);
const submitting = ref(false);
const takenIds = computed(() => view.value.rules.map((r) => r.id));

function openCreate(): void {
  editing.value = null;
  dialogProblems.value = [];
  dialogOpen.value = true;
}

function openEdit(rule: FilterRule): void {
  editing.value = rule;
  dialogProblems.value = [];
  dialogOpen.value = true;
}

async function onSubmit(rule: FilterRule, originalId: string | undefined): Promise<void> {
  if (submitting.value) return;
  const next = upsertFilterRule(doc.value, vendor.value, rule, originalId);
  const after = channelOf(next, vendor.value);
  const index = after.rules.findIndex((r) => r.id === rule.id);

  submitting.value = true;
  const left = await checkThenCommit(next, (found) => problemsOfRule(found, after.key, rule.id, index));
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
        title="过滤器"
        description="每个 Vendor 一条规则链：条件成立就放行或拒绝，条件可以是「匹配某个分类器」，也可以直接比请求头。结果在遥测里看。"
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
            v-if="canWrite && vendor !== '' && !loadError"
            :icon="Plus"
            type="primary"
            data-test="rule-create"
            @click="openCreate"
          >
            新建过滤规则
          </el-button>
        </template>
      </PageHeader>
      <FilterProblemsAlert :problems="problems" />
    </template>

    <aside class="provider-sidebar">
      <div class="provider-sidebar__list">
        <button
          v-for="v in vendors"
          :key="v.key"
          type="button"
          class="provider-sidebar__item vendor-item"
          :class="{ 'provider-sidebar__item--active': vendor === v.key }"
          :data-vendor="v.key"
          @click="vendor = v.key"
        >
          <span
            class="vendor-avatar"
            :style="{ '--avatar-color': avatarColor(v.key) }"
          >
            {{ initial(v.displayName) }}
            <span
              class="vendor-avatar__dot"
              :class="`vendor-avatar__dot--${stateOf(channelOf(doc, v.key))}`"
            />
          </span>
          <span class="vendor-item__text">
            <span class="vendor-item__name">{{ v.displayName }}</span>
            <span class="vendor-item__meta">{{ channelSummary(channelOf(doc, v.key)) }}</span>
          </span>
          <span class="vendor-item__tags">
            <el-tag
              v-if="v.unknown"
              size="small"
              type="warning"
              effect="light"
              round
            >
              未登记
            </el-tag>
            <el-tag
              v-if="vendorBroken(v.key)"
              size="small"
              type="danger"
              effect="light"
              round
            >
              不生效
            </el-tag>
          </span>
        </button>
        <p
          v-if="vendors.length === 0 && !loading"
          class="provider-sidebar__empty"
        >
          没有 Vendor
        </p>
      </div>
    </aside>

    <WorkspaceDetailPanel :show-placeholder="loadError !== null || vendor === ''">
      <template #placeholder>
        <EmptyState
          v-if="loadError"
          title="没读到过滤器"
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
          title="请选择左侧的 Vendor"
        />
      </template>

      <template #header>
        <div class="ch-head">
          <span
            class="vendor-avatar vendor-avatar--lg"
            :style="{ '--avatar-color': avatarColor(vendor) }"
          >{{ initial(vendorName) }}</span>
          <div class="ch-head__text">
            <h2 class="provider-detail__title">
              {{ vendorName }}
            </h2>
            <p class="ch-head__sub">
              从上往下，第一条成立的规则说了算；都不成立走默认动作。
            </p>
          </div>
          <el-button
            v-if="canWrite && view.exists"
            text
            type="danger"
            :icon="Delete"
            :disabled="saving"
            data-test="channel-remove"
            @click="onRemoveChannel"
          >
            去掉过滤器
          </el-button>
        </div>
      </template>

      <template #toolbar>
        <div class="ch-controls">
          <div class="ch-control">
            <span class="ch-control__label">默认动作</span>
            <el-segmented
              :model-value="view.defaultAction"
              :options="DEFAULT_OPTIONS"
              :disabled="!canWrite || saving"
              class="seg"
              :class="view.defaultAction === 'deny' ? 'seg--deny' : 'seg--allow'"
              data-test="channel-default"
              @change="onDefault"
            />
          </div>
          <div class="ch-control">
            <span class="ch-control__label">模式</span>
            <el-segmented
              :model-value="view.enforce ? 'enforce' : 'mark'"
              :options="MODE_OPTIONS"
              :disabled="!canWrite || saving"
              class="seg"
              :class="view.enforce ? 'seg--deny' : 'seg--mark'"
              data-test="channel-mode"
              @change="onMode"
            />
          </div>
        </div>
      </template>

      <div
        v-loading="saving"
        class="ch-body"
      >
        <div
          v-if="view.exists"
          class="mode-banner"
          :class="view.enforce ? 'mode-banner--live' : 'mode-banner--mark'"
          data-test="channel-state"
        >
          <el-icon :size="16">
            <component :is="view.enforce ? Warning : View" />
          </el-icon>
          <span v-if="view.enforce"><b>执行中</b>：判了拒绝的请求直接返回 403（错误码 filter_rejected.&lt;规则 id&gt;）。</span>
          <span v-else><b>只标记</b>：判了拒绝的请求照常放行，只在遥测里记「本该拒绝」。确认没有误伤后再切到执行。</span>
        </div>
        <div
          v-else
          class="mode-banner mode-banner--none"
        >
          <el-icon :size="16">
            <View />
          </el-icon>
          <span>这个 Vendor 还没有过滤器，所有请求都放行。加第一条规则时会建一个，先是只标记。</span>
        </div>

        <el-alert
          v-for="(p, i) in channelProblems"
          :key="i"
          :title="`网关读不懂这个过滤器，整个不生效：${p.reason}`"
          type="error"
          :closable="false"
          show-icon
        />

        <ol class="chain">
          <li
            v-for="(rule, i) in view.rules"
            :key="rule.id"
            class="chain__item rule-row"
            :class="[`rule-row--${actionOf(rule)}`, { 'rule-row--off': !isEnabled(rule) }]"
            :data-rule="rule.id"
          >
            <span class="chain__node">{{ i + 1 }}</span>
            <div class="rule-card">
              <div class="rule-card__head">
                <code class="rule-card__id">{{ rule.id }}</code>
                <span
                  v-if="!isEnabled(rule)"
                  class="rule-card__off"
                >已停用</span>
                <el-tag
                  v-if="ruleProblems(rule, i).length > 0"
                  size="small"
                  type="danger"
                  effect="light"
                  round
                >
                  网关读不懂
                </el-tag>
                <span class="rule-card__spacer" />
                <ActionBadge :action="actionOf(rule)" />
              </div>
              <ConditionChips
                :when="rule.when"
                :classifiers="classifiers"
              />
              <div class="rule-card__foot">
                <el-switch
                  :model-value="isEnabled(rule)"
                  :disabled="!canWrite || saving"
                  size="small"
                  inline-prompt
                  active-text="启用"
                  inactive-text="停用"
                  @change="(v: string | number | boolean) => onToggle(rule, v)"
                />
                <span class="rule-card__spacer" />
                <template v-if="canWrite">
                  <el-button
                    :icon="Top"
                    text
                    circle
                    size="small"
                    :disabled="i === 0 || saving"
                    aria-label="上移"
                    data-test="rule-up"
                    @click="onMove(rule, -1)"
                  />
                  <el-button
                    :icon="Bottom"
                    text
                    circle
                    size="small"
                    :disabled="i === view.rules.length - 1 || saving"
                    aria-label="下移"
                    data-test="rule-down"
                    @click="onMove(rule, 1)"
                  />
                  <el-button
                    :icon="Edit"
                    text
                    circle
                    size="small"
                    aria-label="编辑"
                    data-test="rule-edit"
                    @click="openEdit(rule)"
                  />
                  <el-button
                    :icon="Delete"
                    text
                    circle
                    size="small"
                    type="danger"
                    :disabled="saving"
                    aria-label="删除"
                    data-test="rule-delete"
                    @click="onRemove(rule)"
                  />
                </template>
              </div>
            </div>
          </li>

          <li
            v-if="view.rules.length === 0 && canWrite"
            class="chain__item chain__item--empty"
          >
            <span class="chain__node chain__node--ghost">+</span>
            <button
              type="button"
              class="rule-card rule-card--add"
              @click="openCreate"
            >
              <el-icon :size="16">
                <Plus />
              </el-icon>
              新建第一条规则
            </button>
          </li>

          <!-- 链的最后一环：上面的都不成立时 -->
          <li
            class="chain__item chain__item--default"
            :class="`rule-row--${view.defaultAction}`"
          >
            <span class="chain__node chain__node--end">
              <el-icon :size="13"><Flag /></el-icon>
            </span>
            <div class="rule-card rule-card--default">
              <div class="rule-card__head">
                <span class="rule-card__default-title">默认动作</span>
                <span class="rule-card__default-sub">以上规则都不成立时</span>
                <span class="rule-card__spacer" />
                <ActionBadge
                  :action="view.defaultAction"
                  data-test="default-action"
                />
              </div>
            </div>
          </li>
        </ol>
      </div>
    </WorkspaceDetailPanel>

    <FilterRuleDialog
      v-model="dialogOpen"
      :vendor-name="vendorName"
      :rule="editing"
      :schema="schema"
      :classifiers="classifiers"
      :taken-ids="takenIds"
      :submitting="submitting"
      :problems="dialogProblems"
      @submit="onSubmit"
    />
  </WorkspaceLayout>
</template>

<style scoped>
/* ---- 左边的 Vendor 列表 ---- */
.vendor-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
}
.vendor-item__text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;
  text-align: left;
}
.vendor-item__name {
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.3;
}
.vendor-item__meta {
  font-size: 12px;
  line-height: 1.3;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.vendor-item__tags {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.vendor-avatar {
  position: relative;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  color: var(--avatar-color);
  background: color-mix(in srgb, var(--avatar-color) 13%, transparent);
}
.vendor-avatar--lg {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  font-size: 18px;
}
.vendor-avatar__dot {
  position: absolute;
  right: -3px;
  bottom: -3px;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  border: 2px solid var(--el-bg-color);
}
.vendor-avatar__dot--live {
  background: var(--el-color-danger);
}
.vendor-avatar__dot--mark {
  background: var(--el-color-warning);
}
.vendor-avatar__dot--none {
  background: var(--el-border-color);
}

/* ---- 右边的头和开关 ---- */
.ch-head {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  min-width: 0;
}
.ch-head__text {
  flex: 1;
  min-width: 0;
}
.ch-head__sub {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.ch-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 28px;
}
.ch-control {
  display: flex;
  align-items: center;
  gap: 10px;
}
.ch-control__label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.seg {
  --el-segmented-item-selected-color: #fff;
  --el-border-radius-base: 8px;
}
.seg--allow {
  --el-segmented-item-selected-bg-color: var(--el-color-success);
}
.seg--deny {
  --el-segmented-item-selected-bg-color: var(--el-color-danger);
}
.seg--mark {
  --el-segmented-item-selected-bg-color: var(--el-color-warning);
}

.ch-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.mode-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.5;
}
.mode-banner--live {
  color: var(--el-color-danger-dark-2);
  background: var(--el-color-danger-light-9);
}
.mode-banner--mark {
  color: var(--el-color-warning-dark-2);
  background: var(--el-color-warning-light-9);
}
.mode-banner--none {
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
}

/* ---- 规则链 ---- */
.chain {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.chain::before {
  content: '';
  position: absolute;
  top: 18px;
  bottom: 18px;
  left: 14px;
  width: 2px;
  border-radius: 1px;
  background: var(--el-border-color-lighter);
}
.chain__item {
  --action-color: var(--el-color-success);
  position: relative;
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  align-items: start;
  gap: 14px;
}
.rule-row--deny {
  --action-color: var(--el-color-danger);
}
.rule-row--off {
  --action-color: var(--el-text-color-placeholder);
}
.chain__node {
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  margin-top: 12px;
  border-radius: 50%;
  font-size: 12.5px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--action-color);
  background: var(--el-bg-color);
  border: 2px solid color-mix(in srgb, var(--action-color) 55%, transparent);
}
.chain__node--end {
  margin-top: 8px;
  color: #fff;
  background: var(--action-color);
  border-color: var(--action-color);
}
.chain__node--ghost {
  color: var(--el-text-color-placeholder);
  border-style: dashed;
  border-color: var(--el-border-color);
}

.rule-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  padding: 12px 14px 10px;
  border: 1px solid var(--el-border-color-lighter);
  border-left: 3px solid var(--action-color);
  border-radius: 12px;
  background: var(--el-bg-color);
  transition:
    box-shadow 0.15s,
    border-color 0.15s;
}
.rule-card:hover {
  box-shadow: 0 6px 18px rgb(15 23 42 / 6%);
}
.rule-row--off .rule-card {
  background: var(--el-fill-color-lighter);
}
.rule-row--off .rule-card :deep(.chips) {
  opacity: 0.55;
}
.rule-card__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.rule-card__id {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}
.rule-card__off {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11.5px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color);
}
.rule-card__spacer {
  flex: 1;
}
.rule-card__foot {
  display: flex;
  align-items: center;
  gap: 2px;
  padding-top: 8px;
  border-top: 1px dashed var(--el-border-color-lighter);
}
.rule-card__foot .el-button + .el-button {
  margin-left: 0;
}
.rule-card--default {
  padding: 10px 14px;
  border-style: dashed;
  border-left-style: solid;
  background: var(--el-fill-color-lighter);
}
.rule-card__default-title {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}
.rule-card__default-sub {
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
}
.rule-card--add {
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 54px;
  border: 1px dashed var(--el-border-color);
  border-left-width: 1px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  cursor: pointer;
}
.rule-card--add:hover {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary-light-5);
}
</style>
