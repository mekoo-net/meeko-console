import { createUidSeq, type Uid } from '@/shared/lib/id';

import type { Account } from '../../model/account.types';
import type { IamUser } from '../../model/iamUser.types';

const accountUid = createUidSeq(100_000_000);
const iamUid = createUidSeq(200_000_000);

interface SeedAccount {
  name: string;
  slug: string;
  type: Account['type'];
  status: Account['status'];
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
    iamUsers: [
      { username: 'zhangsan', displayName: '张三', email: 'zhang@personal.test', role: 'Owner', isAccountOwner: true },
    ],
  },
  {
    name: 'Closed Org',
    slug: 'closed',
    type: 'organization',
    status: 'suspended',
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
    accounts.set(uid, {
      uid,
      type: seed.type,
      name: seed.name,
      slug: seed.slug,
      status: seed.status,
      ownerIamUserUid: owner?.uid,
      ownerDisplayName: owner?.displayName,
      ownerEmail: owner?.email ?? undefined,
      iamUserCount: users.length,
      createdAtUtc: now.toISOString(),
      updatedAtUtc: now.toISOString(),
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
