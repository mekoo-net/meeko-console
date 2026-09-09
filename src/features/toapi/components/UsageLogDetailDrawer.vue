<script setup lang="ts">
/**
 * 单条调用日志详情（只读）。不含 prompt / completion 原文，只有占用单上的用量、金额、上下文。
 */
import { computed } from 'vue';

import { AiUsageStatusLabel, billingTypeText, logErrorCodeText, logProtocolText } from '@demux/common';
import StatusTag from '@/shared/ui/StatusTag.vue';
import { formatDateTime } from '@/shared/lib/date';
import { BILLING_FRACTION_DIGITS, formatMoney } from '@/shared/lib/money';

import ChannelTag from './ChannelTag.vue';
import { TokenKindLabel, type UsageLog } from '../model/usage.types';

const visible = defineModel<boolean>('visible', { required: true });
const props = defineProps<{ log: UsageLog | null }>();

const statusTone = computed<'success' | 'warning' | 'danger' | 'info'>(() => {
  switch (props.log?.status) {
    case 'success': return 'success';
    case 'pending': return 'warning';
    case 'failure': return 'danger';
    default: return 'info';
  }
});
const latencyHint = computed(() => (props.log?.content.streamed ? '首字延迟（TTFT）' : '端到端总耗时'));
const tokenText = computed(() => {
  const t = props.log?.token;
  if (!t) return '—';
  return `${TokenKindLabel[t.kind]} · ${t.name?.trim() || `#${t.id}`}`;
});

interface Row {
  label: string;
  value: string;
}
const tokenRows = computed<Row[]>(() => {
  const l = props.log;
  if (!l || (l.billingType !== 'per_token' && l.billingType !== 'unknown')) return [];
  const u = l.usage;
  return [
    { label: '输入', value: u.input.tokens.toLocaleString() },
    { label: '缓存读', value: u.input.cachedReadTokens.toLocaleString() },
    { label: '缓存写', value: u.input.cachedWriteTokens.toLocaleString() },
    { label: '输出', value: u.output.tokens.toLocaleString() },
    { label: '推理', value: u.output.reasoningTokens.toLocaleString() },
    { label: '合计', value: u.totalTokens.toLocaleString() },
  ];
});
</script>

<template>
  <el-drawer
    v-model="visible"
    title="调用详情"
    size="560px"
    append-to-body
  >
    <template v-if="log">
      <section class="sec">
        <div class="sec__head">
          <StatusTag
            :label="AiUsageStatusLabel[log.status]"
            :tone="statusTone"
          />
          <span class="mono sec__trace">{{ log.traceId }}</span>
        </div>
        <el-descriptions
          :column="2"
          size="small"
          border
        >
          <el-descriptions-item label="日志编号">
            <span class="mono">{{ log.id }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="发起时间">
            {{ formatDateTime(log.createAt, 'YYYY-MM-DD HH:mm:ss') }}
          </el-descriptions-item>
          <el-descriptions-item label="供应商">
            <ChannelTag :vendor-key="log.vendorKey" /> <span class="mono sub">{{ log.vendorKey }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="模型">
            <span class="mono">{{ log.modelName }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="账户">
            <span class="mono">{{ log.account.uid }}</span>
            <span
              v-if="log.account.email"
              class="sub"
            > · {{ log.account.email }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="调用方">
            {{ tokenText }}
          </el-descriptions-item>
          <el-descriptions-item label="协议">
            {{ logProtocolText(log.content.protocol) }}<span
              v-if="log.content.streamed"
              class="sub"
            > · 流式</span>
          </el-descriptions-item>
          <el-descriptions-item label="来源 IP">
            <span class="mono">{{ log.content.clientIp ?? '—' }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="上游响应码">
            {{ log.content.statusCode ?? '—' }}
          </el-descriptions-item>
          <el-descriptions-item :label="latencyHint">
            {{ log.content.latencyMs != null ? `${log.content.latencyMs.toLocaleString()} ms` : '—' }}
          </el-descriptions-item>
        </el-descriptions>
      </section>

      <section
        v-if="log.content.error"
        class="sec"
      >
        <el-alert
          type="error"
          show-icon
          :closable="false"
          :title="logErrorCodeText(log.content.error.code)"
          :description="log.content.error.message ?? undefined"
        />
      </section>

      <section class="sec">
        <h4 class="sec__title">
          金额（CNY）
        </h4>
        <el-descriptions
          :column="2"
          size="small"
          border
        >
          <el-descriptions-item label="预扣">
            {{ formatMoney(log.cost.estimated, { fractionDigits: BILLING_FRACTION_DIGITS }) }}
          </el-descriptions-item>
          <el-descriptions-item label="实扣">
            <strong>{{ formatMoney(log.cost.total, { fractionDigits: BILLING_FRACTION_DIGITS }) }}</strong>
          </el-descriptions-item>
        </el-descriptions>
      </section>

      <section class="sec">
        <h4 class="sec__title">
          用量
          <el-tag
            size="small"
            effect="plain"
            round
            :type="log.billingType === 'unknown' ? 'warning' : 'info'"
          >
            {{ billingTypeText(log.billingType) }}
          </el-tag>
        </h4>
        <el-descriptions
          v-if="tokenRows.length"
          :column="3"
          size="small"
          border
        >
          <el-descriptions-item
            v-for="r in tokenRows"
            :key="r.label"
            :label="r.label"
          >
            <span class="num">{{ r.value }}</span>
          </el-descriptions-item>
        </el-descriptions>
        <el-descriptions
          v-else-if="log.billingType === 'per_image'"
          :column="2"
          size="small"
          border
        >
          <el-descriptions-item label="张数">
            {{ log.usage.count }}
          </el-descriptions-item>
          <el-descriptions-item label="档位">
            {{ log.usage.tier.size }} / {{ log.usage.tier.quality }}
          </el-descriptions-item>
        </el-descriptions>
        <el-descriptions
          v-else-if="log.billingType === 'per_video'"
          :column="2"
          size="small"
          border
        >
          <el-descriptions-item label="秒数">
            {{ log.usage.seconds }}
          </el-descriptions-item>
          <el-descriptions-item label="分辨率">
            {{ log.usage.tier.resolution }}
          </el-descriptions-item>
        </el-descriptions>
      </section>
    </template>
  </el-drawer>
</template>

<style scoped>
.sec {
  margin-bottom: 20px;
}
.sec__head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.sec__trace {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  word-break: break-all;
}
.sec__title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
}
.mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}
.num {
  font-variant-numeric: tabular-nums;
}
.sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
