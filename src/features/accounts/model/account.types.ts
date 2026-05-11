import { z } from 'zod';

import type { Uid } from '@/shared/lib/id';

/**
 * 与 Keystone REST 对齐（/accounts/current、IKeystoneQueryService.GetAccountAsync）：
 * - uid：long → string
 * - type："personal" / "organization"
 * - status："active" / "suspended" / "deleted"
 */
export const accountTypeValues = ['personal', 'organization'] as const;
export type AccountType = (typeof accountTypeValues)[number];

export const accountStatusValues = ['active', 'suspended', 'deleted'] as const;
export type AccountStatus = (typeof accountStatusValues)[number];

export const accountSchema = z.object({
  uid: z.string().min(1),
  type: z.enum(accountTypeValues),
  name: z.string(),
  slug: z.string(),
  status: z.enum(accountStatusValues),
  /** Mock 扩展：方便平台视图列表展示，**真实 BFF 不一定返回**，UI 用可选呈现。 */
  ownerIamUserUid: z.string().optional(),
  ownerDisplayName: z.string().optional(),
  ownerEmail: z.string().optional(),
  iamUserCount: z.number().int().nonnegative().optional(),
  createdAtUtc: z.string().optional(),
  updatedAtUtc: z.string().optional(),
});

export type Account = z.infer<typeof accountSchema>;

export interface AccountListFilter {
  keyword: string;
  type: AccountType | 'all';
  status: AccountStatus | 'all';
}

export const accountTypeLabel: Readonly<Record<AccountType, string>> = {
  personal: '个人账户',
  organization: '组织账户',
};

export const accountStatusLabel: Readonly<Record<AccountStatus, string>> = {
  active: '活跃',
  suspended: '已停用',
  deleted: '已删除',
};

export const accountStatusTone: Readonly<Record<AccountStatus, 'success' | 'warning' | 'danger'>> = {
  active: 'success',
  suspended: 'warning',
  deleted: 'danger',
};

export type AccountUid = Uid;
