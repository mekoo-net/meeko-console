import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import type { Uid } from '@/shared/lib/id';

/**
 * 计费工作台：各 Tab 共享「当前查看的账户」。初始值由视图从 `authStore.accountUid` 注入。
 */
export const useBillingWorkspaceStore = defineStore('billingWorkspace', () => {
  const selectedAccountUid = ref<Uid | null>(null);

  function setSelectedAccountUid(uid: Uid | null): void {
    selectedAccountUid.value = uid;
  }

  const hasSelection = computed(() => selectedAccountUid.value !== null);

  return {
    selectedAccountUid,
    hasSelection,
    setSelectedAccountUid,
  };
});
