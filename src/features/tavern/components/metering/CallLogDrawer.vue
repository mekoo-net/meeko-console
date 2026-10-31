<script setup lang="ts">
/**
 * 单次上游调用详情（只读），布局对齐 Yomi 的调用详情抽屉。
 * 没有 prompt / completion 原文，只有用量、折算、耗时与链路 id；挂了扣费回合的可以跳去计费明细看整回合。
 */
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { Right } from '@element-plus/icons-vue';

import { AiUsageStatusLabel, logErrorCodeText, logStopReasonTruncated } from '@yomi/common';
import StatusTag from '@/shared/ui/StatusTag.vue';
import { formatDateTime } from '@/shared/lib/date';

import {
  CallStatusTone,
  TurnStatusLabel,
  TurnStatusTone,
  type CallBill,
  type CallLog,
} from '../../model/metering.types';
import { formatCny, formatDuration } from '../../model/meteringFormat';
import { perMillionFromPerToken } from '../../model/pricingPreview';
import CopyableId from './CopyableId.vue';

const visible = defineModel<boolean>('visible', { required: true });
const props = defineProps<{ call: CallLog | null }>();

const router = useRouter();

const truncated = computed(() => logStopReasonTruncated(props.call?.content.stopReason));

/** 作废 / 失败的回合按设计没收钱，金额是 0，不能读成「这次调用免费」。 */
function billAmountText(bill: CallBill): string {
  return bill.status === 'charged' ? formatCny(bill.amount) : `${formatCny(0)}（未收费）`;
}

function openTurn(bill: CallBill): void {
  visible.value = false;
  void router.push({ path: '/tavern/billing', query: { id: String(bill.usageLogId) } });
}
</script>

