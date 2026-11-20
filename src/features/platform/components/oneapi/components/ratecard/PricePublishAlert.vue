<script setup lang="ts">
/**
 * 「表里改成了，但没发布出去」的提示。发布是号池后台在每个写操作之后自己做的，成了页面上不提；
 * 没成的时候表里的改动是成了的，只是各产品读到的那一份没跟上——只弹一句「已保存」的话，人会以为各产品已经在用新价了。
 * 原因是号池后台写给管理员看的，原样列出来。
 *
 * 没有「重新发布」：号池后台自己会定时重发。只有它自己补不上的那一种（登记的主人是别的库）由页面在 actions 里摆接管。
 */
import { WarningFilled } from '@element-plus/icons-vue';

import { failureScope } from '../../model/ratecard';
import type { PricePublishFailure } from '../../model/ratecard.types';

defineProps<{
  failures: PricePublishFailure[];
  /** 号池后台自己补得上（会定时重发）。补不上的那一种（要人接管）是 false，不说「会自动重发」。 */
  autoRetry: boolean;
}>();
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
        已保存，但还没有发布出去，各产品读到的还是旧牌价
      </p>
      <ul class="publish-alert__list">
        <li
          v-for="f in failures"
          :key="f.maker"
        >
          <span class="publish-alert__scope">{{ failureScope(f) }}</span>：{{ f.error }}
        </li>
      </ul>
      <p
        v-if="autoRetry"
        class="publish-alert__note"
      >
        号池后台会自动重发，几分钟内补上，不用手动处理。
      </p>
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
.publish-alert__note {
  margin: 4px 0 0;
  color: var(--el-text-color-secondary);
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
