<script setup lang="ts">
import { onMounted } from 'vue';
import { Delete, Plus } from '@element-plus/icons-vue';

import RateSettingsPanel from '@/features/demuxai/components/RateSettingsPanel.vue';
import RateWindowInput from '@/features/demuxai/components/RateWindowInput.vue';
import { emptyIpOverride, useRateLimitSettings } from '@/features/demuxai/composables/useRateLimitSettings';
import type { IpRateOverride } from '@/features/demuxai/model/rateLimit.types';

const { draft, loading, saving, loaded, updatedAtUtc, isDirty, isDirtyIp, load, save, resetIp } =
  useRateLimitSettings();

function addOverride(): void {
  draft.ip.overrides.unshift(emptyIpOverride());
}

function removeOverride(row: IpRateOverride): void {
  const idx = draft.ip.overrides.indexOf(row);
  if (idx >= 0) draft.ip.overrides.splice(idx, 1);
}

onMounted(() => {
  void load();
});
</script>

<template>
  <RateSettingsPanel
    title="IP 设置"
    description="针对具体 IP / CIDR 覆盖默认策略，未覆盖的 IP 使用总开关页的 IP 默认策略"
    :loading="loading"
    :loaded="loaded"
    :dirty="isDirty"
    :can-reset="isDirtyIp"
    :saving="saving"
    :updated-at="updatedAtUtc"
    @refresh="load(true)"
    @reset="resetIp"
    @save="save"
  >
    <el-alert
      v-if="!draft.ip.enabled"
      class="off-hint"
      type="info"
      show-icon
      :closable="false"
      title="IP 限速总开关已关闭，以下覆盖将在开启后生效。"
    />

    <section class="section">
      <div class="section__head">
        <h4 class="section__title">针对 IP 调整</h4>
        <el-button :icon="Plus" type="primary" plain @click="addOverride">添加 IP</el-button>
      </div>

      <el-table :data="draft.ip.overrides" empty-text="暂无 IP 覆盖">
        <el-table-column label="IP / CIDR" min-width="190">
          <template #default="{ row }">
            <el-input v-model="row.ip" placeholder="1.2.3.4 或 10.0.0.0/8" />
          </template>
        </el-table-column>

        <el-table-column label="启用" width="70" align="center">
          <template #default="{ row }">
            <el-switch v-model="row.enabled" size="small" />
          </template>
        </el-table-column>

        <el-table-column label="统计窗口" min-width="180">
          <template #default="{ row }">
            <RateWindowInput
              v-model:value="row.windowValue"
              v-model:unit="row.windowUnit"
              :disabled="!row.enabled"
            />
          </template>
        </el-table-column>

        <el-table-column label="请求数 / 窗口" min-width="130">
          <template #default="{ row }">
            <el-input-number
              v-model="row.maxRequests"
              :min="0"
              :step="10"
              :disabled="!row.enabled"
              controls-position="right"
              class="cell-num"
            />
          </template>
        </el-table-column>

        <el-table-column label="并发数" min-width="110">
          <template #default="{ row }">
            <el-input-number
              v-model="row.maxConcurrency"
              :min="0"
              :step="1"
              :disabled="!row.enabled"
              controls-position="right"
              class="cell-num"
            />
          </template>
        </el-table-column>

        <el-table-column label="操作" width="72" align="center">
          <template #default="{ row }">
            <el-button :icon="Delete" type="danger" text @click="removeOverride(row)" />
          </template>
        </el-table-column>
      </el-table>
    </section>
  </RateSettingsPanel>
</template>

<style scoped>
.off-hint {
  margin-bottom: 16px;
}

.section__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.section__title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}

.cell-num {
  width: 100%;
}
</style>
