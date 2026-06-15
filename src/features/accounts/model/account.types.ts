import { z } from 'zod';

import type { Uid } from '@/shared/lib/id';
import {
  epochMillisNullableSchema,
  epochMillisOptionalSchema,
  epochMillisSchema,
} from '@/shared/lib/epoch';

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
  boundAtUtc: epochMillisSchema,
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
  grantedAtUtc: epochMillisSchema,
});

export type Achievement = z.infer<typeof achievementSchema>;

/** 列表行内钱包概要（BFF JOIN + 短 TTL 缓存）。 */
export const walletSummarySchema = z.object({
  available: z.number(),
  held: z.number(),
  currency: z.string(),
  snapshotAtUtc: epochMillisSchema,
});

export type WalletSummary = z.infer<typeof walletSummarySchema>;

/** 详情页完整钱包快照（含写入时刻）。 */
export const accountWalletSchema = z.object({
  available: z.number(),
  held: z.number(),
  currency: z.string(),
  updatedAtUtc: epochMillisSchema,
});

export type AccountWallet = z.infer<typeof accountWalletSchema>;

export const referralInviterSchema = z.object({
  uid: z.string().min(1),
  displayName: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().nullish(),
});

export type ReferralInviter = z.infer<typeof referralInviterSchema>;

/**
 * 账户 owner（主体）信息：IAM 主用户 + 联系方式。
 * BFF 不一定返回（列表投影常缺省），内部字段均可选；UI 用可选呈现。
 */
export const accountOwnerSchema = z.object({
  iamUserUid: z.string().optional(),
  displayName: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().nullish(),
});

export type AccountOwner = z.infer<typeof accountOwnerSchema>;

export const accountSchema = z.object({
  uid: z.string().min(1),
  type: z.enum(accountTypeValues),
  /** Personal = 昵称；Organization = 组织名。BFF 列表可能返回空串，适配层会兜底。 */
  displayName: z.string(),
  status: z.enum(accountStatusValues),
  /** owner（主体）信息：IAM 主用户 + 联系方式。默认空对象，便于读取免可选链。 */
  owner: accountOwnerSchema.default({}),
  iamUserCount: z.number().int().nonnegative().optional(),
  createdAtUtc: epochMillisOptionalSchema,
  updatedAtUtc: epochMillisOptionalSchema,
  /** 最近活跃时间（任一 IAM 用户登录、API 调用、计费操作）；无记录时 API 可返回 null。 */
  lastActiveAtUtc: epochMillisNullableSchema.optional(),
  /** 账户等级；列表 API 可能不返回，默认 1。 */
  tier: z.number().int().min(1).default(1),
  /** 累积充值金额（元）；列表 API 可能不返回，默认 0。 */
  totalRechargedAmount: z.number().nonnegative().default(0),
  /** OAuth 绑定关系，未绑定时省略。 */
  oauthBindings: z.array(oauthBindingSchema).nullish(),
  /** 已获得勋章。 */
  achievements: z.array(achievementSchema).nullish(),
  /** 列表投影：已持有勋章 code（列表 API 仅返回 code，用于筛选/徽章展示）。 */
  achievementCodes: z.array(z.string()).nullish(),
  /** 列表投影：钱包概要（`GET /api/admin/accounts`）。 */
  walletSummary: walletSummarySchema.nullable().optional(),
  /** 详情投影：完整钱包（`GET /api/admin/accounts/{uid}`）。 */
  wallet: accountWalletSchema.nullable().optional(),
  /** 邀请人（返利关系）。 */
  inviter: referralInviterSchema.nullable().optional(),
  /** 账户级返利率覆盖（%）；未设置则使用全局默认。 */
  rebateRatePercent: z.number().min(0).max(100).nullable().optional(),
  /** 该账户邀请注册的人数。 */
  inviteCount: z.number().int().nonnegative().default(0),
});

export type Account = z.infer<typeof accountSchema>;

/**
 * 账户联系信息（嵌套对象）：与后端 `AccountContactDto` 对齐。
 * 硬规范：凡接口返回的账户身份，统一用此嵌套对象，禁止展平成 ownerXxx / 平铺到外层。
 */
export const accountContactSchema = z.object({
  uid: z.string().min(1),
  displayName: z.string().nullish(),
  email: z.string().nullish(),
  phone: z.string().nullish(),
  type: z.enum(accountTypeValues).nullish(),
});

export type AccountContact = z.infer<typeof accountContactSchema>;

/** 把后端 `AccountContactDto`（accountType 字符串）映射为前端 {@link AccountContact}。 */
export function mapAccountContact(raw: unknown): AccountContact | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const uid = r.uid != null ? String(r.uid) : '';
  if (!uid) return undefined;
  const type =
    r.accountType === 'personal' || r.accountType === 'organization' ? r.accountType : undefined;
  return {
    uid,
    displayName: typeof r.displayName === 'string' ? r.displayName : undefined,
    email: typeof r.email === 'string' ? r.email : undefined,
    phone: typeof r.phone === 'string' ? r.phone : undefined,
    type,
  };
}

export interface AccountListFilter {
  /** 账户 UID 精确匹配 */
  accountUid: string;
  /** 邮箱 / 手机关键字（模糊匹配 owner.email / owner.phone） */
  contactKeyword: string;
  type: AccountType | 'all';
  status: AccountStatus | 'all';
  /** 账户等级（1..5）精确筛选；null/省略不筛。 */
  tier?: number | null;
  /** 成就/徽章 code；非空时只返回持有该徽章的账户。 */
  badgeCode?: string;
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
