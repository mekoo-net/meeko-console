import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { clientPaginate } from '@/shared/composables/usePagination';
import { delay } from '@/shared/lib/delay';

import {
  referralAccountSummarySchema,
  referralInviteeSchema,
  referralRebateSchema,
  referralWithdrawalAdminSchema,
  type ReferralAccountSummary,
  type ReferralInvitee,
  type ReferralRebate,
  type ReferralWithdrawalAdmin,
} from '../../model/referral.types';
import type {
  ListReferralInviteesPage,
  ListReferralRebatesPage,
  ListReferralWithdrawalsPage,
  ReferralAdminPort,
} from '../ports/referralAdminPort';
import {
  getReferralInvitees,
  getReferralRebates,
  getReferralSummary,
  getReferralWithdrawals,
} from './referralData';

function parseSummary(value: unknown): AppResult<ReferralAccountSummary> {
  const r = referralAccountSummarySchema.safeParse(value);
  return r.success
    ? ok(r.data)
    : fail({
        code: 'validation',
        message: 'ReferralAccountSummary 数据格式错误',
        details: r.error.flatten().fieldErrors as Record<string, string[]>,
      });
}

function parseInviteesPage(
  rows: unknown[],
  total: number,
): AppResult<ListReferralInviteesPage> {
  const parsed: ReferralInvitee[] = [];
  for (const row of rows) {
    const r = referralInviteeSchema.safeParse(row);
    if (!r.success) {
      return fail({
        code: 'validation',
        message: 'ReferralInvitee 数据格式错误',
        details: r.error.flatten().fieldErrors as Record<string, string[]>,
      });
    }
    parsed.push(r.data);
  }
  return ok({ items: parsed, total });
}

function parseRebatesPage(
  rows: unknown[],
  total: number,
): AppResult<ListReferralRebatesPage> {
  const parsed: ReferralRebate[] = [];
  for (const row of rows) {
    const r = referralRebateSchema.safeParse(row);
    if (!r.success) {
      return fail({
        code: 'validation',
        message: 'ReferralRebate 数据格式错误',
        details: r.error.flatten().fieldErrors as Record<string, string[]>,
      });
    }
    parsed.push(r.data);
  }
  return ok({ items: parsed, total });
}

function parseWithdrawalsPage(
  rows: unknown[],
  total: number,
): AppResult<ListReferralWithdrawalsPage> {
  const parsed: ReferralWithdrawalAdmin[] = [];
  for (const row of rows) {
    const r = referralWithdrawalAdminSchema.safeParse(row);
    if (!r.success) {
      return fail({
        code: 'validation',
        message: 'ReferralWithdrawalAdmin 数据格式错误',
        details: r.error.flatten().fieldErrors as Record<string, string[]>,
      });
    }
    parsed.push(r.data);
  }
  return ok({ items: parsed, total });
}

export class ReferralAdminMock implements ReferralAdminPort {
  async getSummary(accountUid: string): Promise<AppResult<ReferralAccountSummary>> {
    await delay();
    return parseSummary(getReferralSummary(accountUid));
  }

  async listInvitees(
    accountUid: string,
    input: { page: number; pageSize: number },
  ): Promise<AppResult<ListReferralInviteesPage>> {
    await delay();
    const all = getReferralInvitees(accountUid);
    const items = clientPaginate(all, input.page, input.pageSize);
    return parseInviteesPage(items, all.length);
  }

  async listRebates(
    accountUid: string,
    input: { page: number; pageSize: number },
  ): Promise<AppResult<ListReferralRebatesPage>> {
    await delay();
    const all = getReferralRebates(accountUid);
    const items = clientPaginate(all, input.page, input.pageSize);
    return parseRebatesPage(items, all.length);
  }

  async listWithdrawals(
    accountUid: string,
    input: { page: number; pageSize: number },
  ): Promise<AppResult<ListReferralWithdrawalsPage>> {
    await delay();
    const all = getReferralWithdrawals(accountUid);
    const items = clientPaginate(all, input.page, input.pageSize);
    return parseWithdrawalsPage(items, all.length);
  }
}
