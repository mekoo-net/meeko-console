<script setup lang="ts">
/**
 * 编一个条件，分类器和过滤规则共用。
 *
 * 表单编得出来的是一组行，全部成立或任一成立，每行可以取反。每行先选从哪儿取值：请求头（再选哪个头）、
 * 系统提示词，或者（只有过滤规则能选）引用分类器——网关不让分类器互相引用。来源是网关的编译器报的字段整理出来的，
 * 网关以后多认一种字段，这里自己就多一个来源。
 * 套了好几层的条件表单编不出来，切到 JSON 直接写（网关认的写法见 OneApi 的 request-filter.md）。
 *
 * 只在挂上的那一刻读 `initial`：弹窗每打开一次都用新的 key 重挂它。父组件存之前调 `read()` 取结果。
 */
import { computed, ref } from 'vue';
import { Delete, Plus } from '@element-plus/icons-vue';

import {
  buildCondition,
  conditionSources,
  fieldLabel,
  flatConditionError,
  flattenCondition,
  opLabel,
  opNeedsValue,
  opTakesMany,
  sourceOf,
  type ConditionRow,
  type FlatCondition,
} from '../../model/filter';
import type { FilterClassifier, FilterSchema } from '../../model/filter.types';

const props = defineProps<{
  /** 原来的条件；新建时不给。 */
  initial?: unknown;
  schema: FilterSchema;
  /** 能引用的分类器；null = 这里不能引用分类器（分类器自己的条件）。 */
  classifiers: readonly FilterClassifier[] | null;
}>();

const CLASSIFIER = 'classifier';
const HEADER = 'header';

const canReference = computed(() => props.classifiers !== null);
const textOperators = computed(() => props.schema.operators.text ?? []);
const sources = computed(() => [
  ...(canReference.value ? [{ key: CLASSIFIER, label: '分类器' }] : []),
  ...conditionSources(props.schema.fields),
]);
const headerFields = computed(() => props.schema.fields.filter((f) => sourceOf(f.name) === HEADER));

/** 请求头多半按开头认（UA），系统提示词多半按包含认。 */
function blankField(field: string): ConditionRow {
  const preferred = sourceOf(field) === HEADER ? 'prefix' : 'contains';
  const ops = textOperators.value;
  return {
    kind: 'field',
    negate: false,
    field,
    op: ops.includes(preferred) ? preferred : (ops[0] ?? ''),
    values: [],
    ignoreCase: false,
  };
}

const blankClassifier = (): ConditionRow => ({ kind: 'classifier', negate: false, classifiers: [] });

/** 新的一行：过滤规则多半是「是不是某一类」，先给分类器；分类器自己的条件先给第一个来源。 */
function blankRow(): ConditionRow {
  if (canReference.value) return blankClassifier();
  return rowFor(sources.value[0]?.key ?? HEADER);
}

/** 换成某个来源的空行。请求头先选第一个头。 */
function rowFor(source: string): ConditionRow {
  if (source === CLASSIFIER) return blankClassifier();
  if (source === HEADER) return blankField(headerFields.value[0]?.name ?? '');
  return blankField(source);
}

const sourceOfRow = (row: ConditionRow): string => (row.kind === 'classifier' ? CLASSIFIER : sourceOf(row.field));

const readable = props.initial === undefined ? null : flattenCondition(props.initial);
/** 条件表单读不成原来的写法：不让切回表单，免得一切就把原来的条件丢了。 */
const formUnavailable = ref(props.initial !== undefined && readable === null);
/** 直接写 JSON。表单读不成的条件只能这样改。 */
const jsonMode = ref(formUnavailable.value);
const flat = ref<FlatCondition>(readable ?? { mode: 'all', rows: [blankRow()] });
const jsonText = ref(props.initial === undefined ? '' : JSON.stringify(props.initial, null, 2));
const switchError = ref<string | null>(null);

function parseJson(): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(jsonText.value) };
  } catch {
    return { ok: false, error: '条件不是合法的 JSON' };
  }
}

/** 切到 JSON 时把表单里现在的样子带过去；切回来时把 JSON 读回表单，读不成就留在 JSON。 */
function onToggleJson(next: boolean | string | number): void {
  if (next === true) {
    jsonText.value = JSON.stringify(buildCondition(flat.value), null, 2);
    jsonMode.value = true;
    switchError.value = null;
    return;
  }
  const parsed = parseJson();
  const back = parsed.ok ? flattenCondition(parsed.value) : null;
  if (!back || (!canReference.value && back.rows.some((r) => r.kind === 'classifier'))) {
    switchError.value = parsed.ok ? '这个条件表单编不出来，只能用 JSON 改' : parsed.error;
    return;
  }
  flat.value = back;
  formUnavailable.value = false;
  jsonMode.value = false;
  switchError.value = null;
}

function setSource(index: number, source: string | number | boolean | undefined): void {
  const current = flat.value.rows[index];
  if (!current || typeof source !== 'string' || sourceOfRow(current) === source) return;
  flat.value.rows.splice(index, 1, { ...rowFor(source), negate: current.negate });
}

function operatorsOf(field: string): string[] {
  const kind = props.schema.fields.find((f) => f.name === field)?.kind ?? 'text';
  return props.schema.operators[kind] ?? textOperators.value;
}

/** 换了比法以后，值的个数跟着收：正则只留一个，`有值` 不留。 */
function onOpChange(row: ConditionRow): void {
  if (row.kind !== 'field') return;
  if (!opNeedsValue(row.op)) row.values = [];
  else if (!opTakesMany(row.op)) row.values = row.values.slice(0, 1);
}

