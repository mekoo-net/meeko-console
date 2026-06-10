import { onMounted } from 'vue';

import { ok, type AppResult } from '@/shared/api/httpTypes';
import { useAsyncState } from '@/shared/composables/useAsyncState';

import type { StaffRoleListItem } from '../model/staff.types';
import { getStaffPort } from '../services';

/** 角色数量很少，一次拉全量作为下拉选项（id + name），不分页。 */
const OPTIONS_PAGE_SIZE = 200;

export function useStaffRoles() {
  const state = useAsyncState<StaffRoleListItem[], []>(
    async (): Promise<AppResult<StaffRoleListItem[]>> => {
      const res = await getStaffPort().listRoles({ page: 1, pageSize: OPTIONS_PAGE_SIZE });
      return res.success ? ok(res.data.items) : res;
    },
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
