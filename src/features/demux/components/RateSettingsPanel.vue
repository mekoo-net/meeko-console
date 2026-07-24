<script setup lang="ts">
/**
 * 速率设置子页的统一骨架：标题栏（含刷新 / 最后保存）、
 * 未保存提示、内容区、sticky 底栏（取消 / 保存）。
 *
 * 「保存」提交整份草稿（后端为全量替换），因此按全局 isDirty 启用；
 * 「取消」只回滚当前页负责的切片，按 canReset 启用。
 */
import { Refresh } from '@element-plus/icons-vue';

import { formatDateTime } from '@/shared/lib/date';

defineProps<{
  title: string;
  description: string;
  loading: boolean;
  loaded: boolean;
  dirty: boolean;
  canReset: boolean;
  saving: boolean;
  updatedAt: number;
}>();

defineEmits<{
  refresh: [];
  reset: [];
  save: [];
}>();
</script>

<template>
  <div
    v-loading="loading"
    class="panel"
  >
    <header class="panel__head">
      <div>
        <h3 class="panel__title">
          {{ title }}
        </h3>
        <p class="panel__desc">
          {{ description }}
        </p>
      </div>
      <div class="panel__head-actions">
        <span
          v-if="updatedAt && !dirty"
          class="panel__meta"
        >最后保存 {{ formatDateTime(updatedAt) }}</span>
        <el-button
          :icon="Refresh"
          text
          @click="$emit('refresh')"
        >
          刷新
        </el-button>
      </div>
    </header>

    <el-alert
      v-if="dirty"
      class="panel__alert"
      type="warning"
      show-icon
      :closable="false"
      title="有未保存的更改，请保存后生效。"
    />

    <div
      v-if="loaded"
      class="panel__body"
    >
      <slot />
    </div>
    <el-empty
      v-else-if="!loading"
      description="暂无配置"
    />

    <footer
      v-if="loaded"
      class="panel__footer"
    >
      <el-button
        :disabled="!canReset"
        @click="$emit('reset')"
      >
        取消
      </el-button>
      <el-button
        type="primary"
        :loading="saving"
        :disabled="!dirty"
        @click="$emit('save')"
      >
        保存
      </el-button>
    </footer>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.panel__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 24px 12px;
  flex-shrink: 0;
}

.panel__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.panel__desc {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.panel__head-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.panel__meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.panel__alert {
  margin: 0 24px 4px;
  flex-shrink: 0;
}

.panel__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 24px 24px;
}

.panel__footer {
  position: sticky;
  bottom: 0;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 24px;
  border-top: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
  flex-shrink: 0;
}
</style>
