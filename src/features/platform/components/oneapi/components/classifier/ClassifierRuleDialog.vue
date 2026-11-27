<script setup lang="ts">
/**
 * 新建或编辑一条分类规则：它叫什么、认出来以后打什么标签、管哪些 vendor、认的条件是什么。
 *
 * 条件用表单编：一组比较，全部成立或任一成立，每个比较可以取反。这个形状盖得住请求头这一层的规则；
 * 套了好几层的条件表单编不出来，切到 JSON 直接写（网关认的写法见 OneApi 的 request-classifier.md）。
 *
 * 这里只管把表单收成一条规则交出去，不存：存要带上整份文档和版本号，由页面做。号池后台查出这条规则写错了时，
 * 页面把它的原话放回 `problems` 里，弹窗留着不关。
 */
import { computed, ref, watch } from 'vue';
import { Delete, Plus } from '@element-plus/icons-vue';

import {
  LABEL_PATTERN,
  buildCondition,
  fieldLabel,
  flatConditionError,
  flattenCondition,
  isEnabled,
  opLabel,
  opNeedsValue,
  opTakesMany,
  type FlatCondition,
  type FlatRow,
} from '../../model/classifier';
import type { ClassifierRule, ClassifierSchema } from '../../model/classifier.types';

const props = defineProps<{
  modelValue: boolean;
  /** 改哪一条；null 是新建。 */
  rule: ClassifierRule | null;
  schema: ClassifierSchema;
  /** 已经用掉的规则 id：新建时不能撞。 */
  takenIds: readonly string[];
  /** 文档里已有的标签，输入时拿来提示。 */
  knownLabels: readonly string[];
  /** 新建时先勾上的 vendor（左边选中的那个）。 */
  defaultVendors: readonly string[];
  submitting: boolean;
  /** 号池后台对这条规则说的话（英文原话）。 */
  problems: readonly string[];
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'submit', rule: ClassifierRule, originalId: string | undefined): void;
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
});

const editing = computed(() => props.rule !== null);

const id = ref('');
const label = ref('');
const vendors = ref<string[]>([]);
const enabled = ref(true);
const flat = ref<FlatCondition>({ mode: 'all', rows: [] });
/** 直接写 JSON。表单读不成的条件只能这样改。 */
const jsonMode = ref(false);
const jsonText = ref('');
/** 条件表单读不成原来的写法：不让切回表单，免得一切就把原来的条件丢了。 */
const formUnavailable = ref(false);
const localError = ref<string | null>(null);

const textOperators = computed(() => props.schema.operators.text ?? []);
const firstField = computed(() => props.schema.fields[0]?.name ?? '');

const blankRow = (): FlatRow => ({
  negate: false,
  field: firstField.value,
  op: textOperators.value.includes('prefix') ? 'prefix' : (textOperators.value[0] ?? ''),
  values: [],
  ignoreCase: false,
});

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    localError.value = null;
    const rule = props.rule;
    id.value = rule?.id ?? '';
    label.value = rule?.label ?? '';
    vendors.value = rule ? [...(rule.vendors ?? [])] : [...props.defaultVendors];
    enabled.value = rule ? isEnabled(rule) : true;

    const readable = rule ? flattenCondition(rule.when) : null;
    formUnavailable.value = rule !== null && readable === null;
    jsonMode.value = formUnavailable.value;
    flat.value = readable ?? { mode: 'all', rows: [blankRow()] };
    jsonText.value = rule ? JSON.stringify(rule.when ?? {}, null, 2) : '';
  },
);

/** 切到 JSON 时把表单里现在的样子带过去；切回来时把 JSON 读回表单，读不成就留在 JSON。 */
function onToggleJson(next: boolean | string | number): void {
  if (next === true) {
    jsonText.value = JSON.stringify(buildCondition(flat.value), null, 2);
    jsonMode.value = true;
    return;
  }
  const parsed = parseJson();
  const readable = parsed.ok ? flattenCondition(parsed.value) : null;
  if (!readable) {
    localError.value = parsed.ok ? '这个条件表单编不出来，只能用 JSON 改' : parsed.error;
    return;
  }
  flat.value = readable;
  formUnavailable.value = false;
  jsonMode.value = false;
  localError.value = null;
}

