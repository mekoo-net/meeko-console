import { ref, type Ref, watch } from 'vue';

import { fail, mapUnknownError, type AppResult } from '@/shared/api/httpTypes';
import { useListQuery } from '@/shared/composables/useListQuery';

import type { InvoiceDto, ListInvoicesFilter } from '../model/billing.types';
import { getBillingPort } from '../services';

function refValue<T>(initial: T): Ref<T> {
  return ref(initial) as Ref<T>;
}

export function useInvoiceList(accountUid: Ref<string | null>) {
  const filter = refValue<ListInvoicesFilter>({
    kind: 'all',
    fromUtc: undefined,
    toUtc: undefined,
  });

  function filterKey(): string {
    return `${filter.value.kind}|${filter.value.fromUtc ?? ''}|${filter.value.toUtc ?? ''}`;
  }

  async function fetcher(input: {
    page: number;
    pageSize: number;
    filter: ListInvoicesFilter;
  }): Promise<AppResult<{ items: InvoiceDto[]; total: number }>> {
    const uid = accountUid.value;
    if (!uid) return fail({ code: 'validation', message: '未选择账户' });
    try {
      return await getBillingPort().listInvoices(uid, input);
    } catch (e) {
      return fail(mapUnknownError(e));
    }
  }

  const q = useListQuery({
    filter,
    filterKey,
    fetcher,
    pageSize: 20,
  });

  watch(accountUid, () => {
    void q.refresh();
  });

  return {
    ...q,
    filter,
  };
}
