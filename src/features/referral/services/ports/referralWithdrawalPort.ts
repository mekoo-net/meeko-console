import type { AppResult } from '@/shared/api/httpTypes';

import type { ReferralWithdrawal, ReferralWithdrawalFilter } from '../../model/referral.types';

export interface ListReferralWithdrawalsInput {
  page: number;
  pageSize: number;
  filter: ReferralWithdrawalFilter;
}

export interface ListReferralWithdrawalsOutput {
  items: ReferralWithdrawal[];
  total: number;
}

export interface ReferralWithdrawalPort {
  list(input: ListReferralWithdrawalsInput): Promise<AppResult<ListReferralWithdrawalsOutput>>;
  approve(id: string): Promise<AppResult<ReferralWithdrawal>>;
  reject(id: string, reason: string): Promise<AppResult<ReferralWithdrawal>>;
  markPaid(id: string): Promise<AppResult<ReferralWithdrawal>>;
}
