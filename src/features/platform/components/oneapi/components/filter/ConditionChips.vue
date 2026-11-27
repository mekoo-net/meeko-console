<script setup lang="ts">
/**
 * 把一个条件画成一排标签块：引用的分类器按类别上色，字段比较拆成「字段 · 比法 · 值」三段，套着的组加括号。
 * 表单编不出来的条件（写法这一页不认识的 JSON）只画一块「自定义条件」，悬停看原文。
 * 整句话（`describeCondition`）挂在 aria-label 上，读屏和测试按它认。
 *
 * `compact`（列表里用）：只画一行。最外层每个条件一块；套着的组缩成「N 个条件」，工具对象缩成「工具对象」；
 * 一个条件有好几个值时只显示第一个和「+N」，长的截断。完整的那句话悬停看。
 */
import { computed } from 'vue';

import {
  conditionTree,
  describeCondition,
  fieldLabel,
  isCategoryRef,
  opLabel,
  refMatches,
  type ConditionNode,
  type ConditionRow,
} from '../../model/filter';
import type { FilterClassifier } from '../../model/filter.types';
import { categoryLook, categoryOf, lookOfCategory } from './classifierCategory';

const props = defineProps<{
  when: unknown;
  /** 用来查分类器的名字、认出引用了不存在的分类器；不给就不查。 */
  classifiers?: readonly FilterClassifier[];
  /** 只画一行的简要版，悬停看全文。 */
  compact?: boolean;
}>();

type ClassifierRow = Extract<ConditionRow, { kind: 'classifier' }>;
type FieldRow = Extract<ConditionRow, { kind: 'field' }>;
type Token =
  | { t: 'join'; text: string }
  | { t: 'open' }
  | { t: 'close' }
  | { t: 'not'; text: string }
  | { t: 'tool'; text: string }
  | { t: 'more'; text: string }
  | { t: 'classifier'; row: ClassifierRow }
  | { t: 'field'; row: FieldRow };

/** 树摊成一串记号按顺序画：组前后加括号（最外面那组和只有一项的组不加），组与组、行与行之间是「且 / 或」。 */
function tokensOf(node: ConditionNode, nested: boolean, out: Token[]): Token[] {
  if (node.kind === 'tool') {
    // 工具对象：括号里的条件说的是同一个工具
    out.push({ t: 'tool', text: node.negate ? '没有工具' : '有工具' }, { t: 'open' });
    tokensOf(node.group, false, out);
    out.push({ t: 'close' });
    return out;
  }
  if (node.kind === 'group') {
    const paren = node.negate || (nested && node.children.length > 1);
    if (node.negate) out.push({ t: 'not', text: '不满足' });
    if (paren) out.push({ t: 'open' });
    node.children.forEach((child, i) => {
      if (i > 0) out.push({ t: 'join', text: node.mode === 'all' ? '且' : '或' });
      tokensOf(child, true, out);
    });
    if (paren) out.push({ t: 'close' });
    return out;
  }
  if (node.kind === 'classifier') {
    if (node.negate) out.push({ t: 'not', text: '不是' });
    out.push({ t: 'classifier', row: node });
  } else {
    // 「没有值」自己就是否定的说法，不再加「不满足」
    if (node.negate && node.op !== 'exists') out.push({ t: 'not', text: '不满足' });
    out.push({ t: 'field', row: node });
  }
  return out;
}

/** 一个节点里一共有几行条件（套着的组、工具对象里面的都算）。 */
function leaves(node: ConditionNode): number {
  if (node.kind === 'group') return node.children.reduce((n, c) => n + leaves(c), 0);
  if (node.kind === 'tool') return leaves(node.group);
  return 1;
}

/** 简要版：只摊最外面那一层，里面的组和工具对象各缩成一块。 */
function compactTokens(root: ConditionNode): Token[] {
  const top = root.kind === 'group' && !root.negate ? root.children : [root];
  const mode = root.kind === 'group' ? root.mode : 'all';
  const out: Token[] = [];
  top.forEach((node, i) => {
    if (i > 0) out.push({ t: 'join', text: mode === 'all' ? '且' : '或' });
    if (node.kind === 'group') {
      out.push({ t: 'more', text: `${node.negate ? '不满足 ' : ''}${leaves(node)} 个条件` });
    } else if (node.kind === 'tool') {
      out.push({ t: 'more', text: node.negate ? '没有工具对象' : '工具对象' });
    } else {
      tokensOf(node, true, out);
    }
  });
  return out;
}

const tree = computed(() => conditionTree(props.when));
const tokens = computed(() => {
  if (!tree.value) return [];
  return props.compact ? compactTokens(tree.value) : tokensOf(tree.value, false, []);
});
const sentence = computed(() => describeCondition(props.when));
const json = computed(() => JSON.stringify(props.when ?? null, null, 2));

const known = computed(() => new Map((props.classifiers ?? []).map((c) => [c.id, c])));
/** `agent.*` 这种一整类：一个都对不上才算缺（网关会报读不懂）。 */
const missing = (id: string): boolean =>
  props.classifiers !== undefined &&
  (isCategoryRef(id) ? !props.classifiers.some((c) => refMatches(id, c.id)) : !known.value.has(id));
const nameOf = (id: string): string =>
  isCategoryRef(id) ? `${lookOfCategory(categoryOf(id)).label} 全部` : (known.value.get(id)?.name ?? id);
const missingText = (id: string): string => (isCategoryRef(id) ? '这一类还没有分类器' : '没有这个分类器');

const opText = (row: FieldRow): string => (row.op === 'exists' ? (row.negate ? '没有值' : '有值') : opLabel(row.op));
const valueJoin = (row: FieldRow): string => (row.op === 'contains_all' ? '和' : '或');

