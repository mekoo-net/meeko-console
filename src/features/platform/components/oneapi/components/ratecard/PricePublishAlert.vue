<script setup lang="ts">
/**
 * 「表里改成了，但没发布出去」的提示。每个写操作的回包都带发布结果，发布没成时表里的改动是成了的，
 * 只是各产品读到的那一份没跟上——只弹一句「已保存」的话，人会以为各产品已经在用新价了。
 * 页面顶上和导入结果里用的是同一块；原因是号池后台写给管理员看的，原样列出来。
 */
import { WarningFilled } from '@element-plus/icons-vue';

import { failureScope } from '../../model/ratecard';
import type { PricePublishFailure } from '../../model/ratecard.types';

defineProps<{ failures: PricePublishFailure[] }>();
</script>

<template>
  <div
    class="publish-alert"
    role="alert"
  >
    <el-icon
      class="publish-alert__icon"
      :size="16"
    >
      <WarningFilled />
    </el-icon>
    <div class="publish-alert__body">
      <p class="publish-alert__title">
        没有发布出去，各产品读到的还是旧牌价
      </p>
      <ul class="publish-alert__list">
        <li
          v-for="f in failures"
          :key="f.maker"
        >
          <span class="publish-alert__scope">{{ failureScope(f) }}</span>：{{ f.error }}
        </li>
      </ul>
    </div>
    <div
      v-if="$slots.actions"
      class="publish-alert__actions"
    >
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.publish-alert {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 14px;
  border: 1px solid var(--el-color-danger-light-5);
  border-radius: 8px;
  background: var(--el-color-danger-light-9);
  font-size: 13px;
  line-height: 1.5;
}
.publish-alert__icon {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--el-color-danger);
}
.publish-alert__body {
  flex: 1;
  min-width: 0;
}
.publish-alert__title {
  margin: 0;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.publish-alert__list {
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
  color: var(--el-text-color-regular);
  /* 原因可能是一长串连接报错：能折行，多了自己滚，不把下面的表挤没 */
  max-height: 96px;
  overflow-y: auto;
  overflow-wrap: anywhere;
}
.publish-alert__scope {
  font-weight: 600;
}
.publish-alert__actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
