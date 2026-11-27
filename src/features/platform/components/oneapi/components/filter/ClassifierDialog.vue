<script setup lang="ts">
/**
 * 新建或编辑一个分类器：它叫什么、什么样的请求算这一类。分类器只认请求，不放行也不拒绝——
 * 放不放行是各个 Vendor 的过滤规则引用它以后说的。
 *
 * 只管把表单收成一个分类器交出去，不存：存要带上整份文档和版本号，由页面做。号池后台查出它写错了时，
 * 页面把原话放回 `problems` 里，弹窗留着不关。
 */
import { computed, ref, watch } from 'vue';

import { CLASSIFIER_ID_PATTERN } from '../../model/filter';
import type { FilterClassifier, FilterSchema } from '../../model/filter.types';
import ConditionEditor from './ConditionEditor.vue';

const props = defineProps<{
  modelValue: boolean;
  /** 改哪一个；null 是新建。 */
  classifier: FilterClassifier | null;
  schema: FilterSchema;
  /** 已经用掉的 id：新建时不能撞。 */
  takenIds: readonly string[];
  submitting: boolean;
  /** 号池后台对这个分类器说的话（英文原话）。 */
  problems: readonly string[];
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'submit', classifier: FilterClassifier, originalId: string | undefined): void;
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
});

const editing = computed(() => props.classifier !== null);

const id = ref('');
const name = ref('');
const localError = ref<string | null>(null);
/** 每打开一次换一个，条件编辑器跟着重挂，读进这一次的条件。 */
const opened = ref(0);
const editor = ref<InstanceType<typeof ConditionEditor> | null>(null);

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    opened.value += 1;
    localError.value = null;
    id.value = props.classifier?.id ?? '';
    name.value = props.classifier?.name ?? '';
  },
);

function submit(): void {
  const classifierId = id.value.trim();
  if (!CLASSIFIER_ID_PATTERN.test(classifierId)) {
    localError.value = 'id 写成「类别.名称」，只用小写字母、数字和下划线，例如 chat.app';
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
      <el-form-item label="id">
        <el-input
          v-model="id"
          :disabled="editing"
          placeholder="类别.名称，例如 chat.tavern、agent.claude"
          data-test="classifier-id"
        />
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
</style>
