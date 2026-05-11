import { ref, computed } from 'vue';

import { useListQuery } from '@/shared/composables/useListQuery';
import type { WalletSnapshot } from '@/features/billing/model/billing.types';
import { getBillingPort } from '@/features/billing/services';

import { getAccountAdminPort } from '../services';
import type { Account, AccountListFilter } from '../model/account.types';

const defaultFilter = (): AccountListFilter => ({
  keyword: '',
  type: 'all',
  status: 'all',
});

export function useAccountList() {
  const port = getAccountAdminPort();
  const billingPort = getBillingPort();
  const filter = ref<AccountListFilter>(defaultFilter());

  /** accountUid → WalletSnapshot，加载中/失败均不影响账户列表主体 */
  const walletMap = ref<Map<string, WalletSnapshot>>(new Map());
  const walletsLoading = ref(false);

  async function fetchWallets(accounts: Account[]): Promise<void> {
    if (accounts.length === 0) return;
    walletsLoading.value = true;
    try {
      const results = await Promise.all(
        accounts.map((a) => billingPort.getWallet(a.uid)),
      );
      const next = new Map<string, WalletSnapshot>();
      accounts.forEach((a, i) => {
        const r = results[i];
        if (r && r.success && r.data) {
          next.set(a.uid, r.data);
        }
      });
      walletMap.value = next;
    } finally {
      walletsLoading.value = false;
    }
  }

  const list = useListQuery({
    filter,
    filterKey: () => `${filter.value.keyword}|${filter.value.type}|${filter.value.status}`,
    fetcher: async ({ page, pageSize, filter: f }) => {
      const result = await port.listAccounts({ page, pageSize, filter: f });
      if (result.success) {
        void fetchWallets(result.data.items);
      }
      return result;
    },
    pageSize: 20,
  });

  const items = computed(() => list.items.value?.items ?? []);

  function resetFilter(): void {
    filter.value = defaultFilter();
  }

  void list.refresh();

  return {
    filter,
    items,
    walletMap,
    total: computed(() => list.items.value?.total ?? 0),
    loading: list.loading,
    error: list.error,
    pagination: list.pagination,
    refresh: list.refresh,
    resetFilter,
  };
}
