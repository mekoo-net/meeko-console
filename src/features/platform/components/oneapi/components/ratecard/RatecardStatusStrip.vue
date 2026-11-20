<script setup lang="ts">
/**
 * 牌价从这一页到各产品要过的三段，一行说完：
 * 发布（号池后台把改动发到 NATS，结果在每次写操作的回包里）→ 转发（平台收到没有）→ 通知（平台最近一次通知各产品成没成）。
 * 细节（指纹、报错原文、时间）放在悬停里，不占地方。
 */
import { computed } from 'vue';
import { Refresh } from '@element-plus/icons-vue';

import { formatDateTime } from '@/shared/lib/date';

import { describePublish, relaySummary } from '../../model/ratecard';
import type {
  PricePublishResult,
  RatecardRelayStatus,
  RatecardRelaySubscriber,
} from '../../model/ratecard.types';

export interface LastPublish {
  atUtc: number;
  result: PricePublishResult;
}

const props = defineProps<{
  /** 这次打开页面以来最近一次发布的结果；还没改过东西是 null，这一段不显示。 */
  lastPublish: LastPublish | null;
  relay: RatecardRelayStatus | null;
  /** 没读到转发状态时的报错。 */
  relayError: string | null;
  loading: boolean;
}>();

defineEmits<{ (e: 'refresh'): void }>();

const TIME = 'MM-DD HH:mm:ss';

const relayText = computed(() => relaySummary(props.relay, props.relayError));

function subscriberTip(s: RatecardRelaySubscriber): string {
  const at = s.notifiedAtUtc === null ? '' : formatDateTime(s.notifiedAtUtc, TIME);
  return [s.ok ? '已通知' : s.error || '没通知到', at].filter(Boolean).join(' · ');
}
</script>

<template>
  <div class="status-strip">
    <span
      v-if="lastPublish"
      class="seg"
    >
      <span class="seg__k">发布</span>
      <el-tag
        size="small"
        effect="plain"
        :type="lastPublish.result.ok ? 'success' : 'danger'"
      >
        {{ describePublish(lastPublish.result) }}
      </el-tag>
      <span class="seg__t">{{ formatDateTime(lastPublish.atUtc, TIME) }}</span>
    </span>

    <span class="seg">
      <span class="seg__k">转发</span>
      <el-tooltip
        :content="relayText.tip"
        :disabled="!relayText.tip"
        placement="top"
      >
        <el-tag
          size="small"
          effect="plain"
          :type="relayText.tone"
        >
          {{ relayText.text }}
        </el-tag>
      </el-tooltip>
      <span
        v-if="relay?.receivedAtUtc"
        class="seg__t"
      >{{ formatDateTime(relay.receivedAtUtc, TIME) }}</span>
    </span>

    <span
      v-if="relay && relay.subscribers.length > 0"
      class="seg"
    >
      <span class="seg__k">通知</span>
      <el-tooltip
        v-for="s in relay.subscribers"
        :key="s.service"
        :content="subscriberTip(s)"
        placement="top"
      >
        <el-tag
          size="small"
          effect="plain"
          :type="s.ok ? 'success' : 'danger'"
        >
          {{ s.service }}
        </el-tag>
      </el-tooltip>
    </span>

    <el-button
      class="status-strip__refresh"
      link
      :icon="Refresh"
      :loading="loading"
      title="刷新"
      @click="$emit('refresh')"
    />
  </div>
</template>

<style scoped>
.status-strip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 20px;
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
}
.seg {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.seg__k {
  color: var(--el-text-color-secondary);
}
.seg__t {
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-placeholder);
}
.status-strip__refresh {
  margin-left: -8px;
}
</style>
