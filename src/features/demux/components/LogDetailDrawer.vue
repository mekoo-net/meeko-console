<script setup lang="ts">
/**
 * 单条调用日志详情抽屉（只读）。
 *
 * 注意：日志服务**不**返回 prompt/completion 原文（隐私 & 体积），
 * 这里能展示的只有 usage 计数、扣费、链路标签、错误码。如果需要 debug，
 * 应跳转到外部抓样系统。
 *
 * `usage` / `cost` 形状随 `billingType` 变化（discriminated union）：
 *  - `per_token` → 详细 token + input/output/cached/reasoning 扣费拆分
 *  - 其它类型    → 按各自 usage 维度展示（图片张数 / 视频秒数 / 音频分钟 / 字符数 / 次数）
 */
import { computed } from 'vue';
import { RefreshLeft } from '@element-plus/icons-vue';

import { formatDateTime } from '@/shared/lib/date';
import { BILLING_FRACTION_DIGITS, formatMoney } from '@/shared/lib/money';
import StatusTag from '@/shared/ui/StatusTag.vue';

import {
  AiUsageStatusLabel,
  billingTypeText,
  billReverseCodeText,
  logErrorCodeText,
  logIsSuccess,
  logProtocolText,
} from '@demux/common';
import type { LogEntry } from '@demux/common';

