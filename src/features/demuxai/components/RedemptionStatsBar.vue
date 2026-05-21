<script setup lang="ts">
import type { RedemptionListStats } from '../model/redemptionDisplay';

defineProps<{ stats: RedemptionListStats; loading?: boolean }>();
</script>

<template>
  <div v-loading="loading" class="kpi-grid">
    <div class="kpi-card kpi-card--accent">
      <div class="kpi-card__label">全部批次</div>
      <div class="kpi-card__value">{{ stats.total }}</div>
      <div class="kpi-card__sub">活动码与一次性码合计</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-card__label">可领取</div>
      <div class="kpi-card__value kpi-card__value--success">{{ stats.claimable }}</div>
      <div class="kpi-card__sub">未达上限且未过期</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-card__label">进行中</div>
      <div class="kpi-card__value kpi-card__value--warning">{{ stats.inProgress }}</div>
      <div class="kpi-card__sub">活动码已部分领取</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-card__label">已领完</div>
      <div class="kpi-card__value">{{ stats.exhausted }}</div>
      <div class="kpi-card__sub">次数用尽或单次已用</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-card__label">已过期 / 停用</div>
      <div class="kpi-card__value kpi-card__value--muted">{{ stats.expired }}</div>
      <div class="kpi-card__sub">超过截止日或人工停用</div>
    </div>
  </div>
</template>

<style scoped>
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}
@media (max-width: 1100px) {
  .kpi-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 640px) {
  .kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
.kpi-card {
  background: #fff;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 14px 16px;
  min-width: 0;
}
.kpi-card--accent {
  background: linear-gradient(135deg, #eff6ff 0%, #fff 72%);
  border-color: #bfdbfe;
}
.kpi-card__label {
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
}
.kpi-card__value {
  margin-top: 6px;
  font-size: 26px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}
.kpi-card__value--success {
  color: var(--el-color-success);
}
.kpi-card__value--warning {
  color: var(--el-color-warning);
}
.kpi-card__value--muted {
  color: var(--el-text-color-secondary);
}
.kpi-card__sub {
  margin-top: 6px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
</style>
