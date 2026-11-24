<script setup lang="ts">
/**
 * 一件事扣积分的依据（只读）：上面是什么时候、谁、做了什么、扣了多少，下面是它每一次调用怎么算的——
 * 一件事背后可能有好几次调用（先翻记忆的向量、重排，再是对话，带语音、配图的还有语音合成、生图），各扣各的，加起来是这件事的数。
 *
 * 每一次照 Yomi 的计费明细写：一档一行「用量 × 单价 = 积分」，单价是结算当时的（改价不改这里），
 * 下面一行是单价的来历（牌价 × 渠道倍率、单独定价、默认价）。这些只有管理端看得到，用户那边只给积分。
 *
 * 不摆调用链（第几步、成没成）、会话、这件事的编号、TraceId：查账用不上（2026-11-21 用户：「调用链 不用展示……会话有鸡毛用吗？」）。
 */
import { computed } from 'vue';

import { formatDateTime } from '@/shared/lib/date';

import { formatPoints, formatPrice, purposeLabel, usageKindLabel } from '../model/jastalkFormat';
import { dueAmount, type UsageAction } from '../model/usageActions';
import { formatQuantity, priceSuffix, quantityUnit, usageBasisText, usageTerms } from '../model/usageCalc';

const props = defineProps<{
  modelValue: boolean;
  action: UsageAction | null;
}>();

const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>();

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

/** 逐次加起来应扣的；和实扣不一样时（账上不够，扣到 0 为止）才写出来。 */
const due = computed(() => (props.action ? dueAmount(props.action) : 0));
const shortfall = computed(() => props.action !== null && props.action.status === 'charged' && due.value > props.action.amount);
</script>

<template>
  <el-drawer
    v-model="visible"
    title="扣费明细"
    direction="rtl"
    size="560px"
  >
    <div
      v-if="action"
      class="usage-detail"
    >
      <el-descriptions
        :column="2"
        border
        size="small"
        class="usage-detail__summary"
      >
        <el-descriptions-item label="发生时间">
          {{ formatDateTime(action.at, 'YYYY-MM-DD HH:mm:ss') }}
        </el-descriptions-item>
        <el-descriptions-item label="账户">
          <span class="mono">{{ action.accountUid }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="功能">
          {{ purposeLabel(action.purpose) }}
        </el-descriptions-item>
        <el-descriptions-item label="扣积分">
          <template v-if="action.status === 'charged'">
            <span class="cost-total num">{{ formatPoints(action.amount) }}</span>
            <span
              v-if="shortfall"
              class="cell-sub"
            >应扣 {{ formatPoints(due) }}，账上不够扣到 0 为止</span>
          </template>
          <el-tag
            v-else
            size="small"
            type="info"
            effect="plain"
          >
            未扣 · 没有产出，冻结整笔退回
          </el-tag>
        </el-descriptions-item>
      </el-descriptions>

      <el-divider />

      <h4 class="section-title">
        怎么算的
      </h4>

      <section
        v-for="call in action.calls"
        :key="call.step"
        class="call"
      >
        <div class="call__head">
          <span class="call__kind">{{ usageKindLabel(call.line.kind) }}</span>
          <span class="call__model mono">{{ call.line.vendorKey }} / {{ call.line.modelName }}</span>
          <el-tag
            v-if="call.line.estimated"
            size="small"
            type="warning"
            effect="plain"
            title="上游没报用量（多半是中途停了），按写出来的字数估的"
          >
            估
          </el-tag>
          <span class="call__points num">{{ formatPrice(call.line.points) }}</span>
        </div>

        <div
          v-for="term in usageTerms(call.line)"
          :key="term.label"
          class="dim-row"
          :class="{ 'dim-row--zero': term.quantity === 0 }"
        >
          <span class="dim-label">{{ term.label }}</span>
          <span class="dim-qty">{{ formatQuantity(term.quantity) }} {{ quantityUnit(call.line) }}</span>
          <span class="dim-sep">×</span>
          <span class="dim-price">{{ formatPrice(term.price) }}{{ priceSuffix(call.line) }}<span
            v-if="term.atInputPrice"
            class="dim-note"
          >（按输入价）</span></span>
          <span class="dim-sep">=</span>
          <span class="dim-amount">{{ formatPrice(term.points) }}</span>
        </div>

        <div
          class="call__basis"
          :class="{ 'call__basis--warn': call.line.ratedBy === '-' }"
        >
          {{ usageBasisText(call.line) }}
        </div>
      </section>
    </div>
  </el-drawer>
</template>

<style scoped>
.usage-detail {
  font-size: 13px;
  line-height: 1.6;
}
.usage-detail__summary :deep(.el-descriptions__label) {
  width: 88px;
}
.mono,
.num {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
}
.cost-total {
  font-weight: 600;
  color: var(--el-color-warning);
}
.cell-sub {
  margin-left: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.section-title {
  margin: 6px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}

/* 一次调用一块，块和块之间一条细线 */
.call {
  padding: 10px 0;
}
.call + .call {
  border-top: 1px dashed var(--el-border-color-lighter);
}
.call__head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 24px;
  margin-bottom: 4px;
}
.call__kind {
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.call__model {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.call__points {
  margin-left: auto;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.call__basis {
  margin-top: 2px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.call__basis--warn {
  color: var(--el-color-warning);
}

/* 一档一行（用量 × 单价 = 积分），和 Yomi 调用详情的计费明细一个写法 */
.dim-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
  font-size: 12px;
}
.dim-row--zero {
  color: var(--el-text-color-placeholder);
}
.dim-label {
  width: 56px;
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
  font-family: var(--el-font-family);
  font-size: 12.5px;
}
.dim-qty {
  flex: 1;
  text-align: right;
  min-width: 70px;
}
.dim-sep {
  color: var(--el-text-color-placeholder);
  font-size: 11px;
}
.dim-price {
  flex: 1.2;
  text-align: right;
  min-width: 90px;
}
.dim-note {
  font-family: var(--el-font-family);
  color: var(--el-text-color-secondary);
}
.dim-amount {
  flex: 1;
  text-align: right;
  min-width: 60px;
  font-weight: 500;
}
</style>
