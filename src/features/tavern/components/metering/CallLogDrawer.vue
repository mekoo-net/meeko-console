<script setup lang="ts">
/**
 * 调用日志一行的详情，版式同 Yomi 调用详情抽屉：上面一张摘要表，下面分段，驳回放底栏。
 *  - 调用行：调用 / 计费明细（用量 × 价目）/ 账单；
 *  - 回合行（调用日志开始记之前的回合）：用量逐条列出 / 账单。
 * 没有 prompt / completion 原文。驳回由父页面接管（关抽屉、弹对话框），和列表里的驳回是同一个对话框。
 */
import { computed } from 'vue';
import { RefreshLeft } from '@element-plus/icons-vue';

import { BillReverseCodeLabel, logErrorCodeText, logStopReasonTruncated } from '@yomi/common';
import StatusTag from '@/shared/ui/StatusTag.vue';
import { formatDateTime } from '@/shared/lib/date';

import {
  TurnStatusLabel,
  TurnStatusTone,
  UsageKindLabel,
  type LogRow,
} from '../../model/metering.types';
import { creditPriceSummary, ratedByText } from '../../model/creditRate';
import { formatCharge, formatCredits, formatDuration, formatUsage } from '../../model/meteringFormat';
import CopyableId from './CopyableId.vue';

const visible = defineModel<boolean>('visible', { required: true });
const props = defineProps<{ row: LogRow | null }>();
const emit = defineEmits<{
  reverse: [row: LogRow];
  /** 看同一回合的全部调用：父页面按 TraceId 筛。 */
  trace: [traceId: string];
}>();

const call = computed(() => (props.row?.kind === 'call' ? props.row : null));
const turn = computed(() => (props.row?.kind === 'turn' ? props.row : null));

const statusLabel = computed(() => {
  const c = call.value;
  if (!c) return '—';
  if (c.status === 'success') return '成功';
  if (c.status === 'cancelled') return '已取消';
  return c.content.error?.code ? logErrorCodeText(c.content.error.code) : '失败';
});

const stopReasonTruncated = computed(() => logStopReasonTruncated(call.value?.content.stopReason));

interface TokenGroup {
  name: string;
  tokens: number;
  dims: { label: string; tokens: number }[];
}

/** 同 Yomi：输入 / 输出各一组，各桶互不重叠，输出不含推理。 */
const tokenGroups = computed<TokenGroup[]>(() => {
  const u = call.value?.usage;
  if (!u) return [];
  return [
    {
      name: 'Input',
      tokens: u.input.tokens,
      dims: [
        { label: '输入', tokens: u.input.tokens },
        { label: '缓存写', tokens: u.input.cachedWriteTokens },
        { label: '缓存读', tokens: u.input.cachedReadTokens },
        { label: '语音输入', tokens: u.input.audioTokens },
      ],
    },
    {
      name: 'Output',
      tokens: u.output.tokens,
      dims: [
        { label: '输出', tokens: u.output.tokens },
        { label: '推理', tokens: u.output.reasoningTokens },
        { label: '语音', tokens: u.output.audioTokens },
        { label: '图像', tokens: u.output.imageTokens },
      ],
    },
  ];
});

function openTrace(traceId: string): void {
  visible.value = false;
  emit('trace', traceId);
}
</script>

