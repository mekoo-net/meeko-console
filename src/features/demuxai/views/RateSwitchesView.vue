<script setup lang="ts">
import { onMounted } from 'vue';

import RateSettingsPanel from '@/features/demuxai/components/RateSettingsPanel.vue';
import RateWindowInput from '@/features/demuxai/components/RateWindowInput.vue';
import { useRateLimitSettings } from '@/features/demuxai/composables/useRateLimitSettings';

const { draft, loading, saving, loaded, updatedAtUtc, isDirty, isDirtySwitches, load, save, resetSwitches } =
  useRateLimitSettings();

onMounted(() => {
  void load();
});
</script>

<template>
  <RateSettingsPanel
    title="总开关"
    description="控制限速开关与默认策略，各维度 0 表示不限；账户 / IP 覆盖在对应页面配置"
    :loading="loading"
    :loaded="loaded"
    :dirty="isDirty"
    :can-reset="isDirtySwitches"
    :saving="saving"
    :updated-at="updatedAtUtc"
    @refresh="load(true)"
    @reset="resetSwitches"
    @save="save"
  >
    <section class="block">
      <div class="switch-row" :class="{ 'switch-row--expanded': draft.enabled }">
        <div class="switch-row__text">
          <span class="switch-row__label">账户限速</span>
          <span class="switch-row__hint">按账户统计请求 / 成功 / 并发，网关解析 Token 时生效。</span>
        </div>
        <el-switch v-model="draft.enabled" size="large" />
      </div>

      <el-collapse-transition>
        <el-form
          v-show="draft.enabled"
          label-width="140px"
          label-position="left"
          class="policy-form"
        >
          <h4 class="policy-form__title">账户默认策略</h4>
          <el-form-item label="统计窗口">
            <RateWindowInput
              v-model:value="draft.defaultPolicy.windowValue"
              v-model:unit="draft.defaultPolicy.windowUnit"
              class="field"
            />
          </el-form-item>
          <el-form-item label="请求数 / 窗口">
            <el-input-number
              v-model="draft.defaultPolicy.maxRequests"
              :min="0"
              :step="10"
              controls-position="right"
              class="field"
            />
          </el-form-item>
          <el-form-item label="成功数 / 窗口">
            <el-input-number
              v-model="draft.defaultPolicy.maxSuccesses"
              :min="0"
              :step="10"
              controls-position="right"
              class="field"
            />
          </el-form-item>
          <el-form-item label="并发数">
            <el-input-number
              v-model="draft.defaultPolicy.maxConcurrency"
              :min="0"
              :step="1"
              controls-position="right"
              class="field"
            />
          </el-form-item>
        </el-form>
      </el-collapse-transition>
    </section>

    <section class="block">
      <div class="switch-row" :class="{ 'switch-row--expanded': draft.ip.enabled }">
        <div class="switch-row__text">
          <span class="switch-row__label">IP 限速</span>
          <span class="switch-row__hint">网关在 sk- 鉴权之前按客户端 IP 执行，与账户限速相互独立。</span>
        </div>
        <el-switch v-model="draft.ip.enabled" size="large" />
      </div>

      <el-collapse-transition>
        <el-form
          v-show="draft.ip.enabled"
          label-width="140px"
          label-position="left"
          class="policy-form"
        >
          <h4 class="policy-form__title">IP 默认策略</h4>
          <el-form-item label="统计窗口">
            <RateWindowInput
              v-model:value="draft.ip.windowValue"
              v-model:unit="draft.ip.windowUnit"
              class="field"
            />
          </el-form-item>
          <el-form-item label="请求数 / 窗口">
            <el-input-number
              v-model="draft.ip.maxRequests"
              :min="0"
              :step="10"
              controls-position="right"
              class="field"
            />
          </el-form-item>
          <el-form-item label="并发数">
            <el-input-number
              v-model="draft.ip.maxConcurrency"
              :min="0"
              :step="1"
              controls-position="right"
              class="field"
            />
          </el-form-item>
        </el-form>
      </el-collapse-transition>
    </section>
  </RateSettingsPanel>
</template>

<style scoped>
.block + .block {
  margin-top: 32px;
  padding-top: 32px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 32px;
}

.switch-row--expanded {
  margin-bottom: 20px;
}

.switch-row__text {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.switch-row__label {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.switch-row__hint {
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

.policy-form {
  max-width: 560px;
  padding-left: 4px;
}

.policy-form__title {
  margin: 0 0 16px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}

.policy-form :deep(.el-form-item) {
  margin-bottom: 18px;
}

.field {
  width: 220px;
}
</style>
