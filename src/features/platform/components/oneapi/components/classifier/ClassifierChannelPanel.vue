<script setup lang="ts">
/**
 * 一个 Vendor 的渠道规则：带某个分类标签的请求，这个 Vendor 放行还是拒绝。
 *
 * 条目从上往下匹配，第一条匹配上的说了算，都没匹配上走默认动作。所以「拒绝 agent 这一类，但放行其中的 agent.claude_code」
 * 是把放行的那一条排在前面。
 *
 * 「执行」关着的时候只标记：判了拒绝的请求照常放行，遥测里记一笔「本该拒绝」，用来先看一条规则会拦掉什么。
 *
 * 这里只把人的动作交出去，不存：存要带上整份文档和版本号，由页面做。
 */
import { computed, ref, watch } from 'vue';
import { Bottom, Delete, Plus, Top } from '@element-plus/icons-vue';

import EmptyState from '@/shared/ui/EmptyState.vue';

import { describeMatch, isValidMatch, type ChannelAction, type ChannelView } from '../../model/classifier';
import type { ClassifierChannelEntry } from '../../model/classifier.types';

const props = defineProps<{
  view: ChannelView;
  /** 加条目时能选的匹配（分类规则里有的类别和标签，加上两个特殊的）。 */
  options: readonly string[];
  canWrite: boolean;
  saving: boolean;
}>();

const emit = defineEmits<{
  (e: 'default', action: ChannelAction): void;
  (e: 'enforce', value: boolean): void;
  (e: 'add', entry: ClassifierChannelEntry): void;
  (e: 'action', index: number, action: ChannelAction): void;
  (e: 'move', index: number, direction: -1 | 1): void;
  (e: 'remove', index: number): void;
  (e: 'clear'): void;
}>();

const newMatch = ref('');
/** 加规则多半是为了拒绝什么，先替他选上。 */
const newAction = ref<ChannelAction>('deny');
const addError = ref<string | null>(null);

// 换了 Vendor，没填完的那一条不带过去
watch(
  () => props.view.vendor,
  () => {
    newMatch.value = '';
    newAction.value = 'deny';
    addError.value = null;
  },
);

const actionOf = (entry: ClassifierChannelEntry): ChannelAction => (entry.action === 'deny' ? 'deny' : 'allow');

const taken = computed(() => new Set(props.view.entries.map((e) => e.match)));

function add(): void {
  const match = newMatch.value.trim();
  if (!match) {
    addError.value = '先选要匹配哪个分类';
    return;
  }
  if (!isValidMatch(match)) {
    addError.value = '写一个标签（agent.claude_code）、一类（agent.*）、*（所有被认出来的）或 unlabeled（没被认出来的）';
    return;
  }
  if (taken.value.has(match)) {
    addError.value = `「${describeMatch(match)}」已经有一条了，改它的动作就行`;
    return;
  }
  addError.value = null;
  emit('add', { match, action: newAction.value });
  newMatch.value = '';
}

const asAction = (v: unknown): ChannelAction => (v === 'deny' ? 'deny' : 'allow');
</script>

