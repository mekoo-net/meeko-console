<script setup lang="ts">
import { computed } from 'vue';

import MoneyText from '@/shared/ui/MoneyText.vue';
import { tierProgress } from '../model/tierConfig';

const props = defineProps<{
  /** 账户当前 tier（由后端 / mock 计算后返回） */
  tier: number;
  /** 账户累积充值金额（元） */
  totalRechargedAmount: number;
}>();

const progress = computed(() => tierProgress(props.totalRechargedAmount));
</script>

<template>
  <div class="tier-card">
    <div class="tier-card__head">
      <span class="tier-card__label">账户等级</span>
      <span class="tier-card__level">Lv{{ tier }}</span>
    </div>
    <div class="tier-card__name">{{ progress.current.name }}</div>

    <div class="tier-card__amount">
      <span class="tier-card__amount-label">累计充值</span>
      <MoneyText :value="totalRechargedAmount" :options="{ currency: 'CNY' }" />
    </div>

    <el-progress
      :percentage="progress.percent"
      :show-text="false"
      :stroke-width="6"
      class="tier-card__progress"
    />

    <div class="tier-card__next">
      <template v-if="progress.next">
        距 Lv{{ progress.next.level }} 还差
        <MoneyText :value="progress.remainingToNext" :options="{ currency: 'CNY' }" />
      </template>
      <template v-else>已达最高等级</template>
    </div>
  </div>
</template>

<style scoped>
.tier-card {
  background: linear-gradient(135deg, #f5f3ff, #ede9fe);
  border-radius: 10px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 152px;
}
.tier-card__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.tier-card__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.tier-card__level {
  font-size: 24px;
  font-weight: 700;
  color: #6d28d9;
  font-variant-numeric: tabular-nums;
}
.tier-card__name {
  font-size: 13px;
  color: var(--el-text-color-primary);
  font-weight: 500;
}
.tier-card__amount {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  margin-top: 4px;
}
.tier-card__amount-label {
  color: var(--el-text-color-secondary);
}
.tier-card__progress {
  margin-top: 2px;
}
.tier-card__next {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
