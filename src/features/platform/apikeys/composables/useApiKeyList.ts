import { computed, ref } from 'vue';

import { useListQuery } from '@/shared/composables/useListQuery';

import { getApiKeyPort } from '../services';

export function useApiKeyList() {
  const filter = ref(null);

  const list = useListQuery({
    filter,
    filterKey: () => 'all',
    fetcher: ({ page, pageSize }) => getApiKeyPort().list({ page, pageSize }),
    pageSize: 20,
  });

  const items = computed(() => list.items.value?.items ?? []);

  return {
    items,
    loading: list.loading,
    error: list.error,
    pagination: list.pagination,
    refresh: list.refresh,
  };
}
