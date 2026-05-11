import { onMounted, ref } from 'vue';

import { fail, mapUnknownError, type AppResult } from '@/shared/api/httpTypes';
import { useAsyncState } from '@/shared/composables/useAsyncState';

import type { AdminCommandResult, SmtpProviderDto } from '../model/smtpProvider.types';
import { getNoticeAdminPort } from '../services';

export function useSmtpList() {
  const state = useAsyncState<SmtpProviderDto[], []>(
    async () => getNoticeAdminPort().listSmtpProviders(),
    { initial: [] },
  );

  const mutating = ref(false);

  async function call<T>(fn: () => Promise<AppResult<T>>): Promise<AppResult<T>> {
    mutating.value = true;
    try {
      return await fn();
    } catch (e) {
      return fail(mapUnknownError(e));
    } finally {
      mutating.value = false;
    }
  }

  async function remove(uid: string): Promise<AppResult<AdminCommandResult>> {
    return call(() => getNoticeAdminPort().deleteSmtpProvider(uid));
  }

  onMounted(() => {
    void state.run();
  });

  return {
    ...state,
    mutating,
    remove,
    refresh: () => state.run(),
  };
}
