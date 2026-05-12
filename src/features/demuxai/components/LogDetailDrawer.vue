<script setup lang="ts">
/**
 * 单条调用日志详情抽屉（只读）。
 *
 * 注意：日志服务**不**返回 prompt/completion 原文（隐私 & 体积），
 * 这里能展示的只有 token 计数、扣费、链路标签、错误码。如果需要 debug，
 * 应跳转到外部抓样系统。
 */
import { computed } from 'vue';

import { formatDateTime } from '@/shared/lib/date';
import { formatMoney } from '@/shared/lib/money';
import StatusTag from '@/shared/ui/StatusTag.vue';

import { ApiTypeLabel, LogStatusLabel, LogStatusTone } from '../model/enums';
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

const slowFirstToken = computed(() => {
  const l = props.log;
  if (!l || l.firstTokenLatencyMs == null) return false;
  return l.firstTokenLatencyMs > 1500;
});

const modelDeleted = computed(() => props.log != null && props.modelDisplay == null);

const modelText = computed(() => {
  const l = props.log;
  if (!l) return '';
  if (props.modelDisplay != null) return props.modelDisplay;
  return `<已删除> ${l.modelId}`;
});

const providerText = computed(() => {
  const l = props.log;
  if (!l) return '';
  return props.providerName ?? l.providerUid;
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
        <StatusTag :label="LogStatusLabel[log.status]" :tone="LogStatusTone[log.status]" />
        <span class="http-status">HTTP {{ log.httpStatus }}</span>
      </div>

      <div class="log-detail__row">
        <span class="label">发生时间</span>
        <span>{{ formatDateTime(log.occurredAtUtc, 'YYYY-MM-DD HH:mm:ss') }}</span>
      </div>

      <el-divider />

      <h4 class="section-title">租户上下文</h4>
      <div class="log-detail__row">
        <span class="label">账户 UID</span>
        <span class="mono">{{ log.accountUid }}</span>
      </div>
      <div class="log-detail__row">
        <span class="label">IAM 用户</span>
        <span class="mono">{{ log.iamUserUid }}</span>
      </div>
      <div class="log-detail__row">
        <span class="label">LV 快照</span>
        <span>Lv{{ log.tierSnapshot }}</span>
      </div>
      <div class="log-detail__row">
        <span class="label">请求 IP</span>
        <span class="mono">{{ log.requestIp ?? '—' }}</span>
      </div>

      <el-divider />

      <h4 class="section-title">模型与渠道</h4>
      <div class="log-detail__row">
        <span class="label">对外 modelId</span>
        <span class="mono" :class="{ 'deleted-model': modelDeleted }">{{ modelText }}</span>
        <el-tag v-if="modelDeleted" size="small" type="info" effect="plain">已删除</el-tag>
      </div>
      <div class="log-detail__row">
        <span class="label">实际渠道</span>
        <span class="mono">{{ providerText }}</span>
        <span class="provider-tag">{{ ApiTypeLabel[log.apiType] }}</span>
      </div>
      <div class="log-detail__row">
        <span class="label">上游 model</span>
        <span class="mono">{{ log.providerModelId }}</span>
      </div>
      <div class="log-detail__row">
        <span class="label">流式</span>
        <el-tag v-if="log.streamed" size="small" type="success" effect="plain">是</el-tag>
        <el-tag v-else size="small" type="info" effect="plain">否</el-tag>
      </div>

      <el-divider />

      <h4 class="section-title">Token & 计费</h4>
      <div class="log-detail__row">
        <span class="label">输入 tokens</span>
        <span class="num">{{ log.promptTokens.toLocaleString() }}</span>
      </div>
      <div class="log-detail__row">
        <span class="label">输出 tokens</span>
        <span class="num">{{ log.completionTokens.toLocaleString() }}</span>
      </div>
      <div class="log-detail__row">
        <span class="label">总 tokens</span>
        <span class="num">{{ log.totalTokens.toLocaleString() }}</span>
      </div>
      <div class="log-detail__row">
        <span class="label">输入扣费</span>
        <span>{{ formatMoney(log.inputCost) }}</span>
      </div>
      <div class="log-detail__row">
        <span class="label">输出扣费</span>
        <span>{{ formatMoney(log.outputCost) }}</span>
      </div>
      <div class="log-detail__row">
        <span class="label">总扣费</span>
        <span class="cost-total">{{ formatMoney(log.totalCost) }}</span>
      </div>
      <div class="log-detail__row">
        <span class="label">倍率快照</span>
        <span>× {{ log.multiplierSnapshot }}</span>
      </div>

      <el-divider />

      <h4 class="section-title">性能</h4>
      <div class="log-detail__row">
        <span class="label">总耗时</span>
        <span class="num">{{ log.latencyMs.toLocaleString() }} ms</span>
      </div>
      <div class="log-detail__row">
        <span class="label">首 token</span>
        <span class="num">
          {{ log.firstTokenLatencyMs?.toLocaleString() ?? '—' }} ms
          <el-tag v-if="slowFirstToken" size="small" type="warning" effect="plain">慢</el-tag>
        </span>
      </div>

      <template v-if="log.errorCode || log.errorMessage">
        <el-divider />
        <h4 class="section-title">错误信息</h4>
        <div v-if="log.errorCode" class="log-detail__row">
          <span class="label">错误码</span>
          <el-tag size="small" type="danger" effect="plain">{{ log.errorCode }}</el-tag>
        </div>
        <div v-if="log.errorMessage" class="log-detail__row log-detail__row--col">
          <span class="label">错误摘要</span>
          <pre class="error-msg">{{ log.errorMessage }}</pre>
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