<template>
  <el-drawer
    v-model="visible"
    :title="turn ? '回合详情' : '调用详情'"
    direction="rtl"
    size="560px"
  >
    <div
      v-if="row"
      class="log-detail"
    >
      <!-- ============ 调用行 ============ -->
      <template v-if="call">
        <el-descriptions
          :column="2"
          border
          size="small"
          class="log-detail__summary"
        >
          <el-descriptions-item
            label="日志编号"
            :span="2"
          >
            <span class="mono log-id-muted">{{ call.id }}</span>
          </el-descriptions-item>
          <el-descriptions-item
            label="TraceId"
            :span="2"
          >
            <span class="mono log-id-muted">{{ call.traceId || '—' }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <StatusTag
              :label="statusLabel"
              :tone="call.status === 'success' ? 'success' : call.status === 'cancelled' ? 'info' : 'danger'"
            />
          </el-descriptions-item>
          <el-descriptions-item label="响应">
            <el-tag
              v-if="call.content.stopReason"
              size="small"
              :type="stopReasonTruncated ? 'warning' : 'info'"
              effect="plain"
              class="mono"
              :title="stopReasonTruncated ? '输出到了长度上限，被截断' : undefined"
            >
              {{ call.content.stopReason }}
            </el-tag>
            <span v-else>—</span>
          </el-descriptions-item>
          <el-descriptions-item label="发生时间">
            {{ formatDateTime(call.createdAt, 'YYYY-MM-DD HH:mm:ss') }}
          </el-descriptions-item>
          <el-descriptions-item label="耗时">
            <span class="num">{{ formatDuration(call.content.durationMs) }}</span>
            <span
              v-if="call.content.latencyMs != null"
              class="sub num"
            >首字 {{ formatDuration(call.content.latencyMs) }}</span>
          </el-descriptions-item>
          <el-descriptions-item
            label="模型"
            :span="2"
          >
            <span class="mono">{{ call.modelName }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="渠道">
            {{ call.vendorKey }}
          </el-descriptions-item>
          <el-descriptions-item label="账户">
            <router-link
              :to="`/accounts/${call.accountUid}`"
              class="mono link"
            >
              {{ call.accountUid }}
            </router-link>
          </el-descriptions-item>
          <el-descriptions-item label="管线">
            {{ call.pipeline.label }}
            <el-tag
              v-if="call.content.proactive"
              size="small"
              type="warning"
              effect="plain"
              class="tag-gap"
            >
              自主
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="扣费">
            <template v-if="call.bill">
              <span
                class="cost-total"
                :class="{ 'cost-total--void': call.bill.status !== 'charged' }"
              >{{ formatCharge(call.bill.currency, call.bill.amount) }}</span>
              <el-tag
                v-if="call.bill.status !== 'charged'"
                size="small"
                :type="TurnStatusTone[call.bill.status]"
                effect="plain"
                class="tag-gap"
              >
                {{ TurnStatusLabel[call.bill.status] }}
              </el-tag>
            </template>
            <el-tag
              v-else
              size="small"
              type="info"
              effect="plain"
            >
              平台承担
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item
            v-if="call.content.error"
            label="错误"
            :span="2"
          >
            <pre class="error-msg">{{ call.content.error.message || call.content.error.code }}</pre>
          </el-descriptions-item>
        </el-descriptions>

        <el-divider />

        <h4 class="section-title">
          调用
        </h4>
        <div class="log-detail__row">
          <span class="label">世界</span>
          <CopyableId
            :value="call.content.worldId"
            label="世界 ID"
          />
        </div>
        <div class="log-detail__row">
          <span class="label">会话</span>
          <CopyableId
            :value="call.content.sessionId"
            label="会话 ID"
          />
        </div>
        <div class="log-detail__row">
          <span class="label">工具调用</span>
          <span class="num">{{ call.content.toolCalls }}</span>
        </div>

        <el-divider />

        <h4 class="section-title">
          计费明细
        </h4>
        <div class="usage-token-grid">
          <div
            v-for="g in tokenGroups"
            :key="g.name"
          >
            <div class="dim-group-title">
              <span class="dim-group-name">{{ g.name }}</span>
              <span class="dim-group-totals">{{ g.tokens.toLocaleString() }} tokens</span>
            </div>
            <div
              v-for="d in g.dims"
              :key="d.label"
              class="dim-row"
              :class="{ 'dim-row--zero': d.tokens === 0 }"
            >
              <span class="dim-label">{{ d.label }}</span>
              <span class="dim-tokens">{{ d.tokens.toLocaleString() }} tok</span>
            </div>
          </div>
        </div>
        <el-divider class="sub-divider" />
        <div class="dim-group-title">
          <span class="dim-group-name">按现行积分价目</span>
          <span class="dim-group-totals">{{ formatCredits(call.cost.credits) }}</span>
        </div>
        <div class="log-detail__row">
          <span class="label">照的价目</span>
          <span class="mono">{{ ratedByText(call.cost.ratedBy) }}</span>
        </div>
        <div class="log-detail__row">
          <span class="label">价目</span>
          <span>{{ creditPriceSummary(call.cost.price) }}</span>
        </div>
      </template>

      <!-- ============ 回合行 ============ -->
      <template v-else-if="turn">
        <el-descriptions
          :column="2"
          border
          size="small"
          class="log-detail__summary"
        >
          <el-descriptions-item
            label="回合编号"
            :span="2"
          >
            <span class="mono log-id-muted">#{{ turn.id }}</span>
          </el-descriptions-item>
          <el-descriptions-item
            label="TraceId"
            :span="2"
          >
            <span class="mono log-id-muted">{{ turn.traceId }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="发生时间">
            {{ formatDateTime(turn.createdAt, 'YYYY-MM-DD HH:mm:ss') }}
          </el-descriptions-item>
          <el-descriptions-item label="账户">
            <router-link
              :to="`/accounts/${turn.accountUid}`"
              class="mono link"
            >
              {{ turn.accountUid }}
            </router-link>
          </el-descriptions-item>
          <el-descriptions-item label="会话">
            <CopyableId
              :value="turn.sessionId"
              label="会话 ID"
            />
            <el-tag
              v-if="turn.proactive"
              size="small"
              type="warning"
              effect="plain"
              class="tag-gap"
            >
              自主
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="扣费">
            <span
              class="cost-total"
              :class="{ 'cost-total--void': turn.bill.status !== 'charged' }"
            >{{ formatCharge(turn.bill.currency, turn.bill.amount) }}</span>
            <el-tag
              v-if="turn.bill.status !== 'charged'"
              size="small"
              :type="TurnStatusTone[turn.bill.status]"
              effect="plain"
              class="tag-gap"
            >
              {{ TurnStatusLabel[turn.bill.status] }}
            </el-tag>
          </el-descriptions-item>
        </el-descriptions>

        <el-divider />

        <h4 class="section-title">
          用量
        </h4>
        <div
          v-for="(u, i) in turn.usages"
          :key="i"
          class="dim-row"
        >
          <span class="dim-label">{{ UsageKindLabel[u.kind] ?? u.kind }}</span>
          <span class="dim-model">{{ u.vendorKey ? `${u.vendorKey}/${u.modelName}` : u.modelName }}</span>
          <span class="dim-tokens">{{ formatUsage(u) }}</span>
        </div>
      </template>

      <!-- ============ 账单（两种行共用） ============ -->
      <el-divider />

      <h4 class="section-title">
        账单
      </h4>
      <template v-if="row.bill">
        <div class="log-detail__row">
          <span class="label">计费回合</span>
          <span class="mono">#{{ row.bill.usageLogId }}</span>
          <el-button
            v-if="row.bill.calls > 1 && row.traceId"
            link
            type="primary"
            @click="openTrace(row.traceId)"
          >
            同回合 {{ row.bill.calls }} 次调用
          </el-button>
        </div>
        <div class="log-detail__row">
          <span class="label">账单号</span>
          <span class="mono">{{ row.bill.billSerialNo ?? '—' }}</span>
        </div>
        <div class="log-detail__row">
          <span class="label">账单状态</span>
          <StatusTag
            :label="TurnStatusLabel[row.bill.status]"
            :tone="TurnStatusTone[row.bill.status]"
          />
        </div>
        <template v-if="row.bill.status === 'reversed'">
          <div class="log-detail__row">
            <span class="label">驳回原因</span>
            <span>{{ BillReverseCodeLabel[row.bill.reversal.code] }}</span>
          </div>
          <div class="log-detail__row">
            <span class="label">驳回时间</span>
            <span>{{ formatDateTime(row.bill.reversal.atUtc, 'YYYY-MM-DD HH:mm:ss') }}</span>
          </div>
          <div class="log-detail__row">
            <span class="label">操作人</span>
            <span class="mono">{{ row.bill.reversal.by }}</span>
          </div>
          <div
            v-if="row.bill.reversal.remark"
            class="log-detail__row log-detail__row--col"
          >
            <span class="label">备注</span>
            <span class="reverse-remark">{{ row.bill.reversal.remark }}</span>
          </div>
        </template>
      </template>
      <div
        v-else
        class="log-detail__row"
      >
        <span class="label">账单状态</span>
        <el-tag
          size="small"
          type="info"
          effect="plain"
        >
          平台承担
        </el-tag>
      </div>
    </div>

    <template #footer>
      <div
        v-if="row"
        class="drawer-footer"
      >
        <el-button
          v-if="row.bill?.reversible"
          type="danger"
          :icon="RefreshLeft"
          @click="emit('reverse', row)"
        >
          驳回扣费
        </el-button>
        <el-tag
          v-else-if="row.bill?.status === 'reversed'"
          type="info"
          effect="plain"
        >
          该账单已驳回
        </el-tag>
        <el-tag
          v-else
          type="info"
          effect="plain"
        >
          未扣费，无法驳回
        </el-tag>
      </div>
    </template>
  </el-drawer>
</template>

<style scoped>
.log-detail {
  font-size: 13px;
  line-height: 1.6;
}

.log-detail__summary {
  margin-bottom: 4px;
}

.log-detail__summary :deep(.el-descriptions__label) {
  width: 88px;
}

.log-id-muted {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.log-detail__row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
}

.log-detail__row--col {
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.label {
  width: 96px;
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
  font-size: 12.5px;
}

.mono,
.num {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
}

.sub {
  margin-left: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.link {
  color: var(--el-color-primary);
  text-decoration: none;
}

.tag-gap {
  margin-left: 6px;
}

.cost-total {
  font-weight: 600;
  color: var(--el-color-warning);
}

.cost-total--void {
  color: var(--el-text-color-secondary);
  text-decoration: line-through;
  font-weight: 400;
}

.reverse-remark {
  width: 100%;
  padding: 8px 10px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  font-size: 12.5px;
  color: var(--el-text-color-regular);
  word-break: break-all;
  white-space: pre-wrap;
}

.drawer-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
}

.sub-divider {
  margin: 8px 0;
}

.section-title {
  margin: 6px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}

.dim-group-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin: 4px 0 6px;
  font-size: 12px;
}

.dim-group-name {
  font-weight: 600;
  color: var(--el-text-color-regular);
  letter-spacing: 0.5px;
}

.dim-group-totals {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
  font-size: 11.5px;
  color: var(--el-text-color-secondary);
}

.dim-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 0;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
  font-size: 12px;
}

.dim-row--zero {
  color: var(--el-text-color-placeholder);
}

.usage-token-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 24px;
}

.dim-label {
  width: 96px;
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
  font-family: var(--el-font-family);
  font-size: 12.5px;
}

.dim-model {
  flex: 1.4;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dim-tokens {
  flex: 1;
  text-align: right;
  min-width: 60px;
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

.dim-amount {
  flex: 1;
  text-align: right;
  min-width: 70px;
  font-weight: 500;
}

.error-msg {
  box-sizing: border-box;
  width: 100%;
  margin: 0;
  padding: 8px 10px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 6px;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  color: #991b1b;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
