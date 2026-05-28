import { watch, type Ref } from 'vue';

import { fail, mapUnknownError } from '@/shared/api/httpTypes';
import { useAsyncState } from '@/shared/composables/useAsyncState';

import type { WalletSnapshot } from '../model/billing.types';
import { getAccountAdminPort } from '@/features/accounts/services';

/** 管理台钱包数据来自 `GET /api/admin/accounts/{uid}` 的 `wallet` 字段，不走 `/api/billing/wallet`。 */
export function useWallet(accountUid: Ref<string | null>) {
  const state = useAsyncState<WalletSnapshot | null, []>(async () => {
    const uid = accountUid.value;
    if (!uid) return fail({ code: 'validation', message: '未选择账户' });
    try {
      const result = await getAccountAdminPort().getAccount(uid);
      if (!result.success) return result;
      const wallet = result.data.wallet;
      if (!wallet) return fail({ code: 'not_found', message: '暂无钱包数据' });
      return {
        success: true,
        data: {
          accountUid: uid,
          available: wallet.available,
          held: wallet.held,
          currency: wallet.currency,
          updatedAtUtc: wallet.updatedAtUtc,
        },
      };
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
