<script setup lang="ts">
/**
 * 订单详情，版式同平台「账单详情」抽屉：摘要表在上，买卖双方、金额（售价、平台抽成、卖家所得、账单号）、
 * 卖家结算（含这一单记的收益流水）、失败原因分段往下，一行一项「标签 / 值」。版本不露，员工不看版本。
 */
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';

import StatusTag from '@/shared/ui/StatusTag.vue';
import { formatDateTime } from '@/shared/lib/date';

import {
  MarketItemKindLabel,
  MarketOrderSourceLabel,
  MarketOrderStageLabel,
  MarketOrderStageTone,
  SellerTxnKindLabel,
  type MarketOrderDetail,
} from '../../model/market.types';
import { formatPercent, formatPrice, formatYuan, itemPage } from '../../model/marketFormat';
import { getTavernMarketPort } from '../../services';
import AccountCell from '../content/AccountCell.vue';
import CopyableId from '../metering/CopyableId.vue';

const visible = defineModel<boolean>('visible', { required: true });
const props = defineProps<{ orderId: string | null }>();

const port = getTavernMarketPort();

const detail = ref<MarketOrderDetail | null>(null);
const loading = ref(false);

const order = computed(() => detail.value?.order ?? null);
const settlement = computed(() => detail.value?.settlement ?? null);
/** 卖家这一单有钱可分（免费的单、创作者那单没有）。 */
const sellerPaid = computed(() => (settlement.value?.sellerAmount ?? 0) > 0);

async function load(id: string): Promise<void> {
  loading.value = true;
  try {
    const r = await port.order(id);
    if (id !== props.orderId) return;
    if (r.success) detail.value = r.data;
    else ElMessage.error(r.error.message);
  } finally {
    loading.value = false;
  }
}

watch(
  () => [visible.value, props.orderId] as const,
  ([open, id]) => {
    if (!open || id == null) return;
    if (detail.value?.order.id !== id) detail.value = null;
    void load(id);
  },
  { immediate: true },
);
</script>

