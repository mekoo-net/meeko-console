import { computed, ref } from 'vue';

import { useListQuery } from '@/shared/composables/useListQuery';

import { getAccountAdminPort } from '../services';
import type { AccountListFilter } from '../model/account.types';

const defaultFilter = (): AccountListFilter => ({
  accountUid: '',
  contactKeyword: '',
  type: 'all',
  status: 'all',
});

export function useAccountList() {
  const port = getAccountAdminPort();
  const filter = ref<AccountListFilter>(defaultFilter());

  const list = useListQuery({
    filter,
    filterKey: () =>
      [
        filter.value.accountUid,
        filter.value.contactKeyword,
        filter.value.type,
        filter.value.status,
      ].join('|'),
    fetcher: async ({ page, pageSize, filter: f }) =>
      port.listAccounts({ page, pageSize, filter: f }),
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
    total: computed(() => list.items.value?.total ?? 0),
    loading: list.loading,
    error: list.error,
    pagination: list.pagination,
    refresh: list.refresh,
    resetFilter,
  };
}
