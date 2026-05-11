import { computed, ref, watch, type Ref } from 'vue';

import { useAsyncState } from '@/shared/composables/useAsyncState';

import type { IamUser, IamUserRole, IamUserStatus } from '../model/iamUser.types';
import type { CreateIamUserPayload } from '../model/validators';
import { getAccountAdminPort } from '../services';

interface IamUserFilter {
  keyword: string;
  role: IamUserRole | 'all';
  status: IamUserStatus | 'all';
}

const defaultFilter = (): IamUserFilter => ({ keyword: '', role: 'all', status: 'all' });

export function useIamUserList(accountUidRef: Ref<string>) {
  const port = getAccountAdminPort();
  const filter = ref<IamUserFilter>(defaultFilter());

  const state = useAsyncState((uid: string) => port.listIamUsers(uid));
  const creating = useAsyncState(
    (uid: string, payload: CreateIamUserPayload) => port.createIamUser(uid, payload),
  );

  watch(
    accountUidRef,
    (uid) => {
      if (uid) void state.run(uid);
    },
    { immediate: true },
  );

  const filtered = computed(() => {
    const raw = state.data.value ?? [];
    const f = filter.value;
    const keyword = f.keyword.trim().toLowerCase();
    return raw.filter((u: IamUser) => {
      if (f.role !== 'all' && u.role !== f.role) return false;
      if (f.status !== 'all' && u.status !== f.status) return false;
      if (keyword.length === 0) return true;
      const haystack = `${u.username} ${u.displayName} ${u.email ?? ''}`.toLowerCase();
      return haystack.includes(keyword);
    });
  });

  async function createIamUser(payload: CreateIamUserPayload) {
    const uid = accountUidRef.value;
    if (!uid) return;
    const result = await creating.run(uid, payload);
    if (result.success) {
      await state.run(uid);
    }
    return result;
  }

  return {
    filter,
    items: filtered,
    loading: state.loading,
    error: state.error,
    creating: creating.loading,
    createError: creating.error,
    refresh: () => state.run(accountUidRef.value),
    createIamUser,
  };
}
