<script setup lang="ts">
/**
 * 编一个条件，分类器和过滤规则共用。
 *
 * 最外面是一组（全部满足 / 任一满足），组里是一行行条件，也可以再套一组。每行先选来源（请求头 / 提示词 / 工具，
 * 过滤规则还能选分类器），再选层级（哪个头；提示词的系统 / 用户 / 助手；工具的名称 / 描述 / 数量）。
 * 来源和层级是网关的编译器报的字段整理出来的，网关多认一种字段，这里自己就有。网关不让分类器互相引用，所以分类器的条件里没有「分类器」。
 * 写法这一页不认识的条件切到 JSON 直接写（网关认的写法见 OneApi 的 request-filter.md）。
 *
 * 只在挂上的那一刻读 `initial`：弹窗每打开一次都用新的 key 重挂它。父组件存之前调 `read()` 取结果。
 */
import { ref } from 'vue';

import { buildCondition, conditionError, conditionTree, emptyTree, type ConditionGroup } from '../../model/filter';
import type { FilterClassifier, FilterSchema } from '../../model/filter.types';
import ConditionGroupEditor from './ConditionGroupEditor.vue';
import { createEditorContext } from './conditionEditing';

const props = defineProps<{
  /** 原来的条件；新建时不给。 */
  initial?: unknown;
  schema: FilterSchema;
  /** 能引用的分类器；null = 这里不能引用分类器（分类器自己的条件）。 */
  classifiers: readonly FilterClassifier[] | null;
}>();

const ctx = createEditorContext(props.schema, props.classifiers);

const readable = props.initial === undefined ? null : conditionTree(props.initial);
/** 表单读不成原来的写法：不让切回表单，免得一切就把原来的条件丢了。 */
const formUnavailable = ref(props.initial !== undefined && readable === null);
/** 直接写 JSON。表单读不成的条件只能这样改。 */
const jsonMode = ref(formUnavailable.value);
const tree = ref<ConditionGroup>(readable ?? emptyTree(ctx.newRow()));
const jsonText = ref(props.initial === undefined ? '' : JSON.stringify(props.initial, null, 2));
const switchError = ref<string | null>(null);

function parseJson(): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(jsonText.value) };
  } catch {
    return { ok: false, error: '条件不是合法的 JSON' };
  }
}

/** 引用了分类器的条件，分类器的编辑器里编不了（网关也不认）。 */
const refersToClassifier = (group: ConditionGroup): boolean =>
  group.children.some((c) => (c.kind === 'group' ? refersToClassifier(c) : c.kind === 'classifier'));

/** 切到 JSON 时把表单里现在的样子带过去；切回来时把 JSON 读回表单，读不成就留在 JSON。 */
function onToggleJson(next: boolean | string | number): void {
  if (next === true) {
    jsonText.value = JSON.stringify(buildCondition(tree.value), null, 2);
    jsonMode.value = true;
    switchError.value = null;
    return;
  }
  const parsed = parseJson();
  const back = parsed.ok ? conditionTree(parsed.value) : null;
  if (!back || (props.classifiers === null && refersToClassifier(back))) {
    switchError.value = parsed.ok ? '这个条件表单编不出来，只能用 JSON 改' : parsed.error;
    return;
  }
  tree.value = back;
  formUnavailable.value = false;
  jsonMode.value = false;
  switchError.value = null;
}

/** 交出条件；还没填好时说哪里没填好。 */
function read(): { ok: true; when: unknown } | { ok: false; error: string } {
  if (jsonMode.value) {
    const parsed = parseJson();
    return parsed.ok ? { ok: true, when: parsed.value } : parsed;
  }
  const error = conditionError(tree.value);
  return error ? { ok: false, error } : { ok: true, when: buildCondition(tree.value) };
}

defineExpose({ read });
</script>

<template>
  <div class="cond">
    <div class="cond__bar">
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
    <ConditionGroupEditor
      v-else
      :group="tree"
      :depth="0"
      :ctx="ctx"
    />

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
}
.cond__spacer {
  flex: 1;
}
.cond__json :deep(textarea) {
  font-family: var(--el-font-family-monospace, ui-monospace, monospace);
  font-size: 12.5px;
}
</style>