interface Props {
  modelValue: boolean;
  log: LogEntry | null;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  /** 用户在抽屉底部点了"驳回"，由父组件接管：关抽屉、弹驳回对话框、调 port.reverse() */
  (e: 'reverse', log: LogEntry): void;
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

function vendorFromModelName(modelName: string): string {
  const i = modelName.indexOf('/');
  return i > 0 ? modelName.slice(0, i) : '—';
}

/**
 * 渠道展示优先级：对外 slug（`vendorPlug`）→ 内部渠道键（`vendorKey`）→ modelName 前缀。
 * slug 才是运营对外沟通用的名字，`vendorKey` 是队列组代号，只在 slug 没配时兜底。
 */
const vendorText = computed(() => {
  const l = props.log;
  if (!l) return '—';
  return l.vendorPlug?.trim() || l.vendorKey?.trim() || vendorFromModelName(l.modelName);
});

/** slug 与内部键不同名时，把内部键作为副标题带出来，方便对着 queue_group 排障。 */
const vendorKeySub = computed(() => {
  const l = props.log;
  const key = l?.vendorKey?.trim();
  if (!key) return '';
  return key === vendorText.value ? '' : key;
});

const protocolText = computed(() => logProtocolText(props.log?.content.protocol));

/** sk- 调用但令牌名没补全（令牌已删）时退化显示 `#id`，不能跟 PG 直发混为一谈。 */
const sourceText = computed(() => {
  const token = props.log?.token;
  if (!token) return 'PG 直发';
  return token.name?.trim() || `#${token.id}`;
});

const upstreamModelText = computed(() => props.log?.vendorModel?.trim() || '—');

const hasCharge = computed(() => {
  const l = props.log;
  return l != null && logIsSuccess(l) && Number(l.cost.total) > 0;
});

const clientIpText = computed(() => props.log?.content.clientIp?.trim() || '—');

/** 耗时语义随流式切换：流式是首字延迟，非流式是端到端总耗时。 */
const latencyHint = computed(() =>
  props.log?.content.streamed ? '首字延迟（TTFT）' : '端到端总耗时',
);

/** 是否允许触发驳回：有账单 & 当前状态是 completed */
const canReverse = computed(() => {
  const b = props.log?.bill;
  return b != null && b.status === 'completed';
});

function onReverseClick(): void {
  if (props.log && canReverse.value) emit('reverse', props.log);
}

/**
 * `per_token` 用量 / 扣费按 input / output 父子集分组渲染。
 * 每一行 = 一个维度的"完整账单"：用量 × 单价 = 扣费，跟 schema 的 DimensionCost 一对一。
 */
interface DimRow {
  label: string;
  tokens: number;
  perMToken: number;
  amount: number;
}

const inputDims = computed<DimRow[]>(() => {
  const l = props.log;
  // `unknown` 与 `per_token` 同形（见 logEntrySchema 的兜底分支），共用这套维度展开。
  if (!l || (l.billingType !== 'per_token' && l.billingType !== 'unknown')) return [];
  const u = l.usage.input;
  const c = l.cost.input;
  return [
    { label: '主输入', tokens: u.tokens, perMToken: c.perMToken, amount: c.amount },
    {
      label: 'cached 读',
      tokens: u.cachedReadTokens,
      perMToken: c.cachedRead.perMToken,
      amount: c.cachedRead.amount,
    },
    {
      label: 'cache 写',
      tokens: u.cachedWriteTokens,
      perMToken: c.cachedWrite.perMToken,
      amount: c.cachedWrite.amount,
    },
    { label: 'audio', tokens: u.audioTokens, perMToken: c.audio.perMToken, amount: c.audio.amount },
  ];
});

const outputDims = computed<DimRow[]>(() => {
  const l = props.log;
  if (!l || (l.billingType !== 'per_token' && l.billingType !== 'unknown')) return [];
  const u = l.usage.output;
  const c = l.cost.output;
  return [
    { label: '主输出', tokens: u.tokens, perMToken: c.perMToken, amount: c.amount },
    {
      label: 'reasoning',
      tokens: u.reasoningTokens,
      perMToken: c.reasoning.perMToken,
      amount: c.reasoning.amount,
    },
    { label: 'audio', tokens: u.audioTokens, perMToken: c.audio.perMToken, amount: c.audio.amount },
  ];
});
</script>

<template>
  <el-drawer
    v-model="visible"
    :title="log ? '调用详情' : '调用详情'"
    direction="rtl"
    size="560px"
  >
    <div v-if="log" class="log-detail">
      <el-descriptions :column="2" border size="small" class="log-detail__summary">
        <el-descriptions-item label="日志编号" :span="2">
          <span class="mono log-id-muted">{{ log.id }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="TraceId" :span="2">
          <span class="mono log-id-muted">{{ log.traceId || '—' }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="状态">
          <StatusTag v-if="log.status === 'pending'" label="调用中" tone="warning" />
          <StatusTag v-else-if="log.status === 'success'" label="成功" tone="success" />
          <StatusTag
            v-else
            :label="log.content.error ? logErrorCodeText(log.content.error.code) : AiUsageStatusLabel[log.status]"
            tone="danger"
          />
        </el-descriptions-item>
        <el-descriptions-item label="耗时">
          <span v-if="log.content.latencyMs != null" class="num" :title="latencyHint">
            {{ log.content.latencyMs.toLocaleString() }} ms
          </span>
          <span v-else>—</span>
        </el-descriptions-item>
        <el-descriptions-item label="发生时间" :span="2">
          {{ formatDateTime(log.createAt, 'YYYY-MM-DD HH:mm:ss') }}
        </el-descriptions-item>
        <el-descriptions-item label="模型" :span="2">
          <div class="model-cell">
            <span class="mono">{{ log.modelName }}</span>
            <span v-if="log.vendorModel" class="model-cell__upstream mono">↳ 上游 {{ upstreamModelText }}</span>
          </div>
        </el-descriptions-item>
        <el-descriptions-item label="渠道">
          <div class="model-cell">
            <span>{{ vendorText }}</span>
            <span v-if="vendorKeySub" class="model-cell__upstream mono">{{ vendorKeySub }}</span>
          </div>
        </el-descriptions-item>
        <el-descriptions-item label="账户">
          <div class="account-cell">
            <span v-if="log.account.displayName" class="account-cell__name">{{ log.account.displayName }}</span>
            <span>{{ log.account.email || '—' }}</span>
            <span class="account-cell__sub">{{ log.account.phone || '—' }}</span>
          </div>
        </el-descriptions-item>
        <el-descriptions-item label="计费">
          {{ billingTypeText(log.billingType) }}
        </el-descriptions-item>
        <el-descriptions-item label="扣费">
          <span class="cost-total">{{ formatMoney(log.cost.total, { fractionDigits: BILLING_FRACTION_DIGITS }) }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="账户">
          <span class="mono">{{ log.account.uid }}</span>
        </el-descriptions-item>
      </el-descriptions>

      <el-divider />

      <h4 class="section-title">调用方</h4>
      <div class="log-detail__row">
        <span class="label">调用来源</span>
        <span>{{ sourceText }}</span>
      </div>
      <div v-if="log.token" class="log-detail__row">
        <span class="label">令牌 ID</span>
        <span class="mono">{{ log.token.id }}</span>
      </div>
      <div class="log-detail__row">
        <span class="label">IAM 用户</span>
        <span class="mono">{{ log.account.iamUid ?? '—' }}</span>
      </div>

      <el-divider />

      <!-- 后端 usage_logs.content jsonb 的逐字展开，含失败原因；HTTP 码只此一处。 -->
      <h4 class="section-title">请求上下文</h4>
      <div class="log-detail__row">
        <span class="label">协议</span>
        <span>{{ protocolText }}</span>
      </div>
      <div class="log-detail__row">
        <span class="label">流式</span>
        <el-tag v-if="log.content.streamed" size="small" type="success" effect="plain">是</el-tag>
        <el-tag v-else size="small" type="info" effect="plain">否</el-tag>
      </div>
      <div class="log-detail__row">
        <span class="label">会话</span>
        <span class="mono conv-id">{{ log.content.convId ?? '—' }}</span>
      </div>
      <div class="log-detail__row">
        <span class="label">HTTP 状态</span>
        <span class="num">{{ log.content.statusCode ?? '—' }}</span>
      </div>
      <div class="log-detail__row">
        <span class="label">请求 IP</span>
        <span class="mono">{{ clientIpText }}</span>
      </div>
      <template v-if="log.content.error">
        <div class="log-detail__row">
          <span class="label">错误码</span>
          <el-tag size="small" type="danger" effect="plain">
            {{ logErrorCodeText(log.content.error.code) }}
          </el-tag>
          <span class="error-code-raw mono">{{ log.content.error.code }}</span>
        </div>
        <div v-if="log.content.error.message" class="log-detail__row log-detail__row--col">
          <span class="label">错误摘要</span>
          <pre class="error-msg">{{ log.content.error.message }}</pre>
        </div>
      </template>

      <el-divider />

      <h4 class="section-title">计费明细</h4>

      <!-- ============ per_token / unknown ============ -->
      <!--
        unknown = 定价快照缺失（费率行被删 / 早于当前定价体系）。后端此时仍按 token 形
        下发 usage 与 cost，只是各维度单价全 0，所以复用同一块渲染，另加一行说明。
      -->
      <div v-if="log.billingType === 'unknown'" class="snapshot-hint snapshot-hint--warn">
        该调用未关联定价快照，单价明细不可用；总扣费取日志落库金额。
      </div>
      <template v-if="log.billingType === 'per_token' || log.billingType === 'unknown'">
        <div class="log-detail__row">
          <span class="label">总 tokens</span>
          <span class="num">{{ log.usage.totalTokens.toLocaleString() }}</span>
        </div>

        <!-- ── Input 分组 ── -->
        <el-divider class="sub-divider" />
        <div class="dim-group-title">
          <span class="dim-group-name">Input</span>
          <span class="dim-group-totals">
            {{ log.usage.input.tokens.toLocaleString() }} tokens ·
            {{ formatMoney(log.cost.input.amount, { fractionDigits: BILLING_FRACTION_DIGITS }) }}
          </span>
        </div>
        <div
          v-for="d in inputDims"
          :key="d.label"
          class="dim-row"
          :class="{ 'dim-row--zero': d.tokens === 0 && d.perMToken === 0 }"
        >
          <span class="dim-label">{{ d.label }}</span>
          <span class="dim-tokens">{{ d.tokens.toLocaleString() }} tok</span>
          <span class="dim-sep">×</span>
          <span class="dim-price">{{ formatMoney(d.perMToken, { fractionDigits: 2 }) }}/1M</span>
          <span class="dim-sep">=</span>
          <span class="dim-amount">{{ formatMoney(d.amount, { fractionDigits: BILLING_FRACTION_DIGITS }) }}</span>
        </div>

        <!-- ── Output 分组 ── -->
        <el-divider class="sub-divider" />
        <div class="dim-group-title">
          <span class="dim-group-name">Output</span>
          <span class="dim-group-totals">
            {{ log.usage.output.tokens.toLocaleString() }} tokens ·
            {{ formatMoney(log.cost.output.amount, { fractionDigits: BILLING_FRACTION_DIGITS }) }}
          </span>
        </div>
        <div
          v-for="d in outputDims"
          :key="d.label"
          class="dim-row"
          :class="{ 'dim-row--zero': d.tokens === 0 && d.perMToken === 0 }"
        >
          <span class="dim-label">{{ d.label }}</span>
          <span class="dim-tokens">{{ d.tokens.toLocaleString() }} tok</span>
          <span class="dim-sep">×</span>
          <span class="dim-price">{{ formatMoney(d.perMToken, { fractionDigits: 2 }) }}/1M</span>
          <span class="dim-sep">=</span>
          <span class="dim-amount">{{ formatMoney(d.amount, { fractionDigits: BILLING_FRACTION_DIGITS }) }}</span>
        </div>
      </template>

      <!-- ============ per_call ============ -->
      <template v-else-if="log.billingType === 'per_call'">
        <!-- 按次计费仍会消耗 token，展示但不参与扣费 -->
        <div class="snapshot-hint">Token 用量（仅观测，不计费）</div>
        <div class="log-detail__row">
          <span class="label">输入</span>
          <span class="num">{{ log.usage.input.tokens.toLocaleString() }} tok</span>
        </div>
        <div v-if="log.usage.input.cachedReadTokens > 0" class="log-detail__row">
          <span class="label">cached 读</span>
          <span class="num">{{ log.usage.input.cachedReadTokens.toLocaleString() }} tok</span>
        </div>
        <div v-if="log.usage.input.audioTokens > 0" class="log-detail__row">
          <span class="label">输入 audio</span>
          <span class="num">{{ log.usage.input.audioTokens.toLocaleString() }} tok</span>
        </div>
        <div class="log-detail__row">
          <span class="label">输出</span>
          <span class="num">{{ log.usage.output.tokens.toLocaleString() }} tok</span>
        </div>
        <div v-if="log.usage.output.reasoningTokens > 0" class="log-detail__row">
          <span class="label">reasoning</span>
          <span class="num">{{ log.usage.output.reasoningTokens.toLocaleString() }} tok</span>
        </div>

        <el-divider class="sub-divider" />
        <div class="snapshot-hint">调用时单价快照</div>
        <div class="log-detail__row">
          <span class="label">单次价</span>
          <span class="num">{{ formatMoney(log.cost.pricePerCall) }} / 次</span>
        </div>
        <div v-if="log.cost.cachedPricePerCall > 0" class="log-detail__row">
          <span class="label">缓存单价</span>
          <span class="num">{{ formatMoney(log.cost.cachedPricePerCall) }} / 次</span>
        </div>
      </template>

      <!-- ============ per_image ============ -->
      <template v-else-if="log.billingType === 'per_image'">
        <div class="log-detail__row">
          <span class="label">尺寸</span>
          <span class="mono">{{ log.usage.tier.size }}</span>
        </div>
        <div class="log-detail__row">
          <span class="label">质量</span>
          <span>{{ log.usage.tier.quality }}</span>
        </div>
        <div class="log-detail__row">
          <span class="label">图片数</span>
          <span class="num">{{ log.usage.count.toLocaleString() }}</span>
        </div>

        <el-divider class="sub-divider" />
        <div class="snapshot-hint">调用时单价快照（命中 tier）</div>
        <div class="log-detail__row">
          <span class="label">单价</span>
          <span class="num">{{ formatMoney(log.cost.pricePerImage) }} / 张</span>
        </div>
      </template>

      <!-- ============ per_video ============ -->
      <template v-else-if="log.billingType === 'per_video'">
        <div class="log-detail__row">
          <span class="label">分辨率</span>
          <span>{{ log.usage.tier.resolution }}</span>
        </div>
        <div class="log-detail__row">
          <span class="label">时长</span>
          <span class="num">{{ log.usage.seconds.toLocaleString() }} 秒</span>
        </div>

        <el-divider class="sub-divider" />
        <div class="snapshot-hint">调用时单价快照（命中 tier）</div>
        <div class="log-detail__row">
          <span class="label">单价</span>
          <span class="num">{{ formatMoney(log.cost.pricePerSecond) }} / 秒</span>
        </div>
      </template>

      <!-- ============ per_audio_minute ============ -->
      <template v-else-if="log.billingType === 'per_audio_minute'">
        <div class="log-detail__row">
          <span class="label">时长</span>
          <span class="num">{{ log.usage.minutes.toLocaleString() }} 分钟</span>
        </div>

        <el-divider class="sub-divider" />
        <div class="snapshot-hint">调用时单价快照</div>
        <div class="log-detail__row">
          <span class="label">单价</span>
          <span class="num">{{ formatMoney(log.cost.pricePerMinute) }} / 分钟</span>
        </div>
      </template>

      <!-- ============ per_character ============ -->
      <template v-else-if="log.billingType === 'per_character'">
        <div class="log-detail__row">
          <span class="label">字符数</span>
          <span class="num">{{ log.usage.characters.toLocaleString() }}</span>
        </div>

        <el-divider class="sub-divider" />
        <div class="snapshot-hint">调用时单价快照</div>
        <div class="log-detail__row">
          <span class="label">单价</span>
          <span class="num">{{ formatMoney(log.cost.pricePerKChar) }} / 1K 字符</span>
        </div>
      </template>

      <div class="log-detail__row">
        <span class="label">总扣费</span>
        <span
          class="cost-total"
          :class="{ 'cost-total--reversed': log.bill?.status === 'reversed' }"
        >
          {{ formatMoney(log.cost.total, { fractionDigits: BILLING_FRACTION_DIGITS }) }}
        </span>
        <el-tag
          v-if="log.bill?.status === 'reversed'"
          size="small"
          type="info"
          effect="plain"
        >
          已驳回 · 实际扣费 ¥0
        </el-tag>
      </div>

      <template v-if="log.bill">
        <el-divider />
        <h4 class="section-title">账单</h4>
        <div class="log-detail__row">
          <span class="label">账单 UID</span>
          <span class="mono">{{ log.bill.id }}</span>
        </div>
        <div class="log-detail__row">
          <span class="label">账单状态</span>
          <el-tag
            v-if="log.bill.status === 'reversed'"
            size="small"
            type="info"
            effect="plain"
          >已驳回</el-tag>
          <el-tag v-else size="small" type="success" effect="plain">已扣费</el-tag>
        </div>
        <template v-if="log.bill.status === 'reversed'">
          <div class="log-detail__row">
            <span class="label">驳回原因</span>
            <span>{{ billReverseCodeText(log.bill.reversal.code) }}</span>
          </div>
          <div class="log-detail__row">
            <span class="label">驳回时间</span>
            <span>{{ formatDateTime(log.bill.reversal.atUtc, 'YYYY-MM-DD HH:mm:ss') }}</span>
          </div>
          <div class="log-detail__row">
            <span class="label">操作人</span>
            <span class="mono">{{ log.bill.reversal.by ?? '—' }}</span>
          </div>
          <div v-if="log.bill.reversal.remark" class="log-detail__row log-detail__row--col">
            <span class="label">备注</span>
            <span class="reverse-remark">{{ log.bill.reversal.remark }}</span>
          </div>
        </template>
      </template>

    </div>

    <template #footer>
      <div v-if="log" class="drawer-footer">
        <el-button
          v-if="canReverse"
          type="danger"
          :icon="RefreshLeft"
          @click="onReverseClick"
        >
          驳回扣费
        </el-button>
        <el-tag v-else-if="log.bill?.status === 'reversed'" type="info" effect="plain">
          该账单已驳回
        </el-tag>
        <el-tag v-else-if="hasCharge" type="warning" effect="plain">
          已扣费，暂未关联钱包流水（请刷新；仍无则核对 Demux 与 Billing 同库）
        </el-tag>
        <el-tag v-else type="info" effect="plain">未扣费，无法驳回</el-tag>
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
.conv-id {
  word-break: break-all;
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
.cost-total {
  font-weight: 600;
  color: var(--el-color-warning);
}
.cost-total--reversed {
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
.snapshot-hint {
  font-size: 11.5px;
  color: var(--el-text-color-secondary);
  margin: 4px 0 2px;
}
.snapshot-hint--warn {
  color: var(--el-color-warning);
}
.error-code-raw {
  font-size: 11.5px;
  color: var(--el-text-color-placeholder);
}
.snapshot-zero {
  color: var(--el-text-color-placeholder);
}
/* 维度配对行（per_token 用量 × 单价 = 扣费） */
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
.dim-label {
  width: 96px;
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
  font-family: var(--el-font-family);
  font-size: 12.5px;
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
.section-title {
  margin: 6px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}
.http-status {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.provider-tag {
  font-size: 11.5px;
  padding: 1px 6px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
  color: var(--el-text-color-secondary);
}
.model-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.account-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.4;
}
.account-cell__name {
  font-weight: 500;
  color: var(--el-text-color-primary);
}
.account-cell__sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.model-cell__sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.model-cell__upstream {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.error-msg {
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
