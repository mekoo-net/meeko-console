import { createUidSeq, type Uid } from '@/shared/lib/id';

import type { Account, Achievement, OAuthBinding, OAuthProvider } from '../../model/account.types';
import { findAchievementDef } from '../../model/achievementCatalog';
import { computeTier } from '../../model/tierConfig';
import type { IamUser } from '../../model/iamUser.types';

const accountUid = createUidSeq(100_000_000_000);
const iamUid = createUidSeq(200_000_000);

interface SeedAccount {
  /** Account 展示名：组织名或个人昵称。 */
  displayName: string;
  type: Account['type'];
  status: Account['status'];
  /** Owner 手机号（Mock 扩展，用于列表展示） */
  ownerPhone?: string;
  /** 注册至今的天数（Mock 扩展，构造差异化的 createdAtUtc 用） */
  createdDaysAgo: number;
  /** 最近活跃距今的小时数（Mock 扩展，构造差异化的 lastActiveAtUtc 用） */
  lastActiveHoursAgo: number;
  /** 累积充值金额（元），用于自动算 tier。 */
  totalRechargedAmount: number;
  /** OAuth 已绑定的 provider 列表。 */
  oauthProviders: readonly OAuthProvider[];
  /** 已授予的勋章 code（须存在于勋章库）。 */
  achievementCodes: readonly string[];
  iamUsers: Array<{
    username: string;
    displayName: string;
    email?: string;
    role: 'Owner' | 'Admin' | 'Member';
    status?: IamUser['status'];
    isAccountOwner?: boolean;
  }>;
}

const seeds: readonly SeedAccount[] = [
  {
    displayName: 'Meeko Demo Org',
    type: 'organization',
    status: 'active',
    ownerPhone: '13800138001',
    createdDaysAgo: 90,
    lastActiveHoursAgo: 24,
    totalRechargedAmount: 1200,
    oauthProviders: ['wechat', 'github'],
    achievementCodes: [
      'first-recharge',
      'spend-1k',
      'spend-10k',
      'early-bird',
      'vip',
      'multi-business',
      'loyal',
      'invoice-king',
      'referrer',
      'api-power',
    ],
    iamUsers: [
      { username: 'demo-owner', displayName: '组织主', email: 'owner@demo.test', role: 'Owner', isAccountOwner: true },
      { username: 'admin', displayName: '系统管理员', email: 'admin@demo.test', role: 'Admin' },
      { username: 'alice', displayName: 'Alice 运营', email: 'alice@demo.test', role: 'Member' },
      { username: 'bob', displayName: 'Bob 开发', email: 'bob@demo.test', role: 'Member', status: 'disabled' },
    ],
  },
  {
    displayName: '极客实验室',
    type: 'organization',
    status: 'active',
    ownerPhone: '13900139002',
    createdDaysAgo: 60,
    lastActiveHoursAgo: 5 * 24,
    totalRechargedAmount: 350,
    oauthProviders: ['github'],
    achievementCodes: ['first-recharge', 'beta-tester', 'night-owl', 'api-power', 'early-bird'],
    iamUsers: [
      { username: 'geek-owner', displayName: '极客 Owner', email: 'owner@geek.test', role: 'Owner', isAccountOwner: true },
      { username: 'lab-admin', displayName: '实验室管理', email: 'admin@geek.test', role: 'Admin' },
    ],
  },
  {
    displayName: '张三',
    type: 'personal',
    status: 'active',
    ownerPhone: '13700137003',
    createdDaysAgo: 30,
    lastActiveHoursAgo: 6,
    totalRechargedAmount: 80,
    oauthProviders: ['wechat', 'qq'],
    achievementCodes: ['first-recharge', 'night-owl'],
    iamUsers: [
      { username: 'zhangsan', displayName: '张三', email: 'zhang@personal.test', role: 'Owner', isAccountOwner: true },
    ],
  },
  {
    displayName: 'Closed Org',
    type: 'organization',
    status: 'suspended',
    createdDaysAgo: 365,
    lastActiveHoursAgo: 60 * 24,
    totalRechargedAmount: 25800,
    oauthProviders: [],
    achievementCodes: [
      'first-recharge',
      'spend-1k',
      'spend-10k',
      'early-bird',
      'vip',
      'multi-business',
      'loyal',
      'beta-tester',
      'invoice-king',
      'referrer',
      'night-owl',
      'api-power',
    ],
    iamUsers: [
      { username: 'closed-owner', displayName: '已停用主', email: 'closed@demo.test', role: 'Owner', isAccountOwner: true, status: 'disabled' },
    ],
  },
];

