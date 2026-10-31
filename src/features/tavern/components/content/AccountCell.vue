<script setup lang="ts">
/**
 * 列表里的账户格子：名字点一下按这个账户筛，旁边的箭头去平台账户页，下面露邮箱。
 */
import { TopRight } from '@element-plus/icons-vue';

import type { AccountRef } from '../../model/content.types';
import { accountName } from '../../model/contentFormat';

defineProps<{ account: AccountRef }>();
defineEmits<{ filter: [uid: number] }>();
</script>

<template>
  <div class="cell-stack">
    <div class="cell-account">
      <el-button
        link
        type="primary"
        class="cell-link"
        :title="`按账户 UID「${account.uid}」过滤`"
        @click="$emit('filter', account.uid)"
      >
        {{ accountName(account) }}
      </el-button>
      <router-link
        :to="`/accounts/${account.uid}`"
        class="cell-jump"
        title="去账户页"
      >
        <el-icon><TopRight /></el-icon>
      </router-link>
    </div>
    <span
      v-if="account.email"
      class="cell-sub"
    >{{ account.email }}</span>
  </div>
</template>

<style scoped>
.cell-stack {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-width: 0;
  line-height: 1.35;
}

.cell-account {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.cell-link {
  padding: 0;
  height: auto;
  font-size: 12.5px;
}

.cell-jump {
  display: inline-flex;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.cell-jump:hover {
  color: var(--el-color-primary);
}
</style>
