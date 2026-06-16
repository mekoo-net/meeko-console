import type { RechargeRecord } from '@/features/billing/model/billing.types';

import type {
  ReferralAccountSummary,
  ReferralInvitee,
  ReferralRebate,
  ReferralWithdrawalAdmin,
} from '../../model/referral.types';

const BASE = new Date('2026-04-01T12:00:00Z').getTime();
const DAY = 86_400_000;

interface AccountReferralBundle {
  summary: ReferralAccountSummary;
  invitees: ReferralInvitee[];
  rebates: ReferralRebate[];
  withdrawals: ReferralWithdrawalAdmin[];
}

const INVITER_UID = '100000000001';
const INVITEE1_UID = '100000000002';
const INVITEE2_UID = '100000000003';
const GEEK_INVITEE_UID = '100000000099';

const bundles = new Map<string, AccountReferralBundle>();

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function seedBundles(): void {
  const inviterRebates: ReferralRebate[] = [
    {
      id: 'RB-10001',
      sourceAccountUid: INVITEE1_UID,
      sourceLabel: '极客实验室',
      rechargeAmount: 350,
      rebateRatePercent: 5,
      rebateAmount: 17.5,
      currency: 'CNY',
      occurredAtUtc: BASE - 45 * DAY,
      linkedRechargeId: 'RC20260312000001001',
    },
    {
      id: 'RB-10002',
      sourceAccountUid: INVITEE2_UID,
      sourceLabel: '张三',
      rechargeAmount: 80,
      rebateRatePercent: 5,
      rebateAmount: 4,
      currency: 'CNY',
      occurredAtUtc: BASE - 28 * DAY,
      linkedRechargeId: 'RC20260328000001002',
    },
    {
      id: 'RB-10003',
      sourceAccountUid: INVITEE1_UID,
      sourceLabel: '极客实验室',
      rechargeAmount: 200,
      rebateRatePercent: 5,
      rebateAmount: 10,
      currency: 'CNY',
      occurredAtUtc: BASE - 12 * DAY,
      linkedRechargeId: 'RC20260415000001003',
    },
  ];

  const inviterWithdrawals: ReferralWithdrawalAdmin[] = [
    {
      id: '30001',
      amount: 80,
      currency: 'CNY',
      method: 'alipay',
      accountNo: '138****8001',
      accountName: '张三',
      status: 'pending',
      appliedAtUtc: BASE - 6 * 3_600_000,
    },
    {
      id: '30002',
      amount: 120,
      currency: 'CNY',
      method: 'bank',
      accountNo: '6222****1234',
      accountName: '张三',
      status: 'approved',
      appliedAtUtc: BASE - 2 * DAY,
      reviewedAtUtc: BASE - DAY,
    },
    {
      id: '30003',
      amount: 50,
      currency: 'CNY',
      method: 'alipay',
      accountNo: '138****8001',
      accountName: '张三',
      status: 'paid',
      appliedAtUtc: BASE - 20 * DAY,
      reviewedAtUtc: BASE - 19 * DAY,
      paidAtUtc: BASE - 18 * DAY,
    },
  ];

  const inviterTotal = round2(inviterRebates.reduce((s, r) => s + r.rebateAmount, 0));
  const inviterWithdrawn = 50;
  const inviterFrozen = 80 + 120;

  bundles.set(INVITER_UID, {
    summary: {
      inviteCount: 2,
      totalRebateAmount: inviterTotal,
      withdrawableAmount: round2(inviterTotal - inviterWithdrawn - inviterFrozen),
      withdrawnAmount: inviterWithdrawn,
      currency: 'CNY',
    },
    invitees: [
      {
        accountUid: INVITEE1_UID,
        displayName: '极客实验室',
        email: 'owner@geek.test',
        phone: '13900139002',
        type: 'organization',
        registeredAtUtc: BASE - 60 * DAY,
        hasRecharged: true,
        contributedRebateAmount: 27.5,
        lastLoginAtUtc: BASE - 2 * DAY,
        lastLoginIp: '203.0.113.18',
        status: 'active',
      },
      {
        accountUid: INVITEE2_UID,
        displayName: '张三',
        email: 'zhang@personal.test',
        phone: '13700137003',
        type: 'personal',
        registeredAtUtc: BASE - 30 * DAY,
        hasRecharged: true,
        contributedRebateAmount: 4,
        lastLoginAtUtc: BASE - 5 * 3_600_000,
        lastLoginIp: '198.51.100.77',
        status: 'active',
      },
    ],
    rebates: inviterRebates,
    withdrawals: inviterWithdrawals,
  });

  const geekRebates: ReferralRebate[] = [
    {
      id: 'RB-20001',
      sourceAccountUid: GEEK_INVITEE_UID,
      sourceLabel: '李四',
      rechargeAmount: 160,
      rebateRatePercent: 5,
      rebateAmount: 8,
      currency: 'CNY',
      occurredAtUtc: BASE - 8 * DAY,
      linkedRechargeId: 'RC20260423000002001',
    },
  ];

  bundles.set(INVITEE1_UID, {
    summary: {
      inviteCount: 1,
      totalRebateAmount: 8,
      withdrawableAmount: 8,
      withdrawnAmount: 0,
      currency: 'CNY',
    },
    invitees: [
      {
        accountUid: GEEK_INVITEE_UID,
        displayName: '李四',
        email: 'lisi@example.com',
        phone: '13600136099',
        type: 'personal',
        registeredAtUtc: BASE - 15 * DAY,
        hasRecharged: true,
        contributedRebateAmount: 8,
        lastLoginAtUtc: BASE - 9 * DAY,
        lastLoginIp: '192.0.2.45',
        status: 'active',
      },
    ],
    rebates: geekRebates,
    withdrawals: [],
  });
}

seedBundles();

function emptyBundle(): AccountReferralBundle {
  return {
    summary: {
      inviteCount: 0,
      totalRebateAmount: 0,
      withdrawableAmount: 0,
      withdrawnAmount: 0,
      currency: 'CNY',
    },
    invitees: [],
    rebates: [],
    withdrawals: [],
  };
}

function getBundle(accountUid: string): AccountReferralBundle {
  return bundles.get(accountUid) ?? emptyBundle();
}

export function getReferralSummary(accountUid: string): ReferralAccountSummary {
  return getBundle(accountUid).summary;
}

export function getReferralInvitees(accountUid: string): ReferralInvitee[] {
  return [...getBundle(accountUid).invitees];
}

export function getReferralRebates(accountUid: string): ReferralRebate[] {
  return [...getBundle(accountUid).rebates].sort((a, b) => b.occurredAtUtc - a.occurredAtUtc);
}

export function getReferralWithdrawals(accountUid: string): ReferralWithdrawalAdmin[] {
  return [...getBundle(accountUid).withdrawals].sort((a, b) => b.appliedAtUtc - a.appliedAtUtc);
}

export function referralRechargesForAccount(accountUid: string): RechargeRecord[] {
  return getReferralRebates(accountUid).map((r) => ({
    id: r.linkedRechargeId,
    owner: { accountUid },
    source: {
      provider: 'referral_rebate',
      scene: 99,
      refNo: `REF-${r.id}`,
    },
    amount: { value: r.rebateAmount, currency: r.currency },
    status: 'paid',
    operatorIamId: null,
    createdAtUtc: r.occurredAtUtc,
    paidAtUtc: r.occurredAtUtc,
  }));
}
