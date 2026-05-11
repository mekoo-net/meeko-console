import { watch, type Ref } from 'vue';

import { fail, mapUnknownError } from '@/shared/api/httpTypes';
import { useAsyncState } from '@/shared/composables/useAsyncState';

import type { SubscriptionDto } from '../model/billing.types';
import { getBillingPort } from '../services';

export function useSubscriptionList(accountUid: Ref<string | null>) {
  const state = useAsyncState<SubscriptionDto[], []>(async () => {
    const uid = accountUid.value;
    if (!uid) return fail({ code: 'validation', message: '未选择账户' });
    try {
      return await getBillingPort().listSubscriptions(uid);
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
