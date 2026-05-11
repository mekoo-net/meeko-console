import { ref, type Ref } from 'vue';

import { fail, mapUnknownError, type AppResult } from '@/shared/api/httpTypes';

import type { CreateRechargeInput, RechargeIntent } from '../model/billing.types';
import { getBillingPort } from '../services';

export function useRecharge(accountUid: Ref<string | null>) {
  const loading = ref(false);

  async function create(input: CreateRechargeInput): Promise<AppResult<RechargeIntent>> {
    const uid = accountUid.value;
    if (!uid) return fail({ code: 'validation', message: '未选择账户' });
    loading.value = true;
    try {
      return await getBillingPort().createRecharge(uid, input);
    } catch (e) {
      return fail(mapUnknownError(e));
    } finally {
      loading.value = false;
    }
  }

  return { loading, create };
}
