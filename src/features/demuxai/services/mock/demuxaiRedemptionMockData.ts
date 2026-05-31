import { getStore } from '@/features/accounts/services/mock/data';
import { displayAmountToQuota } from '@/shared/lib/quota';

import type {
  RedemptionAccount,
  RedemptionClaim,
  RedemptionCode,
  RedemptionStaff,
} from '../../model/redemption.types';

function ts(y: number, m: number, d: number, h = 0, min = 0): number {
  return Date.UTC(y, m - 1, d, h, min, 0);
}

export const MOCK_STAFF_ADMIN: RedemptionStaff = {
  uid: '800000001',
  displayName: '系统管理员',
  username: 'admin',
};

export const MOCK_STAFF_OPS: RedemptionStaff = {
  uid: '800000002',
  displayName: '运营小李',
  username: 'ops-li',
};

function accountRef(uid: string): RedemptionAccount | null {
  const acc = getStore().accounts.get(uid);
  if (!acc) return null;
  return {
    uid: acc.uid,
    owner: {
      email: acc.ownerEmail,
      displayName: acc.ownerDisplayName,
    },
  };
}

function safeClaim(uid: string, redeemedTime: number): RedemptionClaim[] {
  const account = accountRef(uid);
  if (!account) return [];
  return [{ account, redeemedTime }];
}

function buildSpringClaims(): RedemptionClaim[] {
  const uids = ['100000000', '100000001', '100000002', '100000003', '100000004'];
  const claims: RedemptionClaim[] = [];
  const base = ts(2026, 1, 25, 9);
  for (let i = 0; i < 32; i++) {
    const uid = uids[i % uids.length]!;
    const acc = accountRef(uid);
    if (!acc) continue;
    claims.push({
      account: acc,
      redeemedTime: base + i * 4 * 3600 * 1000,
    });
  }
  return claims.sort((a, b) => b.redeemedTime - a.redeemedTime);
}

/** 兑换码 Mock 种子数据（模块单例，与 demuxai/data.ts 同理）。 */
export function buildRedemptionSeed(): RedemptionCode[] {
  const u0 = '100000000';
  const admin = MOCK_STAFF_ADMIN;
  const ops = MOCK_STAFF_OPS;
  const springClaims = buildSpringClaims();

  return [
    {
      id: 1013,
      name: '2026 春节活动',
      key: 'CDK-SPRING-FEST-2026',
      status: 1,
      quota: displayAmountToQuota(20),
      maxRedemptions: 50,
      redeemedCount: springClaims.length,
      createdTime: ts(2026, 1, 20, 10),
      redeemedTime: springClaims[0]?.redeemedTime ?? null,
      account: springClaims[0]?.account ?? null,
      claims: springClaims,
      createdBy: admin,
      expiredTime: ts(2026, 2, 28, 23, 59),
    },
    {
      id: 1001,
      name: '新用户礼包',
      key: 'CDK-DEMO-2026-A1B2',
      status: 1,
      quota: displayAmountToQuota(1),
      maxRedemptions: 1,
      redeemedCount: 0,
      createdTime: ts(2026, 5, 15, 8),
      redeemedTime: null,
      account: null,
      claims: [],
      createdBy: admin,
      expiredTime: null,
    },
    {
      id: 1003,
      name: '单次体验码',
      key: 'CDK-SPRING-88-USED',
      status: 2,
      quota: displayAmountToQuota(1),
      maxRedemptions: 1,
      redeemedCount: 1,
      createdTime: ts(2026, 2, 10, 2),
      redeemedTime: ts(2026, 2, 12, 14, 30),
      account: accountRef(u0),
      claims: safeClaim(u0, ts(2026, 2, 12, 14, 30)),
      createdBy: admin,
      expiredTime: null,
    },
    {
      id: 1005,
      name: '企业试用',
      key: 'CDK-ENT-TRIAL-500',
      status: 1,
      quota: displayAmountToQuota(500),
      maxRedemptions: 1,
      redeemedCount: 0,
      createdTime: ts(2026, 4, 1),
      redeemedTime: null,
      account: null,
      claims: [],
      createdBy: admin,
      expiredTime: ts(2026, 12, 31),
    },
    {
      id: 1007,
      name: '618 预售',
      key: 'CDK-618-PRESALE-20',
      status: 1,
      quota: displayAmountToQuota(20),
      maxRedemptions: 1,
      redeemedCount: 0,
      createdTime: ts(2026, 5, 18, 10),
      redeemedTime: null,
      account: null,
      claims: [],
      createdBy: ops,
      expiredTime: ts(2026, 6, 18),
    },
    {
      id: 1012,
      name: '内测补偿',
      key: 'CDK-BETA-COMP-15',
      status: 2,
      quota: displayAmountToQuota(15),
      maxRedemptions: 1,
      redeemedCount: 1,
      createdTime: ts(2026, 4, 22),
      redeemedTime: ts(2026, 4, 25, 11, 20),
      account: accountRef(u0),
      claims: safeClaim(u0, ts(2026, 4, 25, 11, 20)),
      createdBy: admin,
      expiredTime: null,
    },
  ];
}
