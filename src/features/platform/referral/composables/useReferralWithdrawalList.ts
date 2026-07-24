import { computed, ref } from 'vue';

import { useListQuery } from '@/shared/composables/useListQuery';

import {
  type ReferralWithdrawalFilter,
  referralWithdrawalStatusValues,
} from '../model/referral.types';
import { getReferralWithdrawalPort } from '../services';

function defaultFilter(): ReferralWithdrawalFilter {
  return { status: 'all' };
}

export function useReferralWithdrawalList() {
  const port = getReferralWithdrawalPort();
  const filter = ref<ReferralWithdrawalFilter>(defaultFilter());

  const list = useListQuery({
    filter,
    filterKey: () => filter.value.status,
    fetcher: async ({ page, pageSize, filter: f }) =>
      port.list({ page, pageSize, filter: f }),
    pageSize: 20,
  });

  const items = computed(() => list.items.value?.items ?? []);
  const total = computed(() => list.items.value?.total ?? 0);

  return {
    filter,
    items,
    total,
    loading: list.loading,
    error: list.error,
    pagination: list.pagination,
    refresh: list.refresh,
    statusOptions: [
      { value: 'all' as const, label: '全部' },
      ...referralWithdrawalStatusValues.map((s) => ({
        value: s,
        label:
          s === 'pending'
            ? '待审核'
            : s === 'approved'
              ? '已通过'
              : s === 'rejected'
                ? '已驳回'
                : '已打款',
      })),
    ],
  };
}