const singleValue = (row: ConditionRow): string => (row.kind === 'field' ? (row.values[0] ?? '') : '');
function setSingleValue(row: ConditionRow, value: string): void {
  if (row.kind === 'field') row.values = value === '' ? [] : [value];
}

function classifierLabel(c: FilterClassifier): string {
  return c.name ? `${c.id}（${c.name}）` : c.id;
}

function addRow(): void {
  flat.value.rows.push(blankRow());
}
function removeRow(index: number): void {
  flat.value.rows.splice(index, 1);
}

/** 交出条件；还没填好时说哪里没填好。 */
function read(): { ok: true; when: unknown } | { ok: false; error: string } {
  if (jsonMode.value) {
    const parsed = parseJson();
    return parsed.ok ? { ok: true, when: parsed.value } : parsed;
  }
  const error = flatConditionError(flat.value);
  return error ? { ok: false, error } : { ok: true, when: buildCondition(flat.value) };
}

defineExpose({ read });
</script>

<template>
  <div class="cond">
    <div class="cond__bar">
      <el-segmented
        v-if="!jsonMode && flat.rows.length > 1"
        v-model="flat.mode"
        :options="[
          { label: '全部满足', value: 'all' },
          { label: '任一满足', value: 'any' },
        ]"
        size="small"
      />
      <span class="cond__spacer" />
      <el-switch
        :model-value="jsonMode"
        :disabled="formUnavailable && jsonMode"
        size="small"
        active-text="JSON"
        @change="onToggleJson"
      />
    </div>

    <el-input
      v-if="jsonMode"
      v-model="jsonText"
      type="textarea"
      :autosize="{ minRows: 6, maxRows: 16 }"
      spellcheck="false"
      class="cond__json"
      data-test="cond-json"
    />

    <template v-else>
      <div
        v-for="(row, index) in flat.rows"
        :key="index"
        class="cond-row"
        :data-kind="row.kind"
        :data-source="sourceOfRow(row)"
      >
        <el-checkbox
          v-model="row.negate"
          class="cond-row__not"
        >
          取反
        </el-checkbox>
        <el-select
          :model-value="sourceOfRow(row)"
          class="cond-row__source"
          data-test="cond-source"
          @change="(v: string) => setSource(index, v)"
        >
          <el-option
            v-for="s in sources"
            :key="s.key"
            :label="s.label"
            :value="s.key"
          />
        </el-select>

        <template v-if="row.kind === 'classifier'">
          <el-select
            v-model="row.classifiers"
            multiple
            filterable
            class="cond-row__value"
            placeholder="选分类器，可多选"
            no-data-text="还没有分类器"
            data-test="cond-classifiers"
          >
            <el-option
              v-for="c in classifiers ?? []"
              :key="c.id"
              :label="classifierLabel(c)"
              :value="c.id"
            />
          </el-select>
        </template>

        <template v-else>
          <el-select
            v-if="sourceOfRow(row) === HEADER"
            v-model="row.field"
            filterable
            class="cond-row__field"
            placeholder="哪个头"
          >
            <el-option
              v-for="f in headerFields"
              :key="f.name"
              :label="fieldLabel(f.name)"
              :value="f.name"
            />
          </el-select>
          <el-select
            v-model="row.op"
            class="cond-row__op"
            placeholder="比法"
            @change="onOpChange(row)"
          >
            <el-option
              v-for="op in operatorsOf(row.field)"
              :key="op"
              :label="opLabel(op)"
              :value="op"
            />
          </el-select>
          <el-select
            v-if="opTakesMany(row.op)"
            v-model="row.values"
            multiple
            filterable
            allow-create
            default-first-option
            :reserve-keyword="false"
            class="cond-row__value"
            placeholder="输入后回车，可多个"
            no-data-text="输入后回车"
            data-test="cond-values"
          />
          <el-input
            v-else-if="opNeedsValue(row.op)"
            :model-value="singleValue(row)"
            class="cond-row__value"
            placeholder="正则表达式"
            @update:model-value="(v: string) => setSingleValue(row, v)"
          />
          <span
            v-else
            class="cond-row__value"
          />
          <el-tooltip
            content="不分大小写"
            :show-after="300"
          >
            <el-checkbox
              v-model="row.ignoreCase"
              :disabled="!opNeedsValue(row.op)"
              class="cond-row__case"
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
          :disabled="flat.rows.length === 1"
          aria-label="删掉这个条件"
          @click="removeRow(index)"
        />
      </div>
      <el-button
        :icon="Plus"
        link
        type="primary"
        class="cond__add"
        @click="addRow"
      >
        加一个条件
      </el-button>
    </template>

    <el-alert
      v-if="switchError"
      :title="switchError"
      type="warning"
      :closable="false"
      show-icon
    />
  </div>
</template>

<style scoped>
.cond {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cond__bar {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 24px;
}
.cond__spacer {
  flex: 1;
}
.cond__add {
  align-self: flex-start;
}
.cond__json :deep(textarea) {
  font-family: var(--el-font-family-monospace, ui-monospace, monospace);
  font-size: 12.5px;
}

.cond-row {
  display: flex;
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
  flex: 0 0 112px;
}
.cond-row__field {
  flex: 0 0 180px;
}
.cond-row__op {
  flex: 0 0 104px;
}
.cond-row__value {
  flex: 1;
  min-width: 0;
}
</style>
