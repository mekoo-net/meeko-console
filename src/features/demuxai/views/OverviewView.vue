<script setup lang="ts">
/**
 * DemuxAI 概览页 —— 入口聚合 Dashboard（编排层）。
 *
 * 关注点：
 *  - 仅维护「过滤状态 + 远程数据」，所有图表/卡片由子组件渲染
 *  - 时间范围变化即触发 `fetchStats`，所有下游组件随 `stats` 重渲染
 *  - 子组件均位于 `components/overview/*`
 */
import { computed, onMounted, ref, watch } from 'vue';

import { ElMessage } from 'element-plus';

import PageHeader from '@/shared/ui/PageHeader.vue';

import type { ListLogsFilter, LogStats } from '../model/log.types';
import type { Provider } from '../model/provider.types';
import { getDemuxaiLogsPort, getDemuxaiProviderPort } from '../services';

import DateRangeBar from '../components/overview/DateRangeBar.vue';
import OverviewKpi from '../components/overview/OverviewKpi.vue';
import OverviewTrafficChart from '../components/overview/OverviewTrafficChart.vue';
import OverviewStatusDonut from '../components/overview/OverviewStatusDonut.vue';
import OverviewCostTokensChart from '../components/overview/OverviewCostTokensChart.vue';
import OverviewErrorTop from '../components/overview/OverviewErrorTop.vue';
import OverviewTopModels from '../components/overview/OverviewTopModels.vue';
import OverviewTopProviders from '../components/overview/OverviewTopProviders.vue';

const logsPort = getDemuxaiLogsPort();
const providerPort = getDemuxaiProviderPort();

const stats = ref<LogStats | null>(null);
const providers = ref<Provider[]>([]);
const loading = ref(false);

const last24h = (): [string, string] => {
  const now = new Date();
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return [from.toISOString(), now.toISOString()];
};

const dateRange = ref<[string, string] | null>(last24h());

function buildPortFilter(): ListLogsFilter {
  const f: ListLogsFilter = { status: 'all' };
  if (dateRange.value && dateRange.value[0]) f.fromUtc = dateRange.value[0];
  if (dateRange.value && dateRange.value[1]) f.toUtc = dateRange.value[1];
  return f;
}

async function fetchStats(): Promise<void> {
  if (!dateRange.value || !dateRange.value[0]) {
    ElMessage.warning('请先选择时间范围（最长 7 天）');
    return;
  }
  loading.value = true;
  try {
    const r = await logsPort.stats(buildPortFilter());
    if (r.success) stats.value = r.data;
    else ElMessage.error(r.error.message);
  } finally {
    loading.value = false;
  }
}

async function loadProviders(): Promise<void> {
  const r = await providerPort.list({
    page: 1,
    pageSize: 200,
    filter: { keyword: '', apiType: 'all', status: 'all' },
  });
  if (r.success) providers.value = r.data.items;
}

const providerNameMap = computed(() => {
  const m = new Map<string, string>();
  for (const p of providers.value) m.set(p.uid, p.name);
  return m;
});

function resolveProviderName(uid: string): string {
  return providerNameMap.value.get(uid) ?? uid;
}

watch(dateRange, () => void fetchStats(), { deep: true });

function onReset(): void {
  dateRange.value = last24h();
}

onMounted(() => {
  void loadProviders();
  void fetchStats();
});
</script>

<template>
  <div class="page">
    <PageHeader title="DemuxAI 概览" />

    <DateRangeBar
      v-model:date-range="dateRange"
      :loading="loading"
      @refresh="fetchStats"
      @reset="onReset"
    />

    <div v-loading="loading" class="overview">
      <OverviewKpi :stats="stats" />

      <div class="row row--2to1">
        <OverviewTrafficChart
          :buckets="stats?.buckets ?? []"
          :bucket-size-sec="stats?.bucketSizeSec ?? 3600"
        />
        <OverviewStatusDonut
          :total-calls="stats?.totalCalls ?? 0"
          :breakdown="stats?.statusBreakdown ?? []"
        />
      </div>

      <div class="row row--2to1">
        <OverviewCostTokensChart
          :buckets="stats?.buckets ?? []"
          :bucket-size-sec="stats?.bucketSizeSec ?? 3600"
        />
        <OverviewErrorTop :items="stats?.errorCodes ?? []" />
      </div>

      <div class="row row--1to1">
        <OverviewTopModels :items="stats?.topModels ?? []" />
        <OverviewTopProviders
          :items="stats?.topProviders ?? []"
          :resolve-name="resolveProviderName"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.overview {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.row {
  display: grid;
  gap: 12px;
}
.row--2to1 {
  grid-template-columns: 2fr 1fr;
}
.row--1to1 {
  grid-template-columns: 1fr 1fr;
}
@media (max-width: 1200px) {
  .row--2to1,
  .row--1to1 {
    grid-template-columns: 1fr;
  }
}
</style>