interface AccountStore {
  accounts: Map<Uid, Account>;
  /** accountUid → iamUser[] */
  iamUsers: Map<Uid, IamUser[]>;
}

function buildSeed(): AccountStore {
  const accounts = new Map<Uid, Account>();
  const iamUsers = new Map<Uid, IamUser[]>();
  const now = new Date('2026-04-01T12:00:00Z');
  const dayMs = 24 * 60 * 60 * 1000;
  const hourMs = 60 * 60 * 1000;

  const builtUids: string[] = [];

  let seedIndex = 0;
  for (const seed of seeds) {
    const uid = accountUid();
    builtUids.push(uid);
    seedIndex += 1;
    const users: IamUser[] = seed.iamUsers.map((u) => ({
      uid: iamUid(),
      accountUid: uid,
      username: u.username,
      displayName: u.displayName,
      email: u.email ?? null,
      role: u.role,
      isAccountOwner: u.isAccountOwner ?? false,
      status: u.status ?? 'active',
    }));
    const owner = users.find((u) => u.isAccountOwner);
    const createdAt = new Date(now.getTime() - seed.createdDaysAgo * dayMs);
    const lastActiveAt = new Date(now.getTime() - seed.lastActiveHoursAgo * hourMs);

    const oauthBindings: OAuthBinding[] = seed.oauthProviders.map((p, idx) => ({
      provider: p,
      externalUid: `${p}_${uid}_${idx}`,
      nickname: owner?.displayName,
      boundAtUtc: new Date(createdAt.getTime() + idx * hourMs).getTime(),
    }));

    const achievements: Achievement[] = seed.achievementCodes.flatMap((code, idx) => {
      const def = findAchievementDef(code);
      if (!def) return [];
      return [
        {
          code: def.code,
          name: def.name,
          description: def.description,
          icon: def.icon,
          image: def.image ?? null,
          grantedAtUtc: new Date(createdAt.getTime() + (idx + 1) * dayMs).getTime(),
        },
      ];
    });

    const walletAt = lastActiveAt.getTime();
    const available = Math.round(seed.totalRechargedAmount * 0.85 * 100) / 100;
    const held = Math.round(seed.totalRechargedAmount * 0.05 * 100) / 100;
    const walletSummary = {
      available,
      held,
      currency: 'CNY',
      snapshotAtUtc: walletAt,
    };
    const wallet = {
      available,
      held,
      currency: 'CNY',
      updatedAtUtc: walletAt,
    };

    accounts.set(uid, {
      uid,
      displayName: seed.displayName,
      type: seed.type,
      status: seed.status,
      owner: {
        iamUserUid: owner?.uid,
        displayName: owner?.displayName,
        email: owner?.email ?? undefined,
        phone: seed.ownerPhone,
      },
      iamUserCount: users.length,
      createdAtUtc: createdAt.getTime(),
      updatedAtUtc: lastActiveAt.getTime(),
      lastActiveAtUtc: lastActiveAt.getTime(),
      lastActiveIp: `203.0.113.${seedIndex}`,
      tier: computeTier(seed.totalRechargedAmount),
      totalRechargedAmount: seed.totalRechargedAmount,
      inviteCount: 0,
      oauthBindings: oauthBindings.length > 0 ? oauthBindings : undefined,
      achievements: achievements.length > 0 ? achievements : undefined,
      walletSummary,
      wallet,
    });
    iamUsers.set(uid, users);
  }

  const inviterUid = builtUids[0];
  const inviteeUid1 = builtUids[1];
  const inviteeUid2 = builtUids[2];
  if (inviterUid && inviteeUid1 && inviteeUid2) {
    const inviter = accounts.get(inviterUid);
    if (inviter) {
      accounts.set(inviterUid, { ...inviter, inviteCount: 2 });
    }
    for (const inviteeUid of [inviteeUid1, inviteeUid2]) {
      const invitee = accounts.get(inviteeUid);
      if (!invitee || !inviter) continue;
      accounts.set(inviteeUid, {
        ...invitee,
        inviter: {
          uid: inviterUid,
          displayName: inviter.owner.displayName ?? inviter.displayName,
          email: inviter.owner.email,
          phone: inviter.owner.phone,
        },
        rebateRatePercent: inviteeUid === inviteeUid2 ? 15 : null,
        inviteCount: inviteeUid === inviteeUid1 ? 1 : 0,
      });
    }
  }

  return { accounts, iamUsers };
}

let store: AccountStore | null = null;

export function getStore(): AccountStore {
  if (store === null) store = buildSeed();
  return store;
}

export function nextIamUid(): Uid {
  return iamUid();
}
