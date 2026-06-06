import {
  referralWithdrawalSchema,
  type ReferralWithdrawal,
} from '@/features/referral/model/referral.types';
import type {
  ListReferralWithdrawalsInput,
  ListReferralWithdrawalsOutput,
  ReferralWithdrawalPort,
} from '@/features/referral/services/ports/referralWithdrawalPort';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { apiFetch } from '@/shared/api/httpClient';
import { asEpochMillis, asEpochMillisNullable } from '@/shared/lib/epoch';

const BASE = '/api/admin/referral/withdrawals';

function mapRow(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    id: String(raw.id ?? ''),
    accountUid: String(raw.accountUid ?? raw.account_uid ?? ''),
    accountDisplayName:
      typeof raw.accountDisplayName === 'string'
        ? raw.accountDisplayName
        : typeof raw.account_display_name === 'string'
          ? raw.account_display_name
          : undefined,
    accountEmail:
      typeof raw.accountEmail === 'string'
        ? raw.accountEmail
        : typeof raw.account_email === 'string'
          ? raw.account_email
          : undefined,
    amount: raw.amount,
    currency: raw.currency ?? 'CNY',
    method: raw.method,
    accountNo: raw.accountNo ?? raw.account_no,
    accountName: raw.accountName ?? raw.account_name,
    status: raw.status,
    rejectReason: raw.rejectReason ?? raw.reject_reason ?? null,
    appliedAtUtc: asEpochMillis(raw.appliedAtUtc ?? raw.applied_at_utc) ?? 0,
    reviewedAtUtc: asEpochMillisNullable(raw.reviewedAtUtc ?? raw.reviewed_at_utc),
    paidAtUtc: asEpochMillisNullable(raw.paidAtUtc ?? raw.paid_at_utc),
  };
}

function parseWithdrawal(value: unknown): AppResult<ReferralWithdrawal> {
  const mapped =
    value && typeof value === 'object' ? mapRow(value as Record<string, unknown>) : value;
  const r = referralWithdrawalSchema.safeParse(mapped);
  return r.success
    ? ok(r.data)
    : fail({ code: 'validation', message: '提现记录数据格式错误' });
}

function buildQuery(input: ListReferralWithdrawalsInput): string {
  const params = new URLSearchParams({
    page: String(input.page),
    pageSize: String(input.pageSize),
  });
  if (input.filter.status !== 'all') params.set('status', input.filter.status);
  return params.toString();
}

export class ReferralWithdrawalHttpAdapter implements ReferralWithdrawalPort {
  async list(input: ListReferralWithdrawalsInput): Promise<AppResult<ListReferralWithdrawalsOutput>> {
    const res = await apiFetch<{ items: unknown[]; total: number }>(`${BASE}?${buildQuery(input)}`);
    if (!res.success) return res;
    const items: ReferralWithdrawal[] = [];
    for (const row of res.data.items) {
      const parsed = parseWithdrawal(row);
      if (!parsed.success) return parsed;
      items.push(parsed.data);
    }
    return ok({ items, total: res.data.total });
  }

  async approve(id: string): Promise<AppResult<ReferralWithdrawal>> {
    const res = await apiFetch<unknown>(`${BASE}/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
    });
    if (!res.success) return res;
    return parseWithdrawal(res.data);
  }

  async reject(id: string, reason: string): Promise<AppResult<ReferralWithdrawal>> {
    const res = await apiFetch<unknown>(`${BASE}/${encodeURIComponent(id)}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    if (!res.success) return res;
    return parseWithdrawal(res.data);
  }

  async markPaid(id: string): Promise<AppResult<ReferralWithdrawal>> {
    const res = await apiFetch<unknown>(`${BASE}/${encodeURIComponent(id)}/mark_paid`, {
      method: 'POST',
    });
    if (!res.success) return res;
    return parseWithdrawal(res.data);
  }
}
