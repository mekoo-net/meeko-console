<script setup lang="ts">
/**
 * 把一个条件画成一排标签块：引用的分类器按类别上色，请求头比较拆成「字段 · 比法 · 值」三段。
 * 表单编不出来的条件（套了好几层的手写 JSON）只画一块「自定义条件」，悬停看原文。
 * 整句话（`describeCondition`）挂在 aria-label 上，读屏和测试按它认。
 */
import { computed } from 'vue';

import { describeCondition, fieldLabel, flattenCondition, opLabel, type ConditionRow } from '../../model/filter';
import type { FilterClassifier } from '../../model/filter.types';
import { categoryLook } from './classifierCategory';

const props = defineProps<{
  when: unknown;
  /** 用来查分类器的名字、认出引用了不存在的分类器；不给就不查。 */
  classifiers?: readonly FilterClassifier[];
}>();

const flat = computed(() => flattenCondition(props.when));
const sentence = computed(() => describeCondition(props.when));
const json = computed(() => JSON.stringify(props.when ?? null, null, 2));

const known = computed(() => new Map((props.classifiers ?? []).map((c) => [c.id, c])));
const missing = (id: string): boolean => props.classifiers !== undefined && !known.value.has(id);
const nameOf = (id: string): string => known.value.get(id)?.name ?? id;

const fieldName = (row: Extract<ConditionRow, { kind: 'field' }>): string => fieldLabel(row.field);
</script>

<template>
  <div
    class="chips"
    :aria-label="sentence"
    role="group"
  >
    <template v-if="flat">
      <template
        v-for="(row, i) in flat.rows"
        :key="i"
      >
        <span
          v-if="i > 0"
          class="chips__join"
        >{{ flat.mode === 'all' ? '且' : '或' }}</span>

        <span
          v-if="row.negate"
          class="chips__not"
        >{{ row.kind === 'classifier' ? '不是' : '不满足' }}</span>

        <template v-if="row.kind === 'classifier'">
          <template
            v-for="(id, j) in row.classifiers"
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
                <el-icon :size="12"><component :is="categoryLook(id).icon" /></el-icon>
                {{ id }}
              </span>
            </el-tooltip>
          </template>
        </template>

        <span
          v-else
          class="chip chip--field"
        >
          <span class="chip__key">{{ fieldName(row) }}</span>
          <span class="chip__op">{{ row.op === 'exists' ? (row.negate ? '没带' : '有值') : opLabel(row.op) }}</span>
          <template
            v-for="(v, j) in row.values"
            :key="j"
          >
            <span
              v-if="j > 0"
              class="chip__op"
            >或</span>
            <code class="chip__value">{{ v }}</code>
          </template>
          <span
            v-if="row.ignoreCase"
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
