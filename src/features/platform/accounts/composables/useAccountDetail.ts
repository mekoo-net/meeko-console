import { watch, type Ref } from 'vue';

import { useAsyncState } from '@/shared/composables/useAsyncState';

import { getAccountAdminPort } from '../services';

export function useAccountDetail(uidRef: Ref<string>) {
  const port = getAccountAdminPort();
  const state = useAsyncState((uid: string) => port.getAccount(uid));

  function refresh(): void {
    if (uidRef.value) void state.run(uidRef.value);
  }

  watch(uidRef, refresh, { immediate: true });

  return {
    account: state.data,
    loading: state.loading,
    error: state.error,
    refresh,
  };
}
