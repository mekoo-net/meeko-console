<script setup lang="ts">
/**
 * Tavern 概览 — 仅展示 platform.usage_logs 调用统计（与 Demux 概览同构，无 TTFT）。
 */
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';

import PageHeader from '@/shared/ui/PageHeader.vue';
import type { LogStats } from '@demux/common';
import { dateRangeToEpochMillis } from '@/shared/lib/epoch';
import { toLocalDateTimeValue } from '@/shared/lib/date';
import { getTavernUsageStatsPort } from '../services';

import DateRangeBar from '@/features/demux/components/overview/DateRangeBar.vue';
import TavernOverviewKpi from '../components/overview/TavernOverviewKpi.vue';
import OverviewTrafficChart from '@/features/demux/components/overview/OverviewTrafficChart.vue';
import OverviewStatusDonut from '@/features/demux/components/overview/OverviewStatusDonut.vue';
import OverviewCostTokensChart from '@/features/demux/components/overview/OverviewCostTokensChart.vue';
import OverviewErrorTop from '@/features/demux/components/overview/OverviewErrorTop.vue';
import OverviewTopModels from '@/features/demux/components/overview/OverviewTopModels.vue';
import OverviewTopProviders from '@/features/demux/components/overview/OverviewTopProviders.vue';

const statsPort = getTavernUsageStatsPort();

const stats = ref<LogStats | null>(null);
const loading = ref(false);

const last24h = (): [string, string] => {
  const now = new Date();
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return [toLocalDateTimeValue(from), toLocalDateTimeValue(now)];
};

const dateRange = ref<[string, string] | null>(last24h());

function buildPortFilter() {
  const f: { fromUtc?: number; toUtc?: number } = {};
  if (dateRange.value?.[0] && dateRange.value[1]) {
    Object.assign(f, dateRangeToEpochMillis(dateRange.value));
  }
  return f;
}

async function fetchStats(): Promise<void> {
  if (!dateRange.value?.[0]) {
    ElMessage.warning('请先选择时间范围（最长 30 天）');
    return;
  }
  loading.value = true;
  try {
    const r = await statsPort.stats(buildPortFilter());
    if (r.success) stats.value = r.data;
    else ElMessage.error(r.error.message);
  } finally {
    loading.value = false;
  }
}

function onReset(): void {
  dateRange.value = last24h();
}

onMounted(() => {
  void fetchStats();
});
</script>

<template>
  <div class="page">
    <PageHeader
      title="Tavern 概览"
      description="基于平台 usage_logs 的回合调用统计：次数、扣费、Token 与模型分布。"
    />

    <DateRangeBar
      v-model:date-range="dateRange"
      :loading="loading"
      @refresh="fetchStats"
      @reset="onReset"
    />

    <div
      v-loading="loading"
      class="overview"
    >
      <TavernOverviewKpi :stats="stats" />

      <div class="overview__grid overview__grid--2">
        <OverviewTrafficChart
          :buckets="stats?.buckets ?? []"
          :bucket-size-sec="stats?.bucketSizeSec ?? 3600"
        />
        <OverviewStatusDonut
          :total-calls="stats?.totalCalls ?? 0"
          :success-calls="stats?.successCalls ?? 0"
          :error-codes="stats?.errorCodes ?? []"
        />
      </div>

      <div class="overview__grid overview__grid--2">
        <OverviewCostTokensChart
          :buckets="stats?.buckets ?? []"
          :bucket-size-sec="stats?.bucketSizeSec ?? 3600"
        />
        <OverviewErrorTop :items="stats?.errorCodes ?? []" />
      </div>

      <div class="overview__grid overview__grid--2">
        <OverviewTopModels :items="stats?.topModels ?? []" />
        <OverviewTopProviders :items="stats?.topProviders ?? []" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  padding: 0 4px 24px;
}

.overview {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.overview__grid {
  display: grid;
  gap: 14px;
}

.overview__grid--2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

@media (max-width: 1100px) {
  .overview__grid--2 {
    grid-template-columns: 1fr;
  }
}
</style>
