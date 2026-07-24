import { computed, ref } from 'vue';

import { clientPaginate } from '@/shared/composables/usePagination';
import { useListQuery } from '@/shared/composables/useListQuery';
import { ok } from '@/shared/api/httpTypes';

import { getNoticeAdminPort } from '../services';

type EmailTemplateListFilter = Record<string, never>;

const defaultFilter = (): EmailTemplateListFilter => ({});

export function useEmailTemplateList() {
  const port = getNoticeAdminPort();
  const filter = ref<EmailTemplateListFilter>(defaultFilter());

  const list = useListQuery({
    filter,
    filterKey: () => '',
    fetcher: async ({ page, pageSize }) => {
      const r = await port.listEmailTemplates();
      if (!r.success) return r;
      const sorted = [...r.data].sort(
        (a, b) => a.code.localeCompare(b.code) || a.locale.localeCompare(b.locale),
      );
      return ok({
        items: clientPaginate(sorted, page, pageSize),
        total: sorted.length,
      });
    },
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
