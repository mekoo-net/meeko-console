<script setup lang="ts">
import { computed } from 'vue';
import { ElMessage } from 'element-plus';
import { ChatLineSquare, Delete, Plus } from '@element-plus/icons-vue';

import { messageKeys } from '../model/activityMessages';
import {
  defaultRuleFor,
  factGroupLabels,
  nextRuleId,
  type FactDescriptor,
  type RuleDraft,
  type RuleSetDraft,
} from '../model/activityReward.types';

/**
 * 资格条件编辑器，完全按后端下发的条件目录渲染：比较方式、取值控件、单位都来自目录，
 * 条件的形态（kind）跟着所选条件项走。
 *
 * 不满足时的自定义提示是文字，写在活动语言包的 `reward.{key}.rule.{条件 id}`，这里只给出这个 key。
 */
const rules = defineModel<RuleSetDraft>({ required: true });

const props = defineProps<{
  facts: readonly FactDescriptor[];
  /** 同一活动下的其他奖励，「本活动奖励」类条件从这里选 */
  siblings: readonly { key: string; name: string }[];
  rewardKey: string;
  /** 语言包里已写了自定义提示的条件 id */
  hinted: ReadonlySet<string>;
}>();

const MAX_RULES = 20;

const groups = computed(() => {
  const map = new Map<FactDescriptor['group'], FactDescriptor[]>();
  for (const f of props.facts) map.set(f.group, [...(map.get(f.group) ?? []), f]);
  return [...map].map(([group, items]) => ({ group, label: factGroupLabels[group], items }));
});

const descriptorOf = (rule: RuleDraft) => props.facts.find((f) => f.key === rule.fact);

function unitOf(rule: RuleDraft): string | null {
  const d = descriptorOf(rule);
  return d?.kind === 'number' ? d.unit : null;
}

function optionsOf(rule: RuleDraft) {
  const d = descriptorOf(rule);
  return d?.kind === 'choice' ? d.options : [];
}

function picksReward(rule: RuleDraft): boolean {
  const d = descriptorOf(rule);
  return d?.kind === 'tag' && d.source === 'reward';
}

const hintKey = (rule: RuleDraft) => messageKeys.ruleMessage(props.rewardKey || '{key}', rule.id);

async function copyHintKey(rule: RuleDraft): Promise<void> {
  try {
    await navigator.clipboard.writeText(hintKey(rule));
    ElMessage.success(`已复制 ${hintKey(rule)}`);
  } catch {
    ElMessage.warning('复制失败，请手动复制');
  }
}

function add(): void {
  const first = props.facts[0];
  if (first) rules.value.rules.push(defaultRuleFor(first, nextRuleId(rules.value.rules)));
}

function remove(index: number): void {
  rules.value.rules.splice(index, 1);
}

/** 换条件项就按它的形态重建条件；id 不变，自定义提示还挂在它上面。 */
function changeFact(index: number, key: string): void {
  const d = props.facts.find((f) => f.key === key);
  const old = rules.value.rules[index];
  if (d && old) rules.value.rules[index] = defaultRuleFor(d, old.id);
}

</script>

<template>
  <div class="rules">
    <div class="rules__head">
      <span>满足</span>
      <el-select
        v-model="rules.match"
        size="small"
        style="width: 96px"
        :disabled="rules.rules.length < 2"
      >
        <el-option
          label="全部"
          value="all"
        />
        <el-option
          label="任一"
          value="any"
        />
      </el-select>
      <span>条件才能领取</span>
      <span
        v-if="!rules.rules.length"
        class="rules__none"
      >无条件</span>
    </div>

    <div
      v-for="(rule, i) in rules.rules"
      :key="rule.id"
      class="rule"
    >
      <div class="rule__row">
        <el-select
          :model-value="rule.fact"
          size="small"
          class="rule__fact"
          filterable
          @update:model-value="(v: string) => changeFact(i, v)"
        >
          <el-option-group
            v-for="g in groups"
            :key="g.group"
            :label="g.label"
          >
            <el-option
              v-for="f in g.items"
              :key="f.key"
              :label="f.label"
              :value="f.key"
            />
          </el-option-group>
        </el-select>

        <el-select
          v-model="rule.op"
          size="small"
          class="rule__op"
        >
          <el-option
            v-for="o in descriptorOf(rule)?.ops ?? []"
            :key="o.value"
            :label="o.label"
            :value="o.value"
          />
        </el-select>

        <template v-if="rule.kind === 'number'">
          <el-input-number
            v-model="rule.value"
            size="small"
            :min="0"
            :precision="2"
            controls-position="right"
            class="rule__value"
          />
          <span
            v-if="unitOf(rule)"
            class="rule__unit"
          >{{ unitOf(rule) }}</span>
        </template>

        <el-select
          v-else-if="rule.kind === 'choice'"
          v-model="rule.value"
          size="small"
          class="rule__value"
        >
          <el-option
            v-for="o in optionsOf(rule)"
            :key="o.value"
            :label="o.label"
            :value="o.value"
          />
        </el-select>

        <template v-else-if="rule.kind === 'tag'">
          <el-select
            v-if="picksReward(rule)"
            v-model="rule.value"
            size="small"
            class="rule__value"
            placeholder="选择奖励"
            no-data-text="暂无其他奖励"
          >
            <el-option
              v-for="s in siblings"
              :key="s.key"
              :label="`${s.name}（${s.key}）`"
              :value="s.key"
            />
          </el-select>
          <el-input
            v-else
            v-model="rule.value"
            size="small"
            class="rule__value"
            maxlength="64"
            placeholder="成就 code"
          />
        </template>

        <el-tooltip
          :content="hintKey(rule)"
          placement="top"
        >
          <el-button
            size="small"
            text
            :type="hinted.has(rule.id) ? 'primary' : undefined"
            :icon="ChatLineSquare"
            @click="copyHintKey(rule)"
          />
        </el-tooltip>
        <el-button
          size="small"
          text
          type="danger"
          :icon="Delete"
          @click="remove(i)"
        />
      </div>

      <el-input
        v-if="rule.kind === 'id_list'"
        v-model="rule.value"
        type="textarea"
        :rows="3"
        size="small"
        class="rule__ids"
        placeholder="100001, 100002"
      />
    </div>

    <el-button
      size="small"
      :icon="Plus"
      :disabled="rules.rules.length >= MAX_RULES || !facts.length"
      @click="add"
    >
      添加条件
    </el-button>
  </div>
</template>

<style scoped>
.rules {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.rules__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.rules__none {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.rule {
  padding: 10px;
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-blank);
}
.rule__row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.rule__row .el-button + .el-button {
  margin-left: 0;
}
.rule__fact {
  width: 150px;
  flex-shrink: 0;
}
.rule__op {
  width: 96px;
  flex-shrink: 0;
}
.rule__value {
  flex: 1;
  min-width: 0;
}
.rule__unit {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.rule__ids {
  margin-top: 8px;
}
.rule__ids :deep(textarea) {
  font-family: var(--el-font-family-mono, monospace);
}
</style>
