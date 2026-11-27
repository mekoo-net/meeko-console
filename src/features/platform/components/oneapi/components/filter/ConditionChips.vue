<script setup lang="ts">
/**
 * 把一个条件画成一排标签块：引用的分类器按类别上色，字段比较拆成「字段 · 比法 · 值」三段，套着的组加括号。
 * 表单编不出来的条件（写法这一页不认识的 JSON）只画一块「自定义条件」，悬停看原文。
 * 整句话（`describeCondition`）挂在 aria-label 上，读屏和测试按它认。
 */
import { computed } from 'vue';

import {
  conditionTree,
  describeCondition,
  fieldLabel,
  opLabel,
  type ConditionNode,
  type ConditionRow,
} from '../../model/filter';
import type { FilterClassifier } from '../../model/filter.types';
import { categoryLook } from './classifierCategory';

const props = defineProps<{
  when: unknown;
  /** 用来查分类器的名字、认出引用了不存在的分类器；不给就不查。 */
  classifiers?: readonly FilterClassifier[];
}>();

type ClassifierRow = Extract<ConditionRow, { kind: 'classifier' }>;
type FieldRow = Extract<ConditionRow, { kind: 'field' }>;
type Token =
  | { t: 'join'; text: string }
  | { t: 'open' }
  | { t: 'close' }
  | { t: 'not'; text: string }
  | { t: 'tool'; text: string }
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

const tree = computed(() => conditionTree(props.when));
const tokens = computed(() => (tree.value ? tokensOf(tree.value, false, []) : []));
const sentence = computed(() => describeCondition(props.when));
const json = computed(() => JSON.stringify(props.when ?? null, null, 2));

const known = computed(() => new Map((props.classifiers ?? []).map((c) => [c.id, c])));
const missing = (id: string): boolean => props.classifiers !== undefined && !known.value.has(id);
const nameOf = (id: string): string => known.value.get(id)?.name ?? id;

const opText = (row: FieldRow): string => (row.op === 'exists' ? (row.negate ? '没有值' : '有值') : opLabel(row.op));
const valueJoin = (row: FieldRow): string => (row.op === 'contains_all' ? '和' : '或');
</script>

<template>
  <div
    class="chips"
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
              :content="missing(id) ? '没有这个分类器' : nameOf(id)"
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
            v-for="(v, j) in token.row.values"
            :key="j"
          >
            <span
              v-if="j > 0"
              class="chip__op"
            >{{ valueJoin(token.row) }}</span>
            <code class="chip__value">{{ v }}</code>
          </template>
          <span
            v-if="token.row.ignoreCase"
            class="chip__flag"
            title="不分大小写"
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
</template>

<style scoped>
.chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
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