<template>
  <div class="chan">
    <div class="chan__settings">
      <div class="chan__setting">
        <span class="chan__setting-name">都没匹配上时</span>
        <el-radio-group
          :model-value="view.defaultAction"
          :disabled="!canWrite || saving"
          size="small"
          data-test="channel-default"
          @change="(v: unknown) => emit('default', asAction(v))"
        >
          <el-radio-button value="allow">
            放行
          </el-radio-button>
          <el-radio-button value="deny">
            拒绝
          </el-radio-button>
        </el-radio-group>
      </div>
      <div class="chan__setting">
        <span class="chan__setting-name">执行</span>
        <el-switch
          :model-value="view.enforce"
          :disabled="!canWrite || saving"
          data-test="channel-enforce"
          @change="(v: unknown) => emit('enforce', v === true)"
        />
        <span class="chan__setting-hint">
          {{ view.enforce ? '判了拒绝的请求会被拒掉（403）' : '只标记：判了拒绝的请求照常放行，遥测里记一笔「本该拒绝」' }}
        </span>
      </div>
    </div>

    <table
      v-if="view.entries.length > 0"
      v-loading="saving"
      class="chan-table"
    >
      <thead>
        <tr>
          <th class="chan-table__order">
            顺序
          </th>
          <th>匹配分类</th>
          <th class="chan-table__action">
            动作
          </th>
          <th
            v-if="canWrite"
            class="chan-table__ops"
          >
            操作
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(entry, i) in view.entries"
          :key="`${entry.match}:${i}`"
          class="chan-row"
          :data-match="entry.match"
        >
          <td class="chan-table__order">
            {{ i + 1 }}
          </td>
          <td>
            <span class="chan-row__what">{{ describeMatch(entry.match) }}</span>
            <span
              v-if="describeMatch(entry.match) !== entry.match"
              class="chan-row__raw"
            >{{ entry.match }}</span>
          </td>
          <td class="chan-table__action">
            <el-radio-group
              :model-value="actionOf(entry)"
              :disabled="!canWrite || saving"
              size="small"
              @change="(v: unknown) => emit('action', i, asAction(v))"
            >
              <el-radio-button value="allow">
                放行
              </el-radio-button>
              <el-radio-button value="deny">
                拒绝
              </el-radio-button>
            </el-radio-group>
          </td>
          <td
            v-if="canWrite"
            class="chan-table__ops"
          >
            <el-button
              :icon="Top"
              link
              :disabled="i === 0 || saving"
              aria-label="上移"
              data-test="entry-up"
              @click="emit('move', i, -1)"
            />
            <el-button
              :icon="Bottom"
              link
              :disabled="i === view.entries.length - 1 || saving"
              aria-label="下移"
              data-test="entry-down"
              @click="emit('move', i, 1)"
            />
            <el-button
              :icon="Delete"
              link
              type="danger"
              :disabled="saving"
              aria-label="删除"
              data-test="entry-delete"
              @click="emit('remove', i)"
            />
          </td>
        </tr>
      </tbody>
    </table>
    <EmptyState
      v-else
      :title="view.exists ? '还没有条目' : '这个 Vendor 没有渠道规则'"
      :description="view.defaultAction === 'deny' ? '现在所有请求都按默认动作拒绝。' : '现在所有请求都放行。'"
    />

    <div
      v-if="canWrite"
      class="chan__add"
    >
      <el-select
        v-model="newMatch"
        filterable
        allow-create
        default-first-option
        clearable
        placeholder="匹配哪个分类"
        class="chan__add-match"
        data-test="entry-match"
      >
        <el-option
          v-for="o in options"
          :key="o"
          :label="describeMatch(o) === o ? o : `${describeMatch(o)}（${o}）`"
          :value="o"
        />
      </el-select>
      <el-radio-group
        v-model="newAction"
        data-test="entry-action"
      >
        <el-radio-button value="deny">
          拒绝
        </el-radio-button>
        <el-radio-button value="allow">
          放行
        </el-radio-button>
      </el-radio-group>
      <el-button
        :icon="Plus"
        type="primary"
        :disabled="saving"
        data-test="entry-add"
        @click="add"
      >
        添加
      </el-button>
      <span class="chan__spacer" />
      <el-button
        v-if="view.exists"
        link
        type="danger"
        :disabled="saving"
        data-test="channel-clear"
        @click="emit('clear')"
      >
        清空这个 Vendor 的规则
      </el-button>
    </div>
    <p
      v-if="addError"
      class="chan__error"
    >
      {{ addError }}
    </p>
  </div>
</template>

<style scoped>
.chan {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.chan__settings {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-fill-color-extra-light);
}
.chan__setting {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 28px;
}
.chan__setting-name {
  flex: 0 0 96px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.chan__setting-hint {
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
}

.chan-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.chan-table th {
  padding: 8px 12px;
  text-align: left;
  font-weight: 500;
  color: var(--el-text-color-secondary);
  border-bottom: 1px solid var(--el-border-color-lighter);
  white-space: nowrap;
}
.chan-table td {
  padding: 10px 12px;
  vertical-align: middle;
  border-bottom: 1px solid var(--el-border-color-extra-light);
}
.chan-table__order {
  width: 48px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}
.chan-table__action {
  width: 150px;
}
.chan-table__ops {
  width: 110px;
  white-space: nowrap;
  text-align: right;
}
.chan-row__what {
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.chan-row__raw {
  margin-left: 10px;
  font-family: var(--el-font-family-monospace, ui-monospace, monospace);
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.chan__add {
  display: flex;
  align-items: center;
  gap: 10px;
}
.chan__add-match {
  flex: 0 1 320px;
}
.chan__spacer {
  flex: 1;
}
.chan__error {
  margin: -6px 0 0;
  font-size: 12.5px;
  color: var(--el-color-danger);
}
</style>