function parseJson(): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(jsonText.value) };
  } catch {
    return { ok: false, error: '条件不是合法的 JSON' };
  }
}

function operatorsOf(field: string): string[] {
  const kind = props.schema.fields.find((f) => f.name === field)?.kind ?? 'text';
  return props.schema.operators[kind] ?? textOperators.value;
}

/** 换了比法以后，值的个数跟着收：正则只留一个，`有值` 不留。 */
function onOpChange(row: FlatRow): void {
  if (!opNeedsValue(row.op)) row.values = [];
  else if (!opTakesMany(row.op)) row.values = row.values.slice(0, 1);
}

const singleValue = (row: FlatRow): string => row.values[0] ?? '';
function setSingleValue(row: FlatRow, value: string): void {
  row.values = value === '' ? [] : [value];
}

function addRow(): void {
  flat.value.rows.push(blankRow());
}
function removeRow(index: number): void {
  flat.value.rows.splice(index, 1);
}

function validate(): string | null {
  const ruleId = id.value.trim();
  if (!ruleId) return '规则 id 不能空';
  if (!editing.value && props.takenIds.includes(ruleId)) return `规则 id「${ruleId}」已经有了`;
  if (!LABEL_PATTERN.test(label.value.trim())) return '标签写成「类别.名称」，只用小写字母、数字和下划线，例如 agent.claude_code';
  if (jsonMode.value) {
    const parsed = parseJson();
    return parsed.ok ? null : parsed.error;
  }
  return flatConditionError(flat.value);
}

function submit(): void {
  localError.value = validate();
  if (localError.value) return;

  const when = jsonMode.value ? (JSON.parse(jsonText.value) as unknown) : buildCondition(flat.value);
  const chosen = vendors.value.map((v) => v.trim()).filter((v) => v !== '');
  const rule: ClassifierRule = {
    id: id.value.trim(),
    label: label.value.trim(),
    // 开着是缺省，不写；关着才写出来
    ...(enabled.value ? {} : { enabled: false }),
    // 一个都不选 = 所有 vendor，文档里就不写这个键（空数组网关当成写错了）
    ...(chosen.length > 0 ? { vendors: chosen } : {}),
    when,
  };
  emit('submit', rule, props.rule?.id);
}

