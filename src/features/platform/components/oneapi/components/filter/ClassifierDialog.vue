<script setup lang="ts">
/**
 * 新建或编辑一个分类器：它叫什么、什么样的请求算这一类。分类器只认请求，不放行也不拒绝——
 * 放不放行是各个 Vendor 的过滤规则引用它以后说的。
 *
 * id 是「分组.标识」：分组从已有的里单选（Agent、Chat……），没有合适的就直接打一个新名字，存下去就有了这一组；
 * 标识只填后半截。拆成两格是因为分组决定它在左边哪一栏、过滤规则的 `agent.*` 认不认它，不能手一滑打错。
 *
 * 只管把表单收成一个分类器交出去，不存：存要带上整份文档和版本号，由页面做。号池后台查出它写错了时，
 * 页面把原话放回 `problems` 里，弹窗留着不关。
 */
import { computed, ref, watch } from 'vue';

import { CLASSIFIER_ID_PATTERN } from '../../model/filter';
import type { FilterClassifier, FilterSchema } from '../../model/filter.types';
import { categoryOf, lookOfCategory } from './classifierCategory';
import ConditionEditor from './ConditionEditor.vue';

const props = defineProps<{
  modelValue: boolean;
  /** 改哪一个；null 是新建。 */
  classifier: FilterClassifier | null;
  schema: FilterSchema;
  /** 已经用掉的 id：新建时不能撞。 */
  takenIds: readonly string[];
  /** 已有的分组（id 的第一段），下拉框的选项。 */
  groups: readonly string[];
  /** 新建时先选好的分组：页面上正在看哪一组就是哪一组。 */
  defaultGroup?: string;
  submitting: boolean;
  /** 号池后台对这个分类器说的话（英文原话）。 */
  problems: readonly string[];
}>();

const GROUP_PATTERN = /^[a-z0-9_]+$/;
const KEY_PATTERN = /^[a-z0-9_]+(\.[a-z0-9_]+)*$/;

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'submit', classifier: FilterClassifier, originalId: string | undefined): void;
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
});

const editing = computed(() => props.classifier !== null);

const group = ref('');
const key = ref('');
const name = ref('');
const localError = ref<string | null>(null);
/** 每打开一次换一个，条件编辑器跟着重挂，读进这一次的条件。 */
const opened = ref(0);
const editor = ref<InstanceType<typeof ConditionEditor> | null>(null);

/** 下拉框里的分组：已有的，加上这一次打进去还没存的那个新名字。 */
const groupOptions = computed(() => {
  const all = [...props.groups];
  if (group.value && !all.includes(group.value)) all.push(group.value);
  return all.map((g) => ({ value: g, label: lookOfCategory(g).label, isNew: !props.groups.includes(g) }));
});

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    opened.value += 1;
    localError.value = null;
    const id = props.classifier?.id ?? '';
    group.value = id ? categoryOf(id) : (props.defaultGroup ?? '');
    key.value = id ? id.slice(group.value.length + 1) : '';
    name.value = props.classifier?.name ?? '';
  },
);

function submit(): void {
  const g = group.value.trim().toLowerCase();
  const k = key.value.trim();
  if (!GROUP_PATTERN.test(g)) {
    localError.value = g ? '分组只用小写字母、数字和下划线' : '选一个分组，或者打一个新分组的名字';
    return;
  }
  if (!KEY_PATTERN.test(k)) {
    localError.value = '标识只用小写字母、数字和下划线，例如 claude、tavern';
    return;
  }
  const classifierId = `${g}.${k}`;
  if (!CLASSIFIER_ID_PATTERN.test(classifierId)) {
    localError.value = 'id 写成「分组.标识」，只用小写字母、数字和下划线，例如 chat.app';
    return;
  }
  if (!editing.value && props.takenIds.includes(classifierId)) {
    localError.value = `分类器「${classifierId}」已经有了`;
    return;
  }
  const condition = editor.value?.read();
  if (!condition) return;
  if (!condition.ok) {
    localError.value = condition.error;
    return;
  }
  localError.value = null;

  const label = name.value.trim();
  emit(
    'submit',
    { id: classifierId, ...(label ? { name: label } : {}), when: condition.when },
    props.classifier?.id,
  );
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="editing ? '编辑分类器' : '新建分类器'"
    width="880px"
    :close-on-click-modal="false"
  >
    <el-form
      label-width="72px"
      @submit.prevent
    >
      <el-form-item label="分组">
        <el-select
          v-model="group"
          :disabled="editing"
          filterable
          allow-create
          default-first-option
          placeholder="选一个分组，或者打一个新名字"
          class="group-select"
          data-test="classifier-group"
        >
          <el-option
            v-for="o in groupOptions"
            :key="o.value"
            :label="o.label"
            :value="o.value"
          >
            <span class="group-option">
              <span>{{ o.label }}</span>
              <code class="group-option__key">{{ o.value }}</code>
              <el-tag
                v-if="o.isNew"
                size="small"
                effect="plain"
                round
              >新分组</el-tag>
            </span>
          </el-option>
        </el-select>
      </el-form-item>

      <el-form-item label="标识">
        <el-input
          v-model="key"
          :disabled="editing"
          placeholder="例如 claude、tavern"
          data-test="classifier-key"
        >
          <template #prepend>
            {{ group ? `${group}.` : '分组.' }}
          </template>
        </el-input>
      </el-form-item>

      <el-form-item label="名称">
        <el-input
          v-model="name"
          placeholder="可不填"
          data-test="classifier-name"
        />
      </el-form-item>

      <el-form-item label="条件">
        <ConditionEditor
          ref="editor"
          :key="opened"
          :initial="classifier?.when"
          :schema="schema"
          :classifiers="null"
        />
      </el-form-item>
    </el-form>

    <el-alert
      v-if="localError"
      :title="localError"
      type="warning"
      :closable="false"
      show-icon
      class="dialog-alert"
    />
    <el-alert
      v-for="(p, i) in problems"
      :key="i"
      :title="`网关读不懂这个分类器：${p}`"
      type="error"
      :closable="false"
      show-icon
      class="dialog-alert"
    />

    <template #footer>
      <el-button @click="visible = false">
        取消
      </el-button>
      <el-button
        type="primary"
        :loading="submitting"
        data-test="classifier-submit"
        @click="submit"
      >
        保存
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.dialog-alert {
  margin-top: 8px;
}
.group-select {
  width: 260px;
}
.group-option {
  display: flex;
  align-items: center;
  gap: 8px;
}
.group-option__key {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
