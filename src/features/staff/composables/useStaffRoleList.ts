import { computed, ref } from 'vue';

import { useListQuery } from '@/shared/composables/useListQuery';

import { getStaffPort } from '../services';

interface RoleListFilter {
  keyword: string;
}

export function useStaffRoleList() {
  const filter = ref<RoleListFilter>({ keyword: '' });

  const list = useListQuery({
    filter,
    filterKey: () => filter.value.keyword,
    fetcher: ({ page, pageSize, filter: f }) =>
      getStaffPort().listRoles({ page, pageSize, keyword: f.keyword }),
    pageSize: 20,
  });

  const items = computed(() => list.items.value?.items ?? []);
  const total = computed(() => list.items.value?.total ?? 0);

  function resetFilter(): void {
    filter.value = { keyword: '' };
  }

  return {
    filter,
    items,
    total,
    loading: list.loading,
    error: list.error,
    pagination: list.pagination,
    refresh: list.refresh,
    resetFilter,
  };
}
