import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { delay } from '@/shared/lib/delay';
import { clientPaginate } from '@/shared/composables/usePagination';

import {
  referralWithdrawalSchema,
  type ReferralWithdrawal,
} from '../../model/referral.types';
import type {
  ListReferralWithdrawalsInput,
  ListReferralWithdrawalsOutput,
  ReferralWithdrawalPort,
} from '../ports/referralWithdrawalPort';
import { getWithdrawalStore } from './data';

function parse(value: unknown): AppResult<ReferralWithdrawal> {
  const r = referralWithdrawalSchema.safeParse(value);
  return r.success
    ? ok(r.data)
    : fail({ code: 'validation', message: '提现记录数据格式错误' });
}

export class ReferralWithdrawalMock implements ReferralWithdrawalPort {
  async list(input: ListReferralWithdrawalsInput): Promise<AppResult<ListReferralWithdrawalsOutput>> {
    await delay();
    const all = getWithdrawalStore().filter((w) =>
      input.filter.status === 'all' ? true : w.status === input.filter.status,
    );
    all.sort((a, b) => b.appliedAtUtc - a.appliedAtUtc);
    const items = clientPaginate(all, input.page, input.pageSize);
    return ok({ items, total: all.length });
  }

  async approve(id: string): Promise<AppResult<ReferralWithdrawal>> {
    await delay();
    const store = getWithdrawalStore();
    const idx = store.findIndex((w) => w.id === id);
    if (idx < 0) return fail({ code: 'not_found', message: '提现申请不存在' });
    const current = store[idx];
    if (!current || current.status !== 'pending') {
      return fail({ code: 'validation', message: '仅待审核申请可通过' });
    }
    const next: ReferralWithdrawal = {
      ...current,
      status: 'approved',
      reviewedAtUtc: Date.now(),
    };
    store[idx] = next;
    return parse(next);
  }

  async reject(id: string, reason: string): Promise<AppResult<ReferralWithdrawal>> {
    await delay();
    const store = getWithdrawalStore();
    const idx = store.findIndex((w) => w.id === id);
    if (idx < 0) return fail({ code: 'not_found', message: '提现申请不存在' });
    const current = store[idx];
    if (!current || current.status !== 'pending') {
      return fail({ code: 'validation', message: '仅待审核申请可驳回' });
    }
    const next: ReferralWithdrawal = {
      ...current,
      status: 'rejected',
      rejectReason: reason,
      reviewedAtUtc: Date.now(),
    };
    store[idx] = next;
    return parse(next);
  }

  async markPaid(id: string): Promise<AppResult<ReferralWithdrawal>> {
    await delay();
    const store = getWithdrawalStore();
    const idx = store.findIndex((w) => w.id === id);
    if (idx < 0) return fail({ code: 'not_found', message: '提现申请不存在' });
    const current = store[idx];
    if (!current || current.status !== 'approved') {
      return fail({ code: 'validation', message: '仅已通过申请可标记打款' });
    }
    const next: ReferralWithdrawal = {
      ...current,
      status: 'paid',
      paidAtUtc: Date.now(),
    };
    store[idx] = next;
    return parse(next);
  }
}
