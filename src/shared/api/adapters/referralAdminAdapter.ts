import {
  referralAccountSummarySchema,
  referralInviteeSchema,
  referralRebateSchema,
  referralWithdrawalAdminSchema,
  type ReferralAccountSummary,
  type ReferralInvitee,
  type ReferralRebate,
  type ReferralWithdrawalAdmin,
} from '@/features/platform/accounts/model/referral.types';
import type {
  ListReferralInviteesPage,
  ListReferralRebatesPage,
  ListReferralWithdrawalsPage,
  ReferralAdminPort,
} from '@/features/platform/accounts/services/ports/referralAdminPort';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { request } from '@/shared/api/httpClient';
import { asEpochMillis, asEpochMillisNullable } from '@/shared/lib/epoch';

function base(uid: string): string {
  return `/api/admin/accounts/${encodeURIComponent(uid)}/referral`;
}

function buildPageQuery(input: { page: number; pageSize: number }): string {
  return new URLSearchParams({
    page: String(input.page),
    pageSize: String(input.pageSize),
  }).toString();
}

function extractRows(value: unknown): { rows: unknown[]; total: number } {
  if (Array.isArray(value)) {
    return { rows: value, total: value.length };
  }
  if (value && typeof value === 'object') {
    const raw = value as Record<string, unknown>;
    const rows = (raw.items ?? []) as unknown[];
    const total = typeof raw.total === 'number' ? raw.total : rows.length;
    return { rows: Array.isArray(rows) ? rows : [], total };
  }
  return { rows: [], total: 0 };
}

function parseSummary(value: unknown): AppResult<ReferralAccountSummary> {
  if (!value || typeof value !== 'object') {
    return fail({ code: 'validation', message: '返利汇总数据格式错误' });
  }
  const raw = value as Record<string, unknown>;
  const mapped = {
    inviteCount: typeof raw.inviteCount === 'number' ? raw.inviteCount : 0,
    totalRebateAmount: typeof raw.totalRebateAmount === 'number' ? raw.totalRebateAmount : 0,
    withdrawableAmount: typeof raw.withdrawableAmount === 'number' ? raw.withdrawableAmount : 0,
    withdrawnAmount: typeof raw.withdrawnAmount === 'number' ? raw.withdrawnAmount : 0,
    currency: typeof raw.currency === 'string' ? raw.currency : 'CNY',
  };
  const r = referralAccountSummarySchema.safeParse(mapped);
  return r.success
    ? ok(r.data)
    : fail({
        code: 'validation',
        message: '返利汇总数据格式错误',
        details: r.error.flatten().fieldErrors as Record<string, string[]>,
      });
}

function mapInvitee(raw: Record<string, unknown>): Record<string, unknown> {
  // 账户身份统一走嵌套 contact（AccountContactDto）。
  const contact = (raw.contact ?? null) as Record<string, unknown> | null;
  const rawType = contact?.accountType ?? contact?.type;
  return {
    accountUid: String(raw.accountUid ?? contact?.uid ?? ''),
    displayName: contact?.displayName,
    email: contact?.email,
    phone: contact?.phone,
    type: rawType === 'personal' || rawType === 'organization' ? rawType : undefined,
    registeredAtUtc: asEpochMillis(raw.registeredAtUtc) ?? 0,
    hasRecharged: Boolean(raw.hasRecharged),
    contributedRebateAmount:
      typeof raw.contributedRebateAmount === 'number' ? raw.contributedRebateAmount : 0,
    lastLoginAtUtc: asEpochMillisNullable(raw.lastLoginAtUtc),
    lastLoginIp: typeof raw.lastLoginIp === 'string' ? raw.lastLoginIp : undefined,
    status: raw.status ?? 'active',
  };
}

function mapRebate(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    id: String(raw.id ?? ''),
    sourceAccountUid: String(raw.sourceAccountUid ?? ''),
    sourceLabel: String(raw.sourceLabel ?? ''),
    rechargeAmount: typeof raw.rechargeAmount === 'number' ? raw.rechargeAmount : 0,
    rebateRatePercent: typeof raw.rebateRatePercent === 'number' ? raw.rebateRatePercent : 0,
    rebateAmount: typeof raw.rebateAmount === 'number' ? raw.rebateAmount : 0,
    currency: typeof raw.currency === 'string' ? raw.currency : 'CNY',
    occurredAtUtc: asEpochMillis(raw.occurredAtUtc) ?? 0,
    linkedRechargeId: String(raw.linkedRechargeId ?? ''),
  };
}

function mapWithdrawal(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    id: String(raw.id ?? ''),
    amount: typeof raw.amount === 'number' ? raw.amount : 0,
    currency: typeof raw.currency === 'string' ? raw.currency : 'CNY',
    method: raw.method ?? 'alipay',
    accountNo: String(raw.accountNo ?? ''),
    accountName: String(raw.accountName ?? ''),
    status: raw.status ?? 'pending',
    rejectReason: raw.rejectReason,
    appliedAtUtc: asEpochMillis(raw.appliedAtUtc) ?? 0,
    reviewedAtUtc: asEpochMillisNullable(raw.reviewedAtUtc),
    paidAtUtc: asEpochMillisNullable(raw.paidAtUtc),
  };
}

function parseInviteesPage(value: unknown): AppResult<ListReferralInviteesPage> {
  const { rows, total } = extractRows(value);
  const parsed: ReferralInvitee[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const r = referralInviteeSchema.safeParse(mapInvitee(row as Record<string, unknown>));
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

function parseRebatesPage(value: unknown): AppResult<ListReferralRebatesPage> {
  const { rows, total } = extractRows(value);
  const parsed: ReferralRebate[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const r = referralRebateSchema.safeParse(mapRebate(row as Record<string, unknown>));
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

function parseWithdrawalsPage(value: unknown): AppResult<ListReferralWithdrawalsPage> {
  const { rows, total } = extractRows(value);
  const parsed: ReferralWithdrawalAdmin[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const r = referralWithdrawalAdminSchema.safeParse(mapWithdrawal(row as Record<string, unknown>));
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

export class ReferralAdminHttpAdapter implements ReferralAdminPort {
  async getSummary(accountUid: string): Promise<AppResult<ReferralAccountSummary>> {
    const res = await request<unknown>(`${base(accountUid)}/summary`);
    if (!res.success) return res;
    return parseSummary(res.data);
  }

  async listInvitees(
    accountUid: string,
    input: { page: number; pageSize: number },
  ): Promise<AppResult<ListReferralInviteesPage>> {
    const res = await request<unknown>(
      `${base(accountUid)}/invitees?${buildPageQuery(input)}`,
    );
    if (!res.success) return res;
    return parseInviteesPage(res.data);
  }

  async listRebates(
    accountUid: string,
    input: { page: number; pageSize: number },
  ): Promise<AppResult<ListReferralRebatesPage>> {
    const res = await request<unknown>(
      `${base(accountUid)}/rebates?${buildPageQuery(input)}`,
    );
    if (!res.success) return res;
    return parseRebatesPage(res.data);
  }

  async listWithdrawals(
    accountUid: string,
    input: { page: number; pageSize: number },
  ): Promise<AppResult<ListReferralWithdrawalsPage>> {
    const res = await request<unknown>(
      `${base(accountUid)}/withdrawals?${buildPageQuery(input)}`,
    );
    if (!res.success) return res;
    return parseWithdrawalsPage(res.data);
  }
}
