import type { AppResult } from '@/shared/api/httpTypes';

import type {
  ReferralAccountSummary,
  ReferralInvitee,
  ReferralRebate,
  ReferralWithdrawalAdmin,
} from '../../model/referral.types';

export interface ListReferralInviteesPage {
  items: ReferralInvitee[];
  total: number;
}

export interface ListReferralRebatesPage {
  items: ReferralRebate[];
  total: number;
}

export interface ListReferralWithdrawalsPage {
  items: ReferralWithdrawalAdmin[];
  total: number;
}

export interface ReferralAdminPort {
  getSummary(accountUid: string): Promise<AppResult<ReferralAccountSummary>>;
  listInvitees(
    accountUid: string,
    input: { page: number; pageSize: number },
  ): Promise<AppResult<ListReferralInviteesPage>>;
  listRebates(
    accountUid: string,
    input: { page: number; pageSize: number },
  ): Promise<AppResult<ListReferralRebatesPage>>;
  listWithdrawals(
    accountUid: string,
    input: { page: number; pageSize: number },
  ): Promise<AppResult<ListReferralWithdrawalsPage>>;
}
