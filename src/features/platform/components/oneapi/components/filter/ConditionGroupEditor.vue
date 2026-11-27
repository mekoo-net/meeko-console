<script setup lang="ts">
/**
 * 条件里的一组：全部满足 / 任一满足，可以整组取反；组里是一行行条件，也可以再套一组（层级）。
 * 自己套自己画出整棵树。改动都交给 `ctx`，这里只管画。
 */
import { Delete, FolderAdd, Plus } from '@element-plus/icons-vue';

import { fieldLabel, opLabel, opNeedsValue, opTakesMany, type ConditionGroup, type ConditionRow } from '../../model/filter';
import type { FilterClassifier } from '../../model/filter.types';
import { MAX_DEPTH, type EditorContext } from './conditionEditing';

defineOptions({ name: 'ConditionGroupEditor' });

const props = defineProps<{
  group: ConditionGroup;
  depth: number;
  ctx: EditorContext;
}>();

const emit = defineEmits<{ (e: 'remove'): void }>();

const MODES = [
  { label: '全部满足', value: 'all' },
  { label: '任一满足', value: 'any' },
];

function classifierLabel(c: FilterClassifier): string {
  return c.name ? `${c.id}（${c.name}）` : c.id;
}

function onSource(index: number, row: ConditionRow, source: string): void {
  if (props.ctx.sourceOfRow(row) === source) return;
  props.ctx.replace(props.group, index, props.ctx.rowFor(source, row.negate));
}

/** 换层级：类型一样（换一个请求头）就只换字段，留着比法和值；类型不一样就换成那个字段的空行。 */
function onLevel(index: number, row: ConditionRow, field: string): void {
  if (row.kind !== 'field' || row.field === field) return;
  if (props.ctx.kindOf(row.field) === props.ctx.kindOf(field)) props.ctx.patch(row, { field });
  else props.ctx.replace(props.group, index, props.ctx.rowForField(field, row.negate));
}

const single = (row: ConditionRow): string => (row.kind === 'field' ? (row.values[0] ?? '') : '');
const numberOf = (row: ConditionRow): number | undefined => {
  const n = row.kind === 'field' ? Number(row.values[0]) : NaN;
  return Number.isFinite(n) && row.kind === 'field' && row.values[0] !== '' ? n : undefined;
};
const asText = (v: string | number | boolean | undefined): string => (v === undefined ? '' : String(v));
</script>

