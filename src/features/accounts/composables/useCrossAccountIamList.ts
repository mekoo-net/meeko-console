import { computed, onMounted, ref } from 'vue';

import type { AppError } from '@/shared/api/httpTypes';

import type { AccountType } from '../model/account.types';
import type { IamUser, IamUserRole, IamUserStatus } from '../model/iamUser.types';
import { getAccountAdminPort } from '../services';

export interface IamUserRow extends IamUser {
  accountName: string;
  accountSlug: string;
  accountUid: string;
  accountType: AccountType;
}

interface Filter {
  keyword: string;
  role: IamUserRole | 'all';
  status: IamUserStatus | 'all';
}

const defaultFilter = (): Filter => ({ keyword: '', role: 'all', status: 'all' });

export function useCrossAccountIamList() {
  const port = getAccountAdminPort();

  const allRows = ref<IamUserRow[]>([]);
  const loading = ref(false);
  const error = ref<AppError | null>(null);
  const filter = ref<Filter>(defaultFilter());

  async function load(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const accountsResult = await port.listAccounts({
        page: 1,
        pageSize: 999,
        filter: { keyword: '', type: 'all', status: 'all' },
      });
      if (!accountsResult.success) {
        error.value = accountsResult.error;
        return;
      }

      const accounts = accountsResult.data.items;
      const iamResults = await Promise.all(
        accounts.map((a) => port.listIamUsers(a.uid).then((r) => ({ account: a, r }))),
      );

      const rows: IamUserRow[] = [];
      for (const { account, r } of iamResults) {
        if (!r.success) continue;
        for (const u of r.data) {
          rows.push({
            ...u,
            accountName: account.name,
            accountSlug: account.slug,
            accountUid: account.uid,
            accountType: account.type,
          });
        }
      }
      allRows.value = rows;
    } finally {
      loading.value = false;
    }
  }

  const items = computed(() => {
    const f = filter.value;
    const keyword = f.keyword.trim().toLowerCase();
    return allRows.value.filter((u) => {
      if (f.role !== 'all' && u.role !== f.role) return false;
      if (f.status !== 'all' && u.status !== f.status) return false;
      if (keyword.length === 0) return true;
      const haystack =
        `${u.username} ${u.displayName} ${u.email ?? ''} ${u.accountName} ${u.accountSlug}`.toLowerCase();
      return haystack.includes(keyword);
    });
  });

  const adminCount = computed(() => allRows.value.filter((u) => u.role === 'Admin').length);
  const ownerCount = computed(() => allRows.value.filter((u) => u.role === 'Owner').length);

  function resetFilter(): void {
    filter.value = defaultFilter();
  }

  onMounted(() => void load());

  return {
    filter,
    items,
    loading,
    error,
    adminCount,
    ownerCount,
    total: computed(() => items.value.length),
    refresh: load,
    resetFilter,
  };
}