const labelSuggestions = (query: string, done: (items: { value: string }[]) => void): void => {
  const q = query.trim().toLowerCase();
  done(
    [...new Set(props.knownLabels)]
      .filter((l) => l.toLowerCase().includes(q))
      .sort()
      .map((value) => ({ value })),
  );
};
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="editing ? '编辑规则' : '新建规则'"
    width="760px"
    :close-on-click-modal="false"
  >
    <el-form
      label-width="92px"
      class="rule-form"
      @submit.prevent
    >
      <el-form-item label="规则 id">
        <el-input
          v-model="id"
          :disabled="editing"
          placeholder="例如 ua-claude-code"
          data-test="rule-id"
        />
        <p class="rule-form__hint">
          遥测里用它指出是哪条规则认的；建好以后不能改。
        </p>
      </el-form-item>

      <el-form-item label="标签">
        <el-autocomplete
          v-model="label"
          :fetch-suggestions="labelSuggestions"
          placeholder="类别.名称，例如 agent.claude_code"
          class="rule-form__wide"
          data-test="rule-label"
        />
        <p class="rule-form__hint">
          命中以后给请求打的标签。同一类的写同一个类别（tavern / phone / chat / agent / sdk …），遥测里按它统计。
        </p>
      </el-form-item>

      <el-form-item label="适用 Vendor">
        <el-select
          v-model="vendors"
          multiple
          filterable
          allow-create
          default-first-option
          clearable
          placeholder="不选 = 所有 Vendor 通用"
          class="rule-form__wide"
          data-test="rule-vendors"
        >
          <el-option
            v-for="v in schema.vendors"
            :key="v.key"
            :label="`${v.displayName}（${v.key}）`"
            :value="v.key"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="启用">
        <el-switch v-model="enabled" />
      </el-form-item>

      <el-form-item label="条件">
        <div class="cond">
          <div class="cond__bar">
            <el-radio-group
              v-if="!jsonMode && flat.rows.length > 1"
              v-model="flat.mode"
              size="small"
            >
              <el-radio-button value="all">
                全部满足
              </el-radio-button>
              <el-radio-button value="any">
                任一满足
              </el-radio-button>
            </el-radio-group>
            <span class="cond__spacer" />
            <el-switch
              :model-value="jsonMode"
              :disabled="formUnavailable && jsonMode"
              size="small"
              active-text="用 JSON 写"
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
            data-test="rule-json"
          />

          <template v-else>
            <div
              v-for="(row, index) in flat.rows"
              :key="index"
              class="cond-row"
            >
              <el-checkbox
                v-model="row.negate"
                class="cond-row__not"
              >
                取反
              </el-checkbox>
              <el-select
                v-model="row.field"
                filterable
                class="cond-row__field"
                placeholder="字段"
              >
                <el-option
                  v-for="f in schema.fields"
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
                placeholder="输入后回车，可以填多个"
                no-data-text="输入后回车"
              />
              <el-input
                v-else-if="opNeedsValue(row.op)"
                :model-value="singleValue(row)"
                class="cond-row__value"
                placeholder="正则（不支持反向引用和环视）"
                @update:model-value="(v: string) => setSingleValue(row, v)"
              />
              <span
                v-else
                class="cond-row__value cond-row__value--none"
              >不用填值</span>
              <el-checkbox
                v-model="row.ignoreCase"
                :disabled="!opNeedsValue(row.op)"
                class="cond-row__case"
              >
                不分大小写
              </el-checkbox>
              <el-button
                :icon="Delete"
                link
                :disabled="flat.rows.length === 1"
                aria-label="删掉这个条件"
                @click="removeRow(index)"
              />
            </div>
            <el-button
              :icon="Plus"
              link
              type="primary"
              @click="addRow"
            >
              加一个条件
            </el-button>
          </template>

          <p class="rule-form__hint">
            字段没有值时（比如客户端没带这个请求头）任何比法都不成立；要认「没带」，用「有值」再勾上取反。
          </p>
        </div>
      </el-form-item>
    </el-form>

    <el-alert
      v-if="localError"
      :title="localError"
      type="warning"
      :closable="false"
      show-icon
      class="rule-form__alert"
    />
    <el-alert
      v-for="(p, i) in problems"
      :key="i"
      :title="`网关读不懂这条规则：${p}`"
      type="error"
      :closable="false"
      show-icon
      class="rule-form__alert"
    />

    <template #footer>
      <el-button @click="visible = false">
        取消
      </el-button>
      <el-button
        type="primary"
        :loading="submitting"
        data-test="rule-submit"
        @click="submit"
      >
        保存
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.rule-form__wide {
  width: 100%;
}
.rule-form__hint {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}
.rule-form__alert {
  margin-top: 8px;
}

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
.cond__json :deep(textarea) {
  font-family: var(--el-font-family-monospace, ui-monospace, monospace);
  font-size: 12.5px;
}

.cond-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.cond-row__not,
.cond-row__case {
  flex: none;
  margin-right: 0;
}
.cond-row__field {
  flex: 0 0 200px;
}
.cond-row__op {
  flex: 0 0 112px;
}
.cond-row__value {
  flex: 1;
  min-width: 0;
}
.cond-row__value--none {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
</style>
