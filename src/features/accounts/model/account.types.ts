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

export const oauthProviderValues = ['wechat', 'qq', 'github', 'google'] as const;
export type OAuthProvider = (typeof oauthProviderValues)[number];

export const OAuthProviderLabel: Readonly<Record<OAuthProvider, string>> = {
  wechat: '微信',
  qq: 'QQ',
  github: 'GitHub',
  google: 'Google',
};

export const oauthBindingSchema = z.object({
  provider: z.enum(oauthProviderValues),
  /** 第三方平台的用户 ID（OpenID 等） */
  externalUid: z.string(),
  /** 显示昵称，可选 */
  nickname: z.string().optional(),
  boundAtUtc: z.string(),
});

export type OAuthBinding = z.infer<typeof oauthBindingSchema>;

export const achievementSchema = z.object({
  /** 业务 code，与勋章库主键对齐 */
  code: z.string(),
  name: z.string(),
  description: z.string(),
  /** emoji（fallback 时的核心符号） */
  icon: z.string(),
  /** 勋章插画 URL（SVG / PNG / JPG），授予时从勋章库快照写入，可选 */
  image: z.string().nullable().optional(),
  grantedAtUtc: z.string(),
});

export type Achievement = z.infer<typeof achievementSchema>;

/** 列表行内钱包概要（BFF JOIN + 短 TTL 缓存）。 */
export const walletSummarySchema = z.object({
  available: z.number(),
  held: z.number(),
  currency: z.string(),
  snapshotAtUtc: z.string(),
});

export type WalletSummary = z.infer<typeof walletSummarySchema>;

/** 详情页完整钱包快照（含写入时刻）。 */
export const accountWalletSchema = z.object({
  available: z.number(),
  held: z.number(),
  currency: z.string(),
  updatedAtUtc: z.string(),
});

export type AccountWallet = z.infer<typeof accountWalletSchema>;

export const accountSchema = z.object({
  uid: z.string().min(1),
  type: z.enum(accountTypeValues),
  /** Personal = 昵称；Organization = 组织名。 */
  displayName: z.string().min(1),
  status: z.enum(accountStatusValues),
  /** Mock 扩展：方便平台视图列表展示，**真实 BFF 不一定返回**，UI 用可选呈现。 */
  ownerIamUserUid: z.string().optional(),
  ownerDisplayName: z.string().optional(),
  /** Owner 联系邮箱（`owner.email`）。 */
  ownerEmail: z.string().optional(),
  /** Owner 联系手机（`owner.phone`）。 */
  ownerPhone: z.string().optional(),
  iamUserCount: z.number().int().nonnegative().optional(),
  createdAtUtc: z.string().optional(),
  updatedAtUtc: z.string().optional(),
  /** 最近活跃时间（任一 IAM 用户登录、API 调用、计费操作）；无记录时 API 可返回 null。 */
  lastActiveAtUtc: z.string().nullable().optional(),
  /** 账户等级，按累积充值金额自动计算。最小 1。 */
  tier: z.number().int().min(1),
  /** 累积充值金额（元），用于计算 tier。 */
  totalRechargedAmount: z.number().nonnegative(),
  /** OAuth 绑定关系，未绑定时省略。 */
  oauthBindings: z.array(oauthBindingSchema).optional(),
  /** 已获得勋章。 */
  achievements: z.array(achievementSchema).optional(),
  /** 列表投影：钱包概要（`GET /api/admin/accounts`）。 */
  walletSummary: walletSummarySchema.nullable().optional(),
  /** 详情投影：完整钱包（`GET /api/admin/accounts/{uid}`）。 */
  wallet: accountWalletSchema.nullable().optional(),
});

export type Account = z.infer<typeof accountSchema>;

export interface AccountListFilter {
  /** 账户 UID 精确匹配 */
  accountUid: string;
  /** 邮箱 / 手机关键字（模糊匹配 owner.email / owner.phone） */
  contactKeyword: string;
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