const SHORT = 24;
const shorten = (v: string): string => (v.length > SHORT ? `${v.slice(0, SHORT)}…` : v);
/** 简要版只显示第一个值。 */
const shownValues = (row: FieldRow): string[] => (props.compact ? row.values.slice(0, 1).map(shorten) : row.values);
const hiddenValues = (row: FieldRow): number => (props.compact ? Math.max(0, row.values.length - 1) : 0);
</script>

<template>
  <el-tooltip
    :disabled="!compact || !tree"
    :content="sentence"
    placement="top-start"
    :show-after="300"
  >
    <div
      class="chips"
      :class="{ 'chips--compact': compact }"
      :aria-label="sentence"
      role="group"
    >
      <template v-if="tree">
        <template
          v-for="(token, i) in tokens"
          :key="i"
        >
          <span
            v-if="token.t === 'join'"
            class="chips__join"
          >{{ token.text }}</span>
          <span
            v-else-if="token.t === 'open' || token.t === 'close'"
            class="chips__paren"
          >{{ token.t === 'open' ? '(' : ')' }}</span>
          <span
            v-else-if="token.t === 'not'"
            class="chips__not"
          >{{ token.text }}</span>
          <span
            v-else-if="token.t === 'tool'"
            class="chips__tool"
          >{{ token.text }}</span>
          <span
            v-else-if="token.t === 'more'"
            class="chip chip--more"
          >{{ token.text }}</span>

          <template v-else-if="token.t === 'classifier'">
            <template
              v-for="(id, j) in token.row.classifiers"
              :key="id"
            >
              <span
                v-if="j > 0"
                class="chips__or"
              >或</span>
              <el-tooltip
                :disabled="compact"
                :content="missing(id) ? missingText(id) : nameOf(id)"
                placement="top"
                :show-after="300"
              >
                <span
                  class="chip chip--classifier"
                  :class="{ 'chip--missing': missing(id) }"
                  :style="{ '--chip-color': categoryLook(id).color }"
                >
                  <el-icon :size="12">
                    <component :is="categoryLook(id).icon" />
                  </el-icon>
                  {{ id }}
                </span>
              </el-tooltip>
            </template>
          </template>

          <span
            v-else
            class="chip chip--field"
          >
            <span class="chip__key">{{ fieldLabel(token.row.field) }}</span>
            <span class="chip__op">{{ opText(token.row) }}</span>
            <template
              v-for="(v, j) in shownValues(token.row)"
              :key="j"
            >
              <span
                v-if="j > 0"
                class="chip__op"
              >{{ valueJoin(token.row) }}</span>
              <code class="chip__value">{{ v }}</code>
            </template>
            <span
              v-if="hiddenValues(token.row) > 0"
              class="chip__op"
            >+{{ hiddenValues(token.row) }}</span>
            <span
              v-if="token.row.matchCase"
              class="chip__flag"
              title="区分大小写"
            >Aa</span>
          </span>
        </template>
      </template>

      <el-tooltip
        v-else
        placement="top"
        :show-after="300"
      >
        <template #content>
          <pre class="chips__json">{{ json }}</pre>
        </template>
        <span class="chip chip--custom">{ } 自定义条件</span>
      </el-tooltip>
    </div>
  </el-tooltip>
</template>

<style scoped>
.chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.chips--compact {
  flex-wrap: nowrap;
  overflow: hidden;
  /* 一行放不下时右边淡出，不硬切 */
  mask-image: linear-gradient(to right, #000 calc(100% - 32px), transparent);
}
.chips--compact > * {
  flex-shrink: 0;
}
/* 列表里一格就这么宽：标签里的字不折行，放不下的交给上面的淡出。 */
.chips--compact .chip {
  max-width: none;
  white-space: nowrap;
}
.chip--more {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color);
  border: 1px dashed var(--el-border-color);
}
.chips__join {
  padding: 0 6px;
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
  color: var(--el-text-color-secondary);
  border-radius: 9px;
  background: var(--el-fill-color);
}
.chips__paren {
  font-size: 16px;
  font-weight: 300;
  line-height: 1;
  color: var(--el-text-color-placeholder);
}
.chips__tool {
  font-size: 12px;
  font-weight: 600;
  color: #7c3aed;
}
.chips__or {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
.chips__not {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-color-danger);
}
.chips__json {
  margin: 0;
  max-width: 420px;
  font-size: 12px;
  white-space: pre-wrap;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  min-height: 24px;
  padding: 0 9px;
  border-radius: 7px;
  font-size: 12.5px;
  line-height: 1;
}
.chip--classifier {
  font-family: var(--el-font-family-monospace, ui-monospace, monospace);
  font-weight: 600;
  color: var(--chip-color);
  background: color-mix(in srgb, var(--chip-color) 11%, transparent);
  border: 1px solid color-mix(in srgb, var(--chip-color) 22%, transparent);
}
.chip--missing {
  --chip-color: var(--el-color-danger);
  border-style: dashed;
  text-decoration: line-through;
}
.chip--field {
  gap: 6px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
}
.chip__key {
  font-family: var(--el-font-family-monospace, ui-monospace, monospace);
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.chip__op {
  color: var(--el-text-color-secondary);
}
.chip__value {
  padding: 2px 6px;
  border-radius: 5px;
  font-size: 12px;
  color: var(--el-text-color-primary);
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chip__flag {
  font-size: 11px;
  font-weight: 700;
  color: var(--el-color-primary);
}
.chip--custom {
  font-family: var(--el-font-family-monospace, ui-monospace, monospace);
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
  border: 1px dashed var(--el-border-color);
}
</style>
