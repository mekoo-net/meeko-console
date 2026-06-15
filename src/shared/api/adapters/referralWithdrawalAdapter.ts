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

function str(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === 'string') return v;
  }
  return undefined;
}

function mapRow(raw: Record<string, unknown>): Record<string, unknown> {
  // 申请账户块：兼容后端嵌套 account 对象与历史扁平 accountXxx 字段。
  const account = (raw.account ?? raw.Account) as Record<string, unknown> | undefined;
  const amount = (raw.amount ?? raw.Amount) as Record<string, unknown> | number | undefined;
  const payout = (raw.payout ?? raw.Payout) as Record<string, unknown> | undefined;

  return {
    id: String(raw.id ?? ''),
    account: {
      uid: String(account?.uid ?? raw.accountUid ?? raw.account_uid ?? ''),
      displayName: str(account?.displayName, raw.accountDisplayName, raw.account_display_name),
      email: str(account?.email, raw.accountEmail, raw.account_email),
    },
    amount: {
      value:
        amount != null && typeof amount === 'object'
          ? (amount.value ?? amount.Value)
          : (amount ?? raw.amount),
      currency:
        (amount != null && typeof amount === 'object'
          ? (amount.currency ?? amount.Currency)
          : raw.currency) ?? 'CNY',
    },
    payout: {
      method: payout?.method ?? raw.method,
      accountNo: payout?.accountNo ?? raw.accountNo ?? raw.account_no,
      accountName: payout?.accountName ?? raw.accountName ?? raw.account_name,
    },
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
    const res = await apiFetch<unknown>(`${BASE}/${encodeURIComponent(id)}/mark/paid`, {
      method: 'POST',
    });
    if (!res.success) return res;
    return parseWithdrawal(res.data);
  }
}