<template>
  <el-drawer
    v-model="visible"
    title="订单详情"
    direction="rtl"
    size="560px"
    append-to-body
  >
    <div
      v-loading="loading && !detail"
      class="order-detail"
    >
      <template v-if="detail && order">
        <el-descriptions
          :column="2"
          border
          size="small"
          class="order-detail__summary"
        >
          <el-descriptions-item
            label="订单号"
            :span="2"
          >
            <CopyableId
              :value="order.serialNo"
              label="订单号"
            />
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <StatusTag
              :label="MarketOrderStageLabel[order.stage]"
              :tone="MarketOrderStageTone[order.stage]"
            />
          </el-descriptions-item>
          <el-descriptions-item label="来源">
            {{ MarketOrderSourceLabel[order.source] }}
          </el-descriptions-item>
          <el-descriptions-item
            label="商品"
            :span="2"
          >
            <span class="item">
              <el-tag
                size="small"
                effect="plain"
                :type="order.item.kind === 'world_card' ? 'success' : 'primary'"
              >
                {{ MarketItemKindLabel[order.item.kind] }}
              </el-tag>
              <router-link
                :to="{ name: itemPage(order.item.kind), query: { itemId: order.item.id } }"
                class="link"
              >{{ order.item.name }}</router-link>
            </span>
          </el-descriptions-item>
          <el-descriptions-item label="下单时间">
            {{ formatDateTime(order.createdAt, 'YYYY-MM-DD HH:mm:ss') }}
          </el-descriptions-item>
          <el-descriptions-item label="更新时间">
            {{ formatDateTime(order.updatedAt, 'YYYY-MM-DD HH:mm:ss') }}
          </el-descriptions-item>
        </el-descriptions>

        <el-divider />

        <h4 class="section-title">
          买卖双方
        </h4>
        <div class="row">
          <span class="label">买家</span>
          <AccountCell :account="order.buyer" />
        </div>
        <div class="row">
          <span class="label">卖家</span>
          <AccountCell :account="order.seller" />
        </div>

        <el-divider />

        <h4 class="section-title">
          金额
        </h4>
        <div class="row">
          <span class="label">售价</span>
          <span class="num">{{ formatPrice(order.price) }}</span>
        </div>
        <template v-if="settlement">
          <div class="row">
            <span class="label">平台抽成</span>
            <span class="num">{{ formatYuan(settlement.platformAmount) }}</span>
            <span class="sub">{{ formatPercent(settlement.commissionRate) }}</span>
          </div>
          <div class="row">
            <span class="label">卖家所得</span>
            <span class="num total">{{ formatYuan(settlement.sellerAmount) }}</span>
          </div>
        </template>
        <div class="row">
          <span class="label">账单号</span>
          <span
            v-if="detail.billSerialNo"
            class="mono"
          >{{ detail.billSerialNo }}</span>
          <span
            v-else
            class="muted"
          >—</span>
        </div>

        <template v-if="settlement && sellerPaid">
          <el-divider />
          <h4 class="section-title">
            卖家结算
          </h4>
          <div class="row">
            <span class="label">预计结算</span>
            <span class="num">{{ settlement.settlesAt != null ? formatDateTime(settlement.settlesAt, 'YYYY-MM-DD HH:mm') : '—' }}</span>
          </div>
          <div class="row">
            <span class="label">结算时间</span>
            <span
              v-if="settlement.settledAt != null"
              class="num"
            >{{ formatDateTime(settlement.settledAt, 'YYYY-MM-DD HH:mm') }}</span>
            <span
              v-else
              class="muted"
            >—</span>
          </div>

          <el-table
            :data="detail.sellerTxns"
            row-key="id"
            size="small"
            class="compact-table txns"
            empty-text="暂无流水"
          >
            <el-table-column
              label="收益流水"
              width="90"
            >
              <template #default="{ row }: { row: MarketOrderDetail['sellerTxns'][number] }">
                {{ SellerTxnKindLabel[row.kind] }}
              </template>
            </el-table-column>
            <el-table-column
              label="金额"
              width="90"
              align="right"
            >
              <template #default="{ row }: { row: MarketOrderDetail['sellerTxns'][number] }">
                <span class="num">{{ formatYuan(row.amount) }}</span>
              </template>
            </el-table-column>
            <el-table-column
              label="可提现"
              width="90"
              align="right"
            >
              <template #default="{ row }: { row: MarketOrderDetail['sellerTxns'][number] }">
                <span class="num">{{ formatYuan(row.balanceAfter.available) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="时间">
              <template #default="{ row }: { row: MarketOrderDetail['sellerTxns'][number] }">
                <span class="cell-date">{{ formatDateTime(row.createdAt) }}</span>
              </template>
            </el-table-column>
          </el-table>
        </template>

        <template v-if="detail.failureReason">
          <el-divider />
          <h4 class="section-title">
            失败信息
          </h4>
          <div class="row">
            <span class="label">失败原因</span>
            <el-tag
              size="small"
              type="danger"
              effect="plain"
            >
              {{ detail.failureReason }}
            </el-tag>
          </div>
        </template>
      </template>
    </div>
  </el-drawer>
</template>

<style scoped>
.order-detail {
  min-height: 200px;
  font-size: 13px;
  line-height: 1.6;
}

.order-detail__summary :deep(.el-descriptions__label) {
  width: 84px;
}

.section-title {
  margin: 6px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
}

.label {
  flex-shrink: 0;
  width: 84px;
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
}

.mono,
.num {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
}

.total {
  font-weight: 600;
  color: var(--el-color-warning);
}

.sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.muted {
  color: var(--el-text-color-placeholder);
}

.item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.link {
  color: var(--el-color-primary);
  text-decoration: none;
}

.txns {
  margin-top: 8px;
}
</style>