<template>
  <div
    class="cgroup"
    :class="{ 'cgroup--nested': depth > 0 }"
    :data-depth="depth"
  >
    <div class="cgroup__bar">
      <el-segmented
        :model-value="group.mode"
        :options="MODES"
        size="small"
        data-test="group-mode"
        @change="(v: string) => ctx.patch(group, { mode: v })"
      />
      <el-checkbox
        v-if="depth > 0"
        :model-value="group.negate"
        size="small"
        @update:model-value="(v: boolean | string | number) => ctx.patch(group, { negate: v === true })"
      >
        整组取反
      </el-checkbox>
      <span class="cgroup__spacer" />
      <el-button
        v-if="depth > 0"
        :icon="Delete"
        text
        circle
        size="small"
        aria-label="删掉这一组"
        @click="emit('remove')"
      />
    </div>

    <template
      v-for="(child, index) in group.children"
      :key="index"
    >
      <ConditionGroupEditor
        v-if="child.kind === 'group'"
        :group="child"
        :depth="depth + 1"
        :ctx="ctx"
        @remove="ctx.removeAt(group, index)"
      />
      <div
        v-else
        class="cond-row"
        :data-kind="child.kind"
        :data-source="ctx.sourceOfRow(child)"
      >
        <el-checkbox
          :model-value="child.negate"
          class="cond-row__not"
          @update:model-value="(v: boolean | string | number) => ctx.patch(child, { negate: v === true })"
        >
          取反
        </el-checkbox>
        <el-select
          :model-value="ctx.sourceOfRow(child)"
          class="cond-row__source"
          data-test="cond-source"
          @change="(v: string) => onSource(index, child, v)"
        >
          <el-option
            v-for="s in ctx.sources"
            :key="s.key"
            :label="s.label"
            :value="s.key"
          />
        </el-select>

        <el-select
          v-if="child.kind === 'classifier'"
          :model-value="child.classifiers"
          multiple
          filterable
          class="cond-row__value"
          placeholder="选分类器，可多选"
          no-data-text="还没有分类器"
          data-test="cond-classifiers"
          @update:model-value="(v: string[]) => ctx.patch(child, { classifiers: v })"
        >
          <el-option
            v-for="c in ctx.classifiers"
            :key="c.id"
            :label="classifierLabel(c)"
            :value="c.id"
          />
        </el-select>

        <template v-else>
          <el-select
            v-if="ctx.levelsOf(ctx.sourceOfRow(child)).length > 1"
            :model-value="child.field"
            filterable
            class="cond-row__level"
            data-test="cond-level"
            @change="(v: string) => onLevel(index, child, v)"
          >
            <el-option
              v-for="l in ctx.levelsOf(ctx.sourceOfRow(child))"
              :key="l.field"
              :label="l.label"
              :value="l.field"
            />
          </el-select>
          <el-select
            :model-value="child.op"
            class="cond-row__op"
            data-test="cond-op"
            @change="(v: string) => ctx.setOp(child, v)"
          >
            <el-option
              v-for="op in ctx.operatorsOf(child.field)"
              :key="op"
              :label="opLabel(op)"
              :value="op"
            />
          </el-select>

          <el-input-number
            v-if="child.numeric && opNeedsValue(child.op)"
            :model-value="numberOf(child)"
            :min="0"
            :step="1"
            step-strictly
            controls-position="right"
            class="cond-row__value"
            data-test="cond-number"
            @update:model-value="(v: number | undefined) => ctx.patch(child, { values: v === undefined || v === null ? [] : [String(v)] })"
          />
          <el-select
            v-else-if="opTakesMany(child.op, child.numeric)"
            :model-value="child.values"
            multiple
            filterable
            allow-create
            default-first-option
            :reserve-keyword="false"
            class="cond-row__value"
            :placeholder="`${fieldLabel(child.field)}，输入后回车，可多个`"
            no-data-text="输入后回车"
            data-test="cond-values"
            @update:model-value="(v: string[]) => ctx.patch(child, { values: v })"
          />
          <el-input
            v-else-if="opNeedsValue(child.op)"
            :model-value="single(child)"
            class="cond-row__value"
            placeholder="正则表达式"
            @update:model-value="(v: string | number | boolean | undefined) => ctx.patch(child, { values: asText(v) ? [asText(v)] : [] })"
          />
          <span
            v-else
            class="cond-row__value"
          />
          <el-tooltip
            v-if="!child.numeric"
            content="不分大小写（英文字母）"
            :show-after="300"
          >
            <el-checkbox
              :model-value="child.ignoreCase"
              :disabled="!opNeedsValue(child.op)"
              class="cond-row__case"
              @update:model-value="(v: boolean | string | number) => ctx.patch(child, { ignoreCase: v === true })"
            >
              Aa
            </el-checkbox>
          </el-tooltip>
        </template>

        <el-button
          :icon="Delete"
          text
          circle
          size="small"
          :disabled="depth === 0 && group.children.length === 1"
          aria-label="删掉这个条件"
          @click="ctx.removeAt(group, index)"
        />
      </div>
    </template>

    <div class="cgroup__add">
      <el-button
        :icon="Plus"
        link
        type="primary"
        data-test="add-row"
        @click="ctx.add(group, ctx.newRow())"
      >
        加条件
      </el-button>
      <el-button
        v-if="depth < MAX_DEPTH"
        :icon="FolderAdd"
        link
        type="primary"
        data-test="add-group"
        @click="ctx.add(group, ctx.newGroup())"
      >
        加一组
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.cgroup {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.cgroup--nested {
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-left: 3px solid var(--el-color-primary-light-5);
  border-radius: 10px;
  background: var(--el-bg-color);
}
.cgroup__bar {
  display: flex;
  align-items: center;
  gap: 12px;
}
.cgroup__spacer {
  flex: 1;
}
.cgroup__add {
  display: flex;
  gap: 16px;
}
.cgroup__add .el-button + .el-button {
  margin-left: 0;
}

.cond-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--el-fill-color-lighter);
}
.cond-row__not,
.cond-row__case {
  flex: none;
  margin-right: 0;
}
.cond-row__source {
  flex: 0 0 88px;
}
.cond-row__level {
  flex: 0 0 120px;
}
.cond-row__op {
  flex: 0 0 106px;
}
/* 窄的时候值单独换到下一行，不挤成一条缝 */
.cond-row__value {
  flex: 1 1 120px;
  min-width: 0;
}
</style>
