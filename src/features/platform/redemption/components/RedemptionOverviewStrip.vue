<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowRight } from '@element-plus/icons-vue';

import { formatMoney } from '@/shared/lib/money';

import type { RedemptionOverview } from '../model/redemption.types';

const props = defineProps<{ overview: RedemptionOverview | null }>();

const router = useRouter();

const money = (v: number | undefined) => formatMoney(v ?? 0, { currency: 'CNY' });

const redeemRate = computed(() => {
  const o = props.overview;
  if (!o || o.issuedCount === 0) return '0';
  return ((o.redeemedCount / o.issuedCount) * 100).toFixed(1);
});
</script>

<template>
  <div class="strip">
    <div class="kpi kpi--accent">
      <div class="kpi__label">
        待兑换面值
      </div>
      <div class="kpi__value">
        {{ money(overview?.outstandingValue) }}
      </div>
      <div class="kpi__sub">
        {{ (overview?.outstandingCount ?? 0).toLocaleString() }} 张可兑换
      </div>
    </div>

    <div class="kpi">
      <div class="kpi__label">
        累计兑换
      </div>
      <div class="kpi__value kpi__value--success">
        {{ money(overview?.redeemedValue) }}
      </div>
      <div class="kpi__sub">
        {{ (overview?.redeemedCount ?? 0).toLocaleString() }} 张 · 核销率 {{ redeemRate }}%
      </div>
    </div>

    <div class="kpi">
      <div class="kpi__label">
        今日兑换
      </div>
      <div class="kpi__value">
        {{ money(overview?.todayRedeemedValue) }}
      </div>
      <div class="kpi__sub">
        {{ overview?.todayRedeemedCount ?? 0 }} 笔
      </div>
    </div>

    <div class="kpi">
      <div class="kpi__label">
        累计发行
      </div>
      <div class="kpi__value">
        {{ money(overview?.issuedValue) }}
      </div>
      <div class="kpi__sub">
        {{ (overview?.issuedCount ?? 0).toLocaleString() }} 张 · {{ overview?.batchCount ?? 0 }} 个批次
      </div>
    </div>

    <button
      type="button"
      class="kpi kpi--clickable"
      :class="{ 'kpi--danger': (overview?.suspiciousIps24h ?? 0) > 0 }"
      @click="router.push({ name: 'billing-redemption-attempts', query: { result: 'failed' } })"
    >
      <div class="kpi__label">
        24h 失败尝试
      </div>
      <div class="kpi__value">
        {{ overview?.failedAttempts24h ?? 0 }}
      </div>
      <div class="kpi__sub">
        可疑 IP <strong>{{ overview?.suspiciousIps24h ?? 0 }}</strong> 个 · 查看<el-icon><ArrowRight /></el-icon>
      </div>
    </button>
  </div>
</template>

<style scoped>
.strip {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}
@media (max-width: 1100px) {
  .strip {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.kpi {
  min-width: 0;
  padding: 12px 16px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  text-align: left;
  font: inherit;
}
.kpi--accent {
  background: linear-gradient(135deg, #eff6ff 0%, var(--el-bg-color) 70%);
  border-color: #bfdbfe;
}
.kpi--clickable {
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.kpi--clickable:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
}
.kpi--danger {
  border-color: var(--el-color-danger-light-5);
  background: linear-gradient(135deg, #fef2f2 0%, var(--el-bg-color) 70%);
}
.kpi--danger .kpi__value,
.kpi--danger strong {
  color: var(--el-color-danger);
}
.kpi__label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
}
.kpi__value {
  margin-top: 4px;
  font-size: 22px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}
.kpi__value--success {
  color: var(--el-color-success);
}
.kpi__sub {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
