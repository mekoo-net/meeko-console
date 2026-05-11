import { ref, type Ref, watch } from 'vue';

import { fail, mapUnknownError, type AppResult } from '@/shared/api/httpTypes';
import { useListQuery } from '@/shared/composables/useListQuery';

import type { ListOrdersFilter, OrderDto } from '../model/billing.types';
import { getBillingPort } from '../services';

function refValue<T>(initial: T): Ref<T> {
  return ref(initial) as Ref<T>;
}

export function useOrderList(accountUid: Ref<string | null>) {
  const filter = refValue<ListOrdersFilter>({ status: 'all' });

  function filterKey(): string {
    return String(filter.value.status);
  }

  async function fetcher(input: {
    page: number;
    pageSize: number;
    filter: ListOrdersFilter;
  }): Promise<AppResult<{ items: OrderDto[]; total: number }>> {
    const uid = accountUid.value;
    if (!uid) return fail({ code: 'validation', message: '未选择账户' });
    try {
      return await getBillingPort().listOrders(uid, input);
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
