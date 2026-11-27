<script setup lang="ts">
/**
 * 新建或编辑一个 Vendor 的一条过滤规则：条件成立时放行还是拒绝。条件可以引用分类器（「是 chat.app」），
 * 也可以直接比请求头，两样也能混着写。
 *
 * 只管把表单收成一条规则交出去，不存：存要带上整份文档和版本号，由页面做。号池后台查出它写错了时，
 * 页面把原话放回 `problems` 里，弹窗留着不关。
 */
import { computed, ref, watch } from 'vue';

import { RESERVED_RULE_ID, RULE_ID_PATTERN, actionOf, isEnabled, type FilterAction } from '../../model/filter';
import type { FilterClassifier, FilterRule, FilterSchema } from '../../model/filter.types';
import ConditionEditor from './ConditionEditor.vue';

const props = defineProps<{
  modelValue: boolean;
  /** 规则在哪个 Vendor 上（给人看的名字）。 */
  vendorName: string;
  /** 改哪一条；null 是新建。 */
  rule: FilterRule | null;
  schema: FilterSchema;
  classifiers: readonly FilterClassifier[];
  /** 这个 Vendor 上已经用掉的规则 id：新建时不能撞。 */
  takenIds: readonly string[];
  submitting: boolean;
  /** 号池后台对这条规则说的话（英文原话）。 */
  problems: readonly string[];
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'submit', rule: FilterRule, originalId: string | undefined): void;
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
});

const editing = computed(() => props.rule !== null);

const id = ref('');
const action = ref<FilterAction>('deny');
const enabled = ref(true);
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
    id.value = props.rule?.id ?? '';
    // 新建的多半是拒绝：放行是缺省，用不着一条规则去说
    action.value = props.rule ? actionOf(props.rule) : 'deny';
    enabled.value = props.rule ? isEnabled(props.rule) : true;
  },
);

function submit(): void {
  const ruleId = id.value.trim();
  if (!RULE_ID_PATTERN.test(ruleId)) {
    localError.value = '规则 id 只用小写字母、数字、下划线、横线和点，例如 no-agents';
    return;
  }
  if (ruleId === RESERVED_RULE_ID) {
    localError.value = '「default」留给「都没匹配上」，换一个';
    return;
  }
  if (!editing.value && props.takenIds.includes(ruleId)) {
    localError.value = `这个 Vendor 上已经有规则「${ruleId}」了`;
    return;
  }
  const condition = editor.value?.read();
  if (!condition) return;
  if (!condition.ok) {
    localError.value = condition.error;
    return;
  }
  localError.value = null;

  emit(
    'submit',
    {
      id: ruleId,
      // 开着是缺省，不写；关着才写出来
      ...(enabled.value ? {} : { enabled: false }),
      action: action.value,
      when: condition.when,
    },
    props.rule?.id,
  );
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="`${editing ? '编辑' : '新建'}过滤规则 · ${vendorName}`"
    width="760px"
    :close-on-click-modal="false"
  >
    <el-form
      label-width="72px"
      @submit.prevent
    >
      <el-form-item label="规则 id">
        <el-input
          v-model="id"
          :disabled="editing"
          placeholder="例如 no-agents，被拒时的错误码是 filter_rejected.<id>"
          data-test="rule-id"
        />
      </el-form-item>

      <el-form-item label="动作">
        <el-radio-group
          v-model="action"
          data-test="rule-action"
        >
          <el-radio-button value="deny">
            拒绝
          </el-radio-button>
          <el-radio-button value="allow">
            放行
          </el-radio-button>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="启用">
        <el-switch v-model="enabled" />
      </el-form-item>

      <el-form-item label="条件">
        <ConditionEditor
          ref="editor"
          :key="opened"
          :initial="rule?.when"
          :schema="schema"
          :classifiers="classifiers"
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
      :title="`网关读不懂这条规则：${p}`"
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
        data-test="rule-submit"
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
