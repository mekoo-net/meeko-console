import type { ReferralWithdrawal } from '../../model/referral.types';

const now = new Date('2026-04-01T12:00:00Z').getTime();

export const seedWithdrawals: ReferralWithdrawal[] = [
  {
    id: '30001',
    account: { uid: '100000000001', displayName: 'Meeko Demo Org', email: 'owner@demo.test' },
    amount: { value: 80, currency: 'CNY' },
    payout: { method: 'alipay', accountNo: '138****8001', accountName: '张三' },
    status: 'pending',
    appliedAtUtc: now - 6 * 3_600_000,
  },
  {
    id: '30002',
    account: { uid: '100000000001', displayName: 'Meeko Demo Org', email: 'owner@demo.test' },
    amount: { value: 120, currency: 'CNY' },
    payout: { method: 'bank', accountNo: '6222****1234', accountName: '张三' },
    status: 'approved',
    appliedAtUtc: now - 2 * 86_400_000,
    reviewedAtUtc: now - 86_400_000,
  },
  {
    id: '30003',
    account: { uid: '100000000003', displayName: '张三', email: 'zhang@personal.test' },
    amount: { value: 50, currency: 'CNY' },
    payout: { method: 'alipay', accountNo: '137****7003', accountName: '张三' },
    status: 'paid',
    appliedAtUtc: now - 15 * 86_400_000,
    reviewedAtUtc: now - 14 * 86_400_000,
    paidAtUtc: now - 13 * 86_400_000,
  },
];

let store: ReferralWithdrawal[] | null = null;

export function getWithdrawalStore(): ReferralWithdrawal[] {
  if (!store) store = seedWithdrawals.map((w) => ({ ...w }));
  return store;
}
