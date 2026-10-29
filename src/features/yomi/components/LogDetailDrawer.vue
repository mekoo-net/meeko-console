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
 *  - `per_credit` → 积分 × 每积分单价，再附底下那次调用的原始用量（按 detailKind，仅观测）
 *  - 其它类型    → 按各自 usage 维度展示（图片张数 / 视频秒数 / 音频分钟 / 字符数 / 次数）
 *
 * 总 tokens 不展示：输入输出各组已有合计，再加一个混了缓存和推理的总数只会让人拿去乘单价。
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
  logHasErrorCode,
  logIsSuccess,
  logProtocolText,
  logStopReasonTruncated,
} from '@yomi/common';
import type { LogEntry } from '@yomi/common';
import {
  creditDetailRows,
  formatCredits,
  type CreditDetailRow,
} from '../model/creditUsage';

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

const logError = computed(() => props.log?.content.error);
const showLogError = computed(() => logHasErrorCode(logError.value));
const statusLabel = computed(() => {
  const l = props.log;
  if (!l) return '—';
  if (l.status === 'pending') return '调用中';
  if (l.status === 'success') return '成功';
  return showLogError.value ? logErrorCodeText(logError.value?.code) : AiUsageStatusLabel[l.status];
});

/** 终止原因按调用方协议原文展示（`MAX_TOKENS` 就显示 `MAX_TOKENS`），截断类另起警示色。 */
const stopReason = computed(() => props.log?.content.stopReason?.trim() || null);
const stopReasonTruncated = computed(() => logStopReasonTruncated(stopReason.value));

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
    { label: '输入', tokens: u.tokens, perMToken: c.perMToken, amount: c.amount },
    {
      label: '缓存写',
      tokens: u.cachedWriteTokens,
      perMToken: c.cachedWrite.perMToken,
      amount: c.cachedWrite.amount,
    },
    {
      label: '缓存读',
      tokens: u.cachedReadTokens,
      perMToken: c.cachedRead.perMToken,
      amount: c.cachedRead.amount,
    },
    { label: '语音输入', tokens: u.audioTokens, perMToken: c.audio.perMToken, amount: c.audio.amount },
  ];
});

const outputDims = computed<DimRow[]>(() => {
  const l = props.log;
  if (!l || (l.billingType !== 'per_token' && l.billingType !== 'unknown')) return [];
  const u = l.usage.output;
  const c = l.cost.output;
  return [
    { label: '输出', tokens: u.tokens, perMToken: c.perMToken, amount: c.amount },
    {
      label: '推理',
      tokens: u.reasoningTokens,
      perMToken: c.reasoning.perMToken,
      amount: c.reasoning.amount,
    },
    { label: '语音', tokens: u.audioTokens, perMToken: c.audio.perMToken, amount: c.audio.amount },
  ];
});

const creditRows = computed<CreditDetailRow[]>(() => {
  const l = props.log;
  return l?.billingType === 'per_credit' ? creditDetailRows(l.usage) : [];
});

/**
 * 积分计费底下那次对话调用的 token 用量：与按量同一套 Input / Output 分组和叫法，
 * 只是不带单价和扣费——钱按积分算，这些数不参与计费。生图等其它明细走 {@link creditRows}。
 */
interface CreditTokenGroup {
  name: string;
  tokens: number;
  dims: { label: string; tokens: number }[];
}

