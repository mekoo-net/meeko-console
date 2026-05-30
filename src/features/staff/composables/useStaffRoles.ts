import { onMounted } from 'vue';

import { useAsyncState } from '@/shared/composables/useAsyncState';

import type { StaffRole } from '../model/staff.types';
import { getStaffPort } from '../services';

export function useStaffRoles() {
  const state = useAsyncState<StaffRole[], []>(
    async () => getStaffPort().listRoles(),
    { initial: [] },
  );

  onMounted(() => {
    void state.run();
  });

  return {
    ...state,
    refresh: () => state.run(),
  };
}
