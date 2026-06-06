import { isMockMode } from '@/shared/runtime';
import { ReferralWithdrawalHttpAdapter } from '@/shared/api/adapters/referralWithdrawalAdapter';

import { ReferralWithdrawalMock } from './mock/referralWithdrawalMock';
import type { ReferralWithdrawalPort } from './ports/referralWithdrawalPort';

let port: ReferralWithdrawalPort | null = null;

export function getReferralWithdrawalPort(): ReferralWithdrawalPort {
  if (!port) {
    port = isMockMode ? new ReferralWithdrawalMock() : new ReferralWithdrawalHttpAdapter();
  }
  return port;
}