const creditTokenGroups = computed<CreditTokenGroup[] | null>(() => {
  const l = props.log;
  if (l?.billingType !== 'per_credit') return null;
  const u = l.usage;
  if ((u.detailKind !== 'token' && u.detailKind !== 'embedding') || !u.detail) return null;
  const d = u.detail;
  const groups: CreditTokenGroup[] = [
    {
      name: 'Input',
      tokens: d.input.tokens,
      dims: [
        { label: '输入', tokens: d.input.tokens },
        { label: '缓存写', tokens: d.input.cachedWriteTokens },
        { label: '缓存读', tokens: d.input.cachedReadTokens },
        { label: '语音输入', tokens: d.input.audioTokens },
      ],
    },
  ];
  // 向量化没有产出，Output 一组全是 0，不列。
  if (u.detailKind === 'token') {
    groups.push({
      name: 'Output',
      tokens: d.output.tokens,
      dims: [
        { label: '输出', tokens: d.output.tokens },
        { label: '推理', tokens: d.output.reasoningTokens },
        { label: '语音', tokens: d.output.audioTokens },
      ],
    });
  }
  return groups;
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
        <!-- 调用结果和上游 HTTP 码是同一件事的两面，放一格；响应（终止原因）紧挨着。 -->
        <el-descriptions-item label="状态">
          <div class="status-cell">
            <StatusTag v-if="log.status === 'pending'" label="调用中" tone="warning" />
            <StatusTag v-else-if="log.status === 'success'" label="成功" tone="success" />
            <StatusTag v-else :label="statusLabel" tone="danger" />
            <span v-if="log.content.statusCode != null" class="num status-cell__http">
              {{ log.content.statusCode }}
            </span>
          </div>
        </el-descriptions-item>
        <el-descriptions-item label="响应">
          <el-tag
            v-if="stopReason"
            size="small"
            :type="stopReasonTruncated ? 'warning' : 'info'"
            effect="plain"
            class="mono"
            :title="stopReasonTruncated ? '输出到了长度上限，被截断' : undefined"
          >
            {{ stopReason }}
          </el-tag>
          <span v-else>—</span>
        </el-descriptions-item>
        <el-descriptions-item label="发生时间">
          {{ formatDateTime(log.createAt, 'YYYY-MM-DD HH:mm:ss') }}
        </el-descriptions-item>
        <el-descriptions-item label="耗时">
          <span v-if="log.content.latencyMs != null" class="num" :title="latencyHint">
            {{ log.content.latencyMs.toLocaleString() }} ms
          </span>
          <span v-else>—</span>
        </el-descriptions-item>
        <el-descriptions-item label="模型" :span="2">
          <div class="model-cell">
            <span class="mono">{{ log.modelName }}</span>
            <span v-if="log.vendorModel" class="model-cell__upstream mono">↳ 上游 {{ upstreamModelText }}</span>
          </div>
        </el-descriptions-item>
        <el-descriptions-item label="渠道">
          {{ vendorText }}
        </el-descriptions-item>
        <el-descriptions-item label="账户">
          <div class="account-cell">
            <span class="mono">{{ log.account.uid }}</span>
            <span class="account-cell__sub">{{ log.account.email || '—' }}</span>
          </div>
        </el-descriptions-item>
        <el-descriptions-item label="计费">
          {{ billingTypeText(log.billingType) }}
        </el-descriptions-item>
        <el-descriptions-item label="扣费">
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
        </el-descriptions-item>
        <!-- 错误码的中文名已在「状态」标签上，这里只放原文；没有原文时退回原始错误码。 -->
        <el-descriptions-item v-if="showLogError" label="错误" :span="2">
          <pre class="error-msg">{{ logError?.message || logError?.code }}</pre>
        </el-descriptions-item>
      </el-descriptions>

      <el-divider />

      <h4 class="section-title">调用</h4>
      <div class="log-detail__row">
        <span class="label">来源</span>
        <span>{{ sourceText }}</span>
      </div>
      <div v-if="log.token" class="log-detail__row">
        <span class="label">令牌</span>
        <span class="mono">{{ log.token.id }}</span>
      </div>
      <div class="log-detail__row">
        <span class="label">IAM</span>
        <span class="mono">{{ log.account.iamUid ?? '—' }}</span>
      </div>

      <el-divider />

      <!-- 只放请求本身；状态、响应、错误这些回来的结果在上面的表格里。 -->
      <h4 class="section-title">请求</h4>
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
        <span class="label">请求 IP</span>
        <span class="mono">{{ clientIpText }}</span>
      </div>

      <el-divider />

      <h4 class="section-title">计费明细</h4>

      <!-- ============ per_token / unknown ============ -->
      <!--
        unknown = 定价快照缺失（费率行被删 / 早于当前定价体系）。后端此时仍按 token 形
        下发 usage 与 cost，只是各维度单价全 0，所以复用同一块渲染，另加一行说明。
      -->
      <div v-if="log.billingType === 'unknown'" class="snapshot-hint snapshot-hint--warn">
        该调用未关联定价快照，单价明细不可用；扣费取日志落库金额。
      </div>
      <template v-if="log.billingType === 'per_token' || log.billingType === 'unknown'">
        <!-- ── Input 分组 ── -->
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
          <span class="label">缓存读</span>
          <span class="num">{{ log.usage.input.cachedReadTokens.toLocaleString() }} tok</span>
        </div>
        <div v-if="log.usage.input.audioTokens > 0" class="log-detail__row">
          <span class="label">语音输入</span>
          <span class="num">{{ log.usage.input.audioTokens.toLocaleString() }} tok</span>
        </div>
        <div class="log-detail__row">
          <span class="label">输出</span>
          <span class="num">{{ log.usage.output.tokens.toLocaleString() }} tok</span>
        </div>
        <div v-if="log.usage.output.reasoningTokens > 0" class="log-detail__row">
          <span class="label">推理</span>
          <span class="num">{{ log.usage.output.reasoningTokens.toLocaleString() }} tok</span>
        </div>

        <!-- 按次有普通 / 缓存两个价，日志里看不出这次用的是哪个，所以只列价、不写成算式。 -->
        <el-divider class="sub-divider" />
        <div class="dim-group-title">
          <span class="dim-group-name">价格</span>
        </div>
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
        <el-divider class="sub-divider" />
        <div class="dim-group-title">
          <span class="dim-group-name">价格</span>
        </div>
        <div class="dim-row">
          <span class="dim-label">张数</span>
          <span class="dim-tokens">{{ log.usage.count.toLocaleString() }} 张</span>
          <span class="dim-sep">×</span>
          <span class="dim-price">{{ formatMoney(log.cost.pricePerImage) }}/张</span>
          <span class="dim-sep">=</span>
          <span class="dim-amount">{{ formatMoney(log.cost.total, { fractionDigits: BILLING_FRACTION_DIGITS }) }}</span>
        </div>
      </template>

      <!-- ============ per_video ============ -->
      <template v-else-if="log.billingType === 'per_video'">
        <div class="log-detail__row">
          <span class="label">分辨率</span>
          <span>{{ log.usage.tier.resolution }}</span>
        </div>
        <el-divider class="sub-divider" />
        <div class="dim-group-title">
          <span class="dim-group-name">价格</span>
        </div>
        <div class="dim-row">
          <span class="dim-label">时长</span>
          <span class="dim-tokens">{{ log.usage.seconds.toLocaleString() }} 秒</span>
          <span class="dim-sep">×</span>
          <span class="dim-price">{{ formatMoney(log.cost.pricePerSecond) }}/秒</span>
          <span class="dim-sep">=</span>
          <span class="dim-amount">{{ formatMoney(log.cost.total, { fractionDigits: BILLING_FRACTION_DIGITS }) }}</span>
        </div>
      </template>

      <!-- ============ per_audio_minute ============ -->
      <template v-else-if="log.billingType === 'per_audio_minute'">
        <div class="dim-group-title">
          <span class="dim-group-name">价格</span>
        </div>
        <div class="dim-row">
          <span class="dim-label">时长</span>
          <span class="dim-tokens">{{ log.usage.minutes.toLocaleString() }} 分钟</span>
          <span class="dim-sep">×</span>
          <span class="dim-price">{{ formatMoney(log.cost.pricePerMinute) }}/分钟</span>
          <span class="dim-sep">=</span>
          <span class="dim-amount">{{ formatMoney(log.cost.total, { fractionDigits: BILLING_FRACTION_DIGITS }) }}</span>
        </div>
      </template>

      <!-- ============ per_character ============ -->
      <template v-else-if="log.billingType === 'per_character'">
        <div class="dim-group-title">
          <span class="dim-group-name">价格</span>
        </div>
        <div class="dim-row">
          <span class="dim-label">字符</span>
          <span class="dim-tokens">{{ log.usage.characters.toLocaleString() }}</span>
          <span class="dim-sep">×</span>
          <span class="dim-price">{{ formatMoney(log.cost.pricePerKChar) }}/1K</span>
          <span class="dim-sep">=</span>
          <span class="dim-amount">{{ formatMoney(log.cost.total, { fractionDigits: BILLING_FRACTION_DIGITS }) }}</span>
        </div>
      </template>

      <!-- ============ per_credit ============ -->
      <template v-else-if="log.billingType === 'per_credit'">
        <!--
          与按量同一种写法：积分 × 单价 = 扣费。积分是上游报的实际值，可以是小数；pending 行预扣阶段为 0。
          每积分单价常不足一分钱，按计费精度展示，免得显示成 ¥0.00。
        -->
        <div class="dim-group-title">
          <span class="dim-group-name">价格</span>
        </div>
        <div class="dim-row">
          <span class="dim-label">积分</span>
          <span class="dim-tokens">{{ formatCredits(log.usage.credits) }}</span>
          <span class="dim-sep">×</span>
          <span class="dim-price">{{ formatMoney(log.cost.pricePerCredit, { fractionDigits: BILLING_FRACTION_DIGITS }) }}/积分</span>
          <span class="dim-sep">=</span>
          <span class="dim-amount">{{ formatMoney(log.cost.total, { fractionDigits: BILLING_FRACTION_DIGITS }) }}</span>
        </div>

        <!--
          底下那次调用的用量：对话按 Input / Output 分组，与按量同一套叫法，只是不带单价和扣费。
          没有单价那几列，一组就窄了，左输入右输出并排放，免得抽屉被拉得很长。
        -->
        <template v-if="creditTokenGroups">
          <el-divider class="sub-divider" />
          <div class="credit-usage-grid">
            <div
              v-for="g in creditTokenGroups"
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
        </template>
        <template v-else-if="creditRows.length">
          <el-divider class="sub-divider" />
          <div class="dim-group-title">
            <span class="dim-group-name">用量</span>
          </div>
          <div
            v-for="r in creditRows"
            :key="r.label"
            class="dim-row"
          >
            <span class="dim-label">{{ r.label }}</span>
            <span class="dim-tokens">{{ r.value }}</span>
          </div>
        </template>
      </template>

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
          已扣费，暂未关联钱包流水（请刷新；仍无则核对 Yomi 与 Billing 同库）
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
.status-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}
.status-cell__http {
  font-size: 12px;
  color: var(--el-text-color-secondary);
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
/* 积分计费下的对话用量：左 Input、右 Output 两列并排。 */
.credit-usage-grid {
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
