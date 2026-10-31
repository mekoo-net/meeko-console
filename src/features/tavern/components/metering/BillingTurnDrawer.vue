<script setup lang="ts">
/**
 * 计费回合详情：每条用量按现行价目的报价，以及这个回合里的每次上游调用。
 * 列表行不带报价，抽屉按 id 自己拉，所以从调用日志带 `?id=` 跳进来也能直接打开。
 */
import { ref, watch } from 'vue';
import { ElMessage } from 'element-plus';

import { AiUsageStatusLabel } from '@yomi/common';
import StatusTag from '@/shared/ui/StatusTag.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import { formatDateTime } from '@/shared/lib/date';

import {
  CallStatusTone,
  CountedUnitLabel,
  TurnStatusLabel,
  TurnStatusTone,
  UsageKindLabel,
  type CallLog,
  type UsageLine,
  type UsageLogDetail,
} from '../../model/metering.types';
import { formatCny, formatDuration, formatTokens, formatUsage } from '../../model/meteringFormat';
import { perMillionFromPerToken } from '../../model/pricingPreview';
import { getTavernBillingPort } from '../../services';
import CopyableId from './CopyableId.vue';

const visible = defineModel<boolean>('visible', { required: true });
const props = defineProps<{ usageLogId: number | null }>();

const port = getTavernBillingPort();
const detail = ref<UsageLogDetail | null>(null);
const loading = ref(false);
const loadError = ref<string | null>(null);
let seq = 0;

async function load(id: number): Promise<void> {
  const mine = ++seq;
  loading.value = true;
  loadError.value = null;
  try {
    const r = await port.get(id);
    if (mine !== seq) return;
    if (r.success) {
      detail.value = r.data;
    } else {
      detail.value = null;
      loadError.value = r.error.message;
      ElMessage.error(r.error.message);
    }
  } finally {
    if (mine === seq) loading.value = false;
  }
}

// 每次打开都重拉：「按现行价目」随价目变。id 变成 null（抽屉正在收起）时保留旧内容，免得收起动画里闪成空白。
watch(
  () => [props.usageLogId, visible.value] as const,
  ([id, open]) => {
    if (open && id != null) void load(id);
  },
  { immediate: true },
);

function baselineText({ usage, quote }: UsageLine): string {
  switch (usage.unit) {
    case 'token':
      return `${formatCny(perMillionFromPerToken(quote.baseline))}/百万`;
    default:
      return `${formatCny(quote.baseline)}/${CountedUnitLabel[usage.unit]}`;
  }
}

function modelText({ usage }: UsageLine): string {
  return usage.vendorKey ? `${usage.vendorKey}/${usage.modelName}` : usage.modelName;
}
</script>

