import { watch, type Ref } from 'vue';

import { fail, mapUnknownError } from '@/shared/api/httpTypes';
import { useAsyncState } from '@/shared/composables/useAsyncState';

import type { WalletSnapshot } from '../model/billing.types';
import { getBillingPort } from '../services';

export function useWallet(accountUid: Ref<string | null>) {
  const state = useAsyncState<WalletSnapshot | null, []>(async () => {
    const uid = accountUid.value;
    if (!uid) return fail({ code: 'validation', message: '未选择账户' });
    try {
      return await getBillingPort().getWallet(uid);
    } catch (e) {
      return fail(mapUnknownError(e));
    }
  });

  watch(
    accountUid,
    () => {
      void state.run();
    },
    { immediate: true },
  );

  return state;
}
