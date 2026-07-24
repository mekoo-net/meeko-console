import { onMounted, ref } from 'vue';

import { fail, mapUnknownError, type AppResult } from '@/shared/api/httpTypes';
import { useAsyncState } from '@/shared/composables/useAsyncState';

import type { AdminCommandResult, StorageBackendDto } from '../model/storageBackend.types';
import { getStorageAdminPort } from '../services';

export function useStorageBackends() {
  const state = useAsyncState<StorageBackendDto[], []>(
    async () => getStorageAdminPort().listBackends(),
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

  async function remove(id: string): Promise<AppResult<AdminCommandResult>> {
    return call(() => getStorageAdminPort().deleteBackend(id));
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