<template>
  <el-drawer
    v-model="visible"
    title="计费回合"
    size="760px"
    append-to-body
  >
    <div
      v-loading="loading"
      class="turn-detail"
    >
      <EmptyState
        v-if="!detail && loadError"
        title="加载失败"
        :description="loadError"
      />

      <template v-if="detail">
        <div class="turn-detail__head">
          <StatusTag
            :label="TurnStatusLabel[detail.turn.status]"
            :tone="TurnStatusTone[detail.turn.status]"
          />
          <el-tag
            v-if="detail.turn.proactive"
            size="small"
            type="warning"
            effect="plain"
          >
            自主
          </el-tag>
          <span class="mono turn-detail__id">#{{ detail.turn.id }}</span>
        </div>

        <el-descriptions
          :column="2"
          size="small"
          border
        >
          <el-descriptions-item label="时间">
            {{ formatDateTime(detail.turn.createdAt, 'YYYY-MM-DD HH:mm:ss') }}
          </el-descriptions-item>
          <el-descriptions-item label="账号">
            <router-link
              :to="`/accounts/${detail.turn.accountUid}`"
              class="mono turn-detail__link"
            >
              {{ detail.turn.accountUid }}
            </router-link>
          </el-descriptions-item>
          <el-descriptions-item label="会话">
            <CopyableId
              :value="detail.turn.sessionId"
              label="会话 ID"
            />
          </el-descriptions-item>
          <el-descriptions-item label="账单号">
            <CopyableId
              :value="detail.turn.billSerialNo"
              label="账单号"
            />
          </el-descriptions-item>
          <el-descriptions-item
            label="TraceId"
            :span="2"
          >
            <CopyableId
              :value="detail.turn.traceId"
              label="TraceId"
            />
          </el-descriptions-item>
        </el-descriptions>

        <section class="turn-detail__amount">
          <template v-if="detail.turn.status === 'charged'">
            <div class="turn-detail__figure">
              <span class="turn-detail__figure-label">实扣</span>
              <strong class="turn-detail__figure-value num">{{ formatCny(detail.turn.amount) }}</strong>
            </div>
            <div class="turn-detail__figure">
              <span class="turn-detail__figure-label">按现行价目</span>
              <span class="turn-detail__figure-value turn-detail__figure-value--sub num">
                {{ formatCny(detail.amountAtCurrentPricing) }}
              </span>
            </div>
          </template>
          <template v-else>
            <div class="turn-detail__figure">
              <span class="turn-detail__figure-label">金额</span>
              <strong class="turn-detail__figure-value num">{{ formatCny(0) }}</strong>
              <span class="sub">未收费</span>
            </div>
            <div class="turn-detail__figure">
              <span class="turn-detail__figure-label">若收费按现行价目约</span>
              <span class="turn-detail__figure-value turn-detail__figure-value--sub num">
                {{ formatCny(detail.amountAtCurrentPricing) }}
              </span>
            </div>
          </template>
        </section>

        <el-alert
          v-if="detail.repriced"
          type="warning"
          show-icon
          :closable="false"
          title="价目在扣费后改过"
          description="实扣按扣费当时的价目，不追溯；「按现行价目」是用现在的价目重算的。"
        />

        <h4 class="turn-detail__title">
          用量报价
          <span class="sub">按现行价目：计价用量 × 倍率 × 基线</span>
        </h4>
        <el-table
          :data="detail.lines"
          size="small"
          border
          :empty-text="'无用量'"
        >
          <el-table-column
            label="模型"
            min-width="200"
          >
            <template #default="{ row }: { row: UsageLine }">
              <span class="mono">{{ modelText(row) }}</span>
            </template>
          </el-table-column>
          <el-table-column
            label="类型"
            width="84"
          >
            <template #default="{ row }: { row: UsageLine }">
              {{ UsageKindLabel[row.usage.kind] ?? row.usage.kind }}
            </template>
          </el-table-column>
          <el-table-column
            label="用量"
            min-width="150"
          >
            <template #default="{ row }: { row: UsageLine }">
              <span class="num">{{ formatUsage(row.usage) }}</span>
            </template>
          </el-table-column>
          <el-table-column
            label="倍率"
            width="64"
            align="right"
          >
            <template #default="{ row }: { row: UsageLine }">
              <span class="num">×{{ row.quote.multiplier }}</span>
            </template>
          </el-table-column>
          <el-table-column
            label="基线"
            width="110"
            align="right"
          >
            <template #default="{ row }: { row: UsageLine }">
              <span class="num">{{ baselineText(row) }}</span>
            </template>
          </el-table-column>
          <el-table-column
            label="计价用量"
            width="96"
            align="right"
          >
            <template #default="{ row }: { row: UsageLine }">
              <span class="num">{{ row.quote.billableQuantity.toLocaleString() }}</span>
            </template>
          </el-table-column>
          <el-table-column
            label="金额"
            width="100"
            align="right"
          >
            <template #default="{ row }: { row: UsageLine }">
              <span class="num">{{ formatCny(row.quote.amount) }}</span>
            </template>
          </el-table-column>
        </el-table>
        <p
          v-if="detail.turn.proactive"
          class="turn-detail__note"
        >
          自主唤醒回合：按现行价目的合计已乘自主倍率。
        </p>

        <h4 class="turn-detail__title">
          上游调用
          <span class="sub">{{ detail.calls.length }} 次<template v-if="detail.calls.length > 1">（含工具轮次）</template></span>
        </h4>
        <el-table
          :data="detail.calls"
          size="small"
          border
          :empty-text="'没有关联的调用记录'"
        >
          <el-table-column
            label="时间"
            width="84"
          >
            <template #default="{ row }: { row: CallLog }">
              <span class="mono">{{ formatDateTime(row.createdAt, 'HH:mm:ss') }}</span>
            </template>
          </el-table-column>
          <el-table-column
            label="管线"
            width="96"
          >
            <template #default="{ row }: { row: CallLog }">
              {{ row.pipeline.label }}
            </template>
          </el-table-column>
          <el-table-column
            label="模型"
            min-width="180"
          >
            <template #default="{ row }: { row: CallLog }">
              <span class="mono">{{ row.vendorKey }}/{{ row.modelName }}</span>
            </template>
          </el-table-column>
          <el-table-column
            label="Tokens"
            width="120"
          >
            <template #default="{ row }: { row: CallLog }">
              <span
                class="mono"
                :title="`输入 ${row.usage.input.tokens.toLocaleString()} · 输出 ${row.usage.output.tokens.toLocaleString()}`"
              >▲{{ formatTokens(row.usage.input.tokens) }} ▼{{ formatTokens(row.usage.output.tokens) }}</span>
            </template>
          </el-table-column>
          <el-table-column
            label="工具"
            width="52"
            align="right"
          >
            <template #default="{ row }: { row: CallLog }">
              <span class="num">{{ row.content.toolCalls || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column
            label="耗时"
            width="76"
            align="right"
          >
            <template #default="{ row }: { row: CallLog }">
              <span class="num">{{ formatDuration(row.content.durationMs) }}</span>
            </template>
          </el-table-column>
          <el-table-column
            label="状态"
            width="84"
            align="center"
          >
            <template #default="{ row }: { row: CallLog }">
              <el-tag
                size="small"
                :type="CallStatusTone[row.status]"
                :title="row.content.error?.message ?? undefined"
              >
                {{ AiUsageStatusLabel[row.status] }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
      </template>
    </div>
  </el-drawer>
</template>

<style scoped>
.turn-detail {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 200px;
}

.turn-detail__head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.turn-detail__id {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.turn-detail__link {
  color: var(--el-color-primary);
  text-decoration: none;
}

.turn-detail__amount {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.turn-detail__figure {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 180px;
  padding: 10px 14px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}

.turn-detail__figure-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.turn-detail__figure-value {
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.turn-detail__figure-value--sub {
  font-weight: 500;
  color: var(--el-text-color-regular);
}

.turn-detail__title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 8px 0 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.turn-detail__note {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
}

.num {
  font-variant-numeric: tabular-nums;
}

.sub {
  font-size: 12px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
}
</style>
