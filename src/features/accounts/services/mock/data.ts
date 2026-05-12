import { createUidSeq, type Uid } from '@/shared/lib/id';

import type { Account, Achievement, OAuthBinding, OAuthProvider } from '../../model/account.types';
import { findAchievementDef } from '../../model/achievementCatalog';
import { computeTier } from '../../model/tierConfig';
import type { IamUser } from '../../model/iamUser.types';

const accountUid = createUidSeq(100_000_000);
const iamUid = createUidSeq(200_000_000);

interface SeedAccount {
  name: string;
  slug: string;
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
    name: 'Meeko Demo Org',
    slug: 'meeko-demo',
    type: 'organization',
    status: 'active',
    ownerPhone: '13800138001',
    createdDaysAgo: 90,
    lastActiveHoursAgo: 24,
    totalRechargedAmount: 1200,
    oauthProviders: ['wechat', 'github'],
    achievementCodes: ['first-recharge', 'spend-1k', 'early-bird'],
    iamUsers: [
      { username: 'demo-owner', displayName: '组织主', email: 'owner@demo.test', role: 'Owner', isAccountOwner: true },
      { username: 'admin', displayName: '系统管理员', email: 'admin@demo.test', role: 'Admin' },
      { username: 'alice', displayName: 'Alice 运营', email: 'alice@demo.test', role: 'Member' },
      { username: 'bob', displayName: 'Bob 开发', email: 'bob@demo.test', role: 'Member', status: 'disabled' },
    ],
  },
  {
    name: '极客实验室',
    slug: 'geeklab',
    type: 'organization',
    status: 'active',
    ownerPhone: '13900139002',
    createdDaysAgo: 60,
    lastActiveHoursAgo: 5 * 24,
    totalRechargedAmount: 350,
    oauthProviders: ['github'],
    achievementCodes: ['first-recharge', 'beta-tester'],
    iamUsers: [
      { username: 'geek-owner', displayName: '极客 Owner', email: 'owner@geek.test', role: 'Owner', isAccountOwner: true },
      { username: 'lab-admin', displayName: '实验室管理', email: 'admin@geek.test', role: 'Admin' },
    ],
  },
  {
    name: '个人工作台',
    slug: 'personal-zhang',
    type: 'personal',
    status: 'active',
    ownerPhone: '13700137003',
    createdDaysAgo: 30,
    lastActiveHoursAgo: 6,
    totalRechargedAmount: 80,
    oauthProviders: ['wechat', 'qq'],
    achievementCodes: ['first-recharge'],
    iamUsers: [
      { username: 'zhangsan', displayName: '张三', email: 'zhang@personal.test', role: 'Owner', isAccountOwner: true },
    ],
  },
  {
    name: 'Closed Org',
    slug: 'closed',
    type: 'organization',
    status: 'suspended',
    createdDaysAgo: 7,
    lastActiveHoursAgo: 60 * 24,
    totalRechargedAmount: 0,
    oauthProviders: [],
    achievementCodes: [],
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

  for (const seed of seeds) {
    const uid = accountUid();
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
      boundAtUtc: new Date(createdAt.getTime() + idx * hourMs).toISOString(),
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
          grantedAtUtc: new Date(createdAt.getTime() + (idx + 1) * dayMs).toISOString(),
        },
      ];
    });

    accounts.set(uid, {
      uid,
      type: seed.type,
      name: seed.name,
      slug: seed.slug,
      status: seed.status,
      ownerIamUserUid: owner?.uid,
      ownerDisplayName: owner?.displayName,
      ownerEmail: owner?.email ?? undefined,
      ownerPhone: seed.ownerPhone,
      iamUserCount: users.length,
      createdAtUtc: createdAt.toISOString(),
      updatedAtUtc: lastActiveAt.toISOString(),
      lastActiveAtUtc: lastActiveAt.toISOString(),
      tier: computeTier(seed.totalRechargedAmount),
      totalRechargedAmount: seed.totalRechargedAmount,
      oauthBindings: oauthBindings.length > 0 ? oauthBindings : undefined,
      achievements: achievements.length > 0 ? achievements : undefined,
    });
    iamUsers.set(uid, users);
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
