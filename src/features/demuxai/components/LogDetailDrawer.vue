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

import { formatDateTime } from '@/shared/lib/date';
import { formatMoney } from '@/shared/lib/money';
import StatusTag from '@/shared/ui/StatusTag.vue';

import { ApiTypeLabel, BillingTypeLabel, LogErrorCodeLabel } from '../model/enums';
import type { LogEntry } from '../model/log.types';

interface Props {
  modelValue: boolean;
  log: LogEntry | null;
  /** 由父组件查 Provider 表得到的显示名；查不到时回退到 uid */
  providerName?: string;
  /** 由父组件查 Model 表得到的显示名；查不到 = 该模型已被自动删除 */
  modelDisplay?: string | null;
}

const props = defineProps<Props>();
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>();

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

/**
 * 延迟"慢"判定阈值随 streamed 切换：
 *  - 流式 (TTFT) > 1500ms 即视为慢
 *  - 非流式 (总耗时) > 5000ms 才视为慢（因为包含完整生成时间）
 */
const slowLatency = computed(() => {
  const l = props.log;
  if (!l || l.tokenLatency == null) return false;
  return l.streamed ? l.tokenLatency > 1500 : l.tokenLatency > 5000;
});

const latencyLabel = computed(() => (props.log?.streamed ? '首字延迟' : '总耗时'));

function errorCodeText(code: string): string {
  return (LogErrorCodeLabel as Record<string, string>)[code] ?? code;
}

const modelDeleted = computed(() => props.log != null && props.modelDisplay == null);

const modelText = computed(() => {
  const l = props.log;
  if (!l) return '';
  if (props.modelDisplay != null) return props.modelDisplay;
  return `<已删除> ${l.modelName}`;
});

const providerText = computed(() => {
  const l = props.log;
  if (!l) return '';
  return props.providerName ?? `#${l.providerId}`;
});

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
  if (!l || l.billingType !== 'per_token') return [];
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
      label: 'cached 写 5m',
      tokens: u.cachedWrite5mTokens,
      perMToken: c.cachedWrite5m.perMToken,
      amount: c.cachedWrite5m.amount,
    },
    {
      label: 'cached 写 1h',
      tokens: u.cachedWrite1hTokens,
      perMToken: c.cachedWrite1h.perMToken,
      amount: c.cachedWrite1h.amount,
    },
    { label: 'audio', tokens: u.audioTokens, perMToken: c.audio.perMToken, amount: c.audio.amount },
  ];
});