<template>
  <el-drawer
    v-model="visible"
    title="调用详情"
    size="600px"
    append-to-body
  >
    <div
      v-if="call"
      class="call-detail"
    >
      <el-alert
        v-if="call.content.error"
        type="error"
        show-icon
        :closable="false"
        :title="call.content.error.code ? logErrorCodeText(call.content.error.code) : '调用失败'"
      >
        <pre class="call-detail__error">{{ call.content.error.message || '上游没有返回错误信息' }}</pre>
      </el-alert>

      <el-descriptions
        :column="2"
        size="small"
        border
      >
        <el-descriptions-item
          label="调用编号"
          :span="2"
        >
          <CopyableId
            :value="call.id"
            label="调用编号"
          />
        </el-descriptions-item>
        <el-descriptions-item
          label="TraceId"
          :span="2"
        >
          <CopyableId
            :value="call.traceId"
            label="TraceId"
          />
        </el-descriptions-item>
        <el-descriptions-item label="状态">
          <StatusTag
            :label="AiUsageStatusLabel[call.status]"
            :tone="CallStatusTone[call.status]"
          />
        </el-descriptions-item>
        <el-descriptions-item label="响应">
          <el-tag
            v-if="call.content.stopReason"
            size="small"
            :type="truncated ? 'warning' : 'info'"
            effect="plain"
            class="mono"
            :title="truncated ? '输出到了长度上限，被截断' : undefined"
          >
            {{ call.content.stopReason }}
          </el-tag>
          <span v-else>—</span>
        </el-descriptions-item>
        <el-descriptions-item label="发生时间">
          {{ formatDateTime(call.createdAt, 'YYYY-MM-DD HH:mm:ss') }}
        </el-descriptions-item>
        <el-descriptions-item label="账号">
          <router-link
            :to="`/accounts/${call.accountUid}`"
            class="mono call-detail__link"
          >
            {{ call.accountUid }}
          </router-link>
        </el-descriptions-item>
        <el-descriptions-item label="总耗时">
          <span class="num">{{ formatDuration(call.content.durationMs) }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="首字延迟">
          <span class="num">{{ formatDuration(call.content.latencyMs) }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="管线">
          {{ call.pipeline.label }} <span class="mono sub">{{ call.pipeline.id }}</span>
          <el-tag
            v-if="call.content.proactive"
            size="small"
            type="warning"
            effect="plain"
            class="call-detail__proactive"
          >
            自主
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="工具调用">
          <span class="num">{{ call.content.toolCalls }}</span>
        </el-descriptions-item>
        <el-descriptions-item
          label="模型"
          :span="2"
        >
          <span class="mono">{{ call.vendorKey }}/{{ call.modelName }}</span>
        </el-descriptions-item>
      </el-descriptions>

      <h4 class="call-detail__title">
        用量
        <span class="sub">各桶互不重叠，输出不含推理</span>
      </h4>
      <el-descriptions
        :column="4"
        size="small"
        border
        direction="vertical"
      >
        <el-descriptions-item label="输入">
          <span class="num">{{ call.usage.input.tokens.toLocaleString() }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="缓存读">
          <span class="num">{{ call.usage.input.cachedReadTokens.toLocaleString() }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="缓存写">
          <span class="num">{{ call.usage.input.cachedWriteTokens.toLocaleString() }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="语音输入">
          <span class="num">{{ call.usage.input.audioTokens.toLocaleString() }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="输出">
          <span class="num">{{ call.usage.output.tokens.toLocaleString() }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="推理">
          <span class="num">{{ call.usage.output.reasoningTokens.toLocaleString() }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="语音">
          <span class="num">{{ call.usage.output.audioTokens.toLocaleString() }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="图像">
          <span class="num">{{ call.usage.output.imageTokens.toLocaleString() }}</span>
        </el-descriptions-item>
      </el-descriptions>

      <h4 class="call-detail__title">
        按现行价目折算
        <span class="sub">不论是否向用户收费</span>
      </h4>
      <p class="call-detail__quote num">
        计价用量 {{ call.cost.billableQuantity.toLocaleString() }}
        × 倍率 ×{{ call.cost.multiplier }}
        × 基线 {{ formatCny(perMillionFromPerToken(call.cost.baseline)) }}/百万
        = <strong>{{ formatCny(call.cost.amount) }}</strong>
      </p>

      <h4 class="call-detail__title">
        链路
      </h4>
      <el-descriptions
        :column="1"
        size="small"
        border
      >
        <el-descriptions-item label="世界">
          <CopyableId
            :value="call.content.worldId"
            label="世界 ID"
          />
        </el-descriptions-item>
        <el-descriptions-item label="会话">
          <CopyableId
            :value="call.content.sessionId"
            label="会话 ID"
          />
        </el-descriptions-item>
      </el-descriptions>

      <h4 class="call-detail__title">
        计费
      </h4>
      <template v-if="call.bill">
        <el-descriptions
          :column="2"
          size="small"
          border
        >
          <el-descriptions-item label="计费回合">
            <span class="mono">{{ call.bill.usageLogId }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <StatusTag
              :label="TurnStatusLabel[call.bill.status]"
              :tone="TurnStatusTone[call.bill.status]"
            />
          </el-descriptions-item>
          <el-descriptions-item
            label="回合金额"
            :span="2"
          >
            <strong class="num">{{ billAmountText(call.bill) }}</strong>
            <span class="sub">一个回合可含多次调用（工具轮次），金额是整回合的</span>
          </el-descriptions-item>
        </el-descriptions>
        <el-button
          type="primary"
          plain
          :icon="Right"
          class="call-detail__jump"
          @click="openTurn(call.bill)"
        >
          查看计费回合
        </el-button>
      </template>
      <div
        v-else
        class="call-detail__platform"
      >
        <el-tag
          type="info"
          effect="plain"
          size="small"
        >
          平台承担
        </el-tag>
        <span>
          这次调用不挂扣费回合，不向用户收费；按现行价目约
          <strong class="num">{{ formatCny(call.cost.amount) }}</strong> 由平台承担。
        </span>
      </div>
    </div>
  </el-drawer>
</template>

<style scoped>
.call-detail {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.call-detail__error {
  margin: 4px 0 0;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
}

.call-detail__title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 8px 0 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.call-detail__quote {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.call-detail__link {
  color: var(--el-color-primary);
  text-decoration: none;
}

.call-detail__proactive {
  margin-left: 6px;
}

.call-detail__jump {
  align-self: flex-start;
}

.call-detail__platform {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
  background: var(--el-fill-color-light);
}

.mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}

.num {
  font-variant-numeric: tabular-nums;
}

.sub {
  margin-left: 6px;
  font-size: 12px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
}
</style>
