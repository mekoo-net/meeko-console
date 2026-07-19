import { computed, ref } from 'vue';

import { useListQuery } from '@/shared/composables/useListQuery';

import { defaultStaffListFilter, type StaffListFilter } from '../model/staff.types';
import { getStaffPort } from '../services';

export function useStaffList() {
  const filter = ref<StaffListFilter>(defaultStaffListFilter());

  const list = useListQuery({
    filter,
    filterKey: () => `${filter.value.keyword}|${filter.value.status}|${filter.value.roleId}`,
    fetcher: ({ page, pageSize, filter: f }) =>
      getStaffPort().listStaff({ page, pageSize, filter: f }),
    pageSize: 20,
  });

  const items = computed(() => list.items.value?.items ?? []);
  const total = computed(() => list.items.value?.total ?? 0);

  function resetFilter(): void {
    filter.value = defaultStaffListFilter();
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