const outputDims = computed<DimRow[]>(() => {
  const l = props.log;
  if (!l || l.billingType !== 'per_token') return [];
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
    :title="log ? `调用详情 · ${log.uid}` : '调用详情'"
    direction="rtl"
    size="520px"
  >
    <div v-if="log" class="log-detail">
      <div class="log-detail__row">
        <span class="label">状态</span>
        <StatusTag
          v-if="log.success"
          label="成功"
          tone="success"
        />
        <StatusTag
          v-else
          :label="log.error ? errorCodeText(log.error.code) : '失败'"
          tone="danger"
        />
        <span v-if="log.error" class="http-status">HTTP {{ log.error.httpStatus || '—' }}</span>
      </div>

      <div class="log-detail__row">
        <span class="label">发生时间</span>
        <span>{{ formatDateTime(log.createAt, 'YYYY-MM-DD HH:mm:ss') }}</span>
      </div>

      <el-divider />

      <h4 class="section-title">租户上下文</h4>
      <div class="log-detail__row">
        <span class="label">账户 UID</span>
        <span class="mono">{{ log.account.uid }}</span>
      </div>
      <div class="log-detail__row">
        <span class="label">IAM 用户</span>
        <span class="mono">{{ log.account.iamId }}</span>
      </div>
      <div class="log-detail__row">
        <span class="label">LV 快照</span>
        <span>Lv{{ log.cost.tierSnapshot }}</span>
      </div>
      <div class="log-detail__row">
        <span class="label">会话 ID</span>
        <span class="mono">{{ log.convId }}</span>
      </div>
      <div class="log-detail__row">
        <span class="label">请求 IP</span>
        <span class="mono">{{ log.requestIp ?? '—' }}</span>
      </div>

      <el-divider />

      <h4 class="section-title">模型与渠道</h4>
      <div class="log-detail__row">
        <span class="label">模型名</span>
        <span class="mono" :class="{ 'deleted-model': modelDeleted }">{{ modelText }}</span>
        <el-tag v-if="modelDeleted" size="small" type="info" effect="plain">已删除</el-tag>
      </div>
      <div class="log-detail__row">
        <span class="label">实际渠道</span>
        <span class="mono">{{ providerText }}</span>
        <span class="provider-tag">#{{ log.providerId }}</span>
        <span class="provider-tag">{{ ApiTypeLabel[log.apiType] }}</span>
      </div>
      <div class="log-detail__row">
        <span class="label">计费类型</span>
        <el-tag size="small" type="primary" effect="plain" round>
          {{ BillingTypeLabel[log.billingType] }}
        </el-tag>
      </div>
      <div class="log-detail__row">
        <span class="label">流式</span>
        <el-tag v-if="log.streamed" size="small" type="success" effect="plain">是</el-tag>
        <el-tag v-else size="small" type="info" effect="plain">否</el-tag>
      </div>

      <el-divider />

      <h4 class="section-title">用量 & 计费</h4>

      <!-- ============ per_token ============ -->
      <template v-if="log.billingType === 'per_token'">
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
            {{ formatMoney(log.cost.input.amount) }}
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
          <span class="dim-amount">{{ formatMoney(d.amount) }}</span>
        </div>

        <!-- ── Output 分组 ── -->
        <el-divider class="sub-divider" />
        <div class="dim-group-title">
          <span class="dim-group-name">Output</span>
          <span class="dim-group-totals">
            {{ log.usage.output.tokens.toLocaleString() }} tokens ·
            {{ formatMoney(log.cost.output.amount) }}
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
          <span class="dim-amount">{{ formatMoney(d.amount) }}</span>
        </div>
      </template>

      <!-- ============ per_call ============ -->
      <template v-else-if="log.billingType === 'per_call'">
        <div class="log-detail__row">
          <span class="label">调用次数</span>
          <span class="num">{{ log.usage.calls.toLocaleString() }}</span>
        </div>

        <el-divider class="sub-divider" />
        <div class="snapshot-hint">调用时单价快照</div>
        <div class="log-detail__row">
          <span class="label">单次价</span>
          <span class="num">{{ formatMoney(log.cost.pricePerCall) }} / 次</span>
        </div>
        <div class="log-detail__row">
          <span class="label">缓存单价</span>
          <span class="num" :class="{ 'snapshot-zero': log.cost.cachedPricePerCall === 0 }">
            {{ formatMoney(log.cost.cachedPricePerCall) }} / 次
          </span>
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
        <span class="cost-total">{{ formatMoney(log.cost.total) }}</span>
      </div>
      <div class="log-detail__row">
        <span class="label">倍率快照</span>
        <span>× {{ log.cost.multiplierSnapshot }}</span>
      </div>

      <el-divider />

      <h4 class="section-title">性能</h4>
      <div class="log-detail__row">
        <span class="label">{{ latencyLabel }}</span>
        <span class="num">
          {{ log.tokenLatency?.toLocaleString() ?? '—' }}<span v-if="log.tokenLatency != null"> ms</span>
          <el-tag v-if="slowLatency" size="small" type="warning" effect="plain">慢</el-tag>
        </span>
      </div>

      <template v-if="log.error">
        <el-divider />
        <h4 class="section-title">错误信息</h4>
        <div class="log-detail__row">
          <span class="label">错误码</span>
          <el-tag size="small" type="danger" effect="plain">{{ log.error.code }}</el-tag>
        </div>
        <div class="log-detail__row">
          <span class="label">HTTP 状态</span>
          <span class="num">{{ log.error.httpStatus || '—' }}</span>
        </div>
        <div class="log-detail__row log-detail__row--col">
          <span class="label">错误摘要</span>
          <pre class="error-msg">{{ log.error.message }}</pre>
        </div>
      </template>
    </div>
  </el-drawer>
</template>

<style scoped>
.log-detail {
  font-size: 13px;
  line-height: 1.6;
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
.sub-divider {
  margin: 8px 0;
}
.snapshot-hint {
  font-size: 11.5px;
  color: var(--el-text-color-secondary);
  margin: 4px 0 2px;
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
.deleted-model {
  color: var(--el-text-color-secondary);
  text-decoration: line-through;
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
