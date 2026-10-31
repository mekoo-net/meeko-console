<script setup lang="ts">
/**
 * 列表里的账户格子：名字进这个人的 Tavern 用户视角，旁边的箭头去平台账户页，下面露邮箱。
 * 要按人筛选用筛选栏的 UID 框。
 */
import { TopRight } from '@element-plus/icons-vue';

import type { AccountRef } from '../../model/content.types';
import { accountName } from '../../model/contentFormat';

defineProps<{ account: AccountRef }>();
</script>

<template>
  <div class="cell-stack">
    <div class="cell-account">
      <router-link
        :to="{ name: 'tavern-user', params: { uid: String(account.uid) } }"
        class="cell-link"
        title="进入用户视角"
      >
        {{ accountName(account) }}
      </router-link>
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
  font-size: 12.5px;
  color: var(--el-color-primary);
  text-decoration: none;
}

.cell-link:hover {
  text-decoration: underline;
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
