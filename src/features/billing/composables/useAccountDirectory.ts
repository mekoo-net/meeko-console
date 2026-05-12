import { onMounted } from 'vue';

import { useAsyncState } from '@/shared/composables/useAsyncState';
import { getAccountAdminPort } from '@/features/accounts/services';
import type { ListAccountsOutput } from '@/features/accounts/services/ports/accountAdminPort';

/**
 * 计费页账户下拉：拉取平台账户列表（Mock 与日后 HttpAdapter 同源）。
 */
export function useAccountDirectory() {
  const state = useAsyncState<ListAccountsOutput, []>(
    async () => getAccountAdminPort().listAccounts({
      page: 1,
      pageSize: 200,
      filter: { accountUid: '', contactKeyword: '', type: 'all', status: 'all' },
    }),
    { initial: { items: [], total: 0 } },
  );

  onMounted(() => {
    void state.run();
  });

  return state;
}
