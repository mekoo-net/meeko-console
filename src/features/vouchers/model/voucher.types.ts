import type { AccountContact } from '@/features/accounts/model/account.types';

export const VoucherDeductKind = {
  NoThreshold: 0,
  FullReduction: 1,
  Discount: 2,
} as const;
export type VoucherDeductKind = (typeof VoucherDeductKind)[keyof typeof VoucherDeductKind];

export const VoucherScopeKind = {
  AllProducts: 0,
  SpecificProducts: 1,
} as const;
export type VoucherScopeKind = (typeof VoucherScopeKind)[keyof typeof VoucherScopeKind];

export const VoucherValidityKind = {
  Absolute: 0,
  RelativeDays: 1,
} as const;
export type VoucherValidityKind = (typeof VoucherValidityKind)[keyof typeof VoucherValidityKind];

// 抵扣周期（券的生命周期）：决定折扣/抵扣是仅首次付款生效，还是每次续费都生效。
export const VoucherApplyMode = {
  FirstPaymentOnly: 0,
  EveryRenewal: 1,
} as const;
export type VoucherApplyMode = (typeof VoucherApplyMode)[keyof typeof VoucherApplyMode];

export const VoucherTemplateStatus = {
  Draft: 0,
  Active: 1,
  Paused: 2,
  Archived: 3,
} as const;
export type VoucherTemplateStatus = (typeof VoucherTemplateStatus)[keyof typeof VoucherTemplateStatus];

export const UserVoucherStatus = {
  Unused: 0,
  Used: 1,
  Expired: 2,
  Revoked: 3,
} as const;
export type UserVoucherStatus = (typeof UserVoucherStatus)[keyof typeof UserVoucherStatus];

// 领券活动状态：进行中 / 暂停 / 结束。活动只是「投放入口」，复用券模板发券。
export const VoucherActivityStatus = {
  Active: 0,
  Paused: 1,
  Ended: 2,
} as const;
export type VoucherActivityStatus = (typeof VoucherActivityStatus)[keyof typeof VoucherActivityStatus];

export const deductKindLabels: Record<number, string> = {
  [VoucherDeductKind.NoThreshold]: '无门槛',
  [VoucherDeductKind.FullReduction]: '满减',
  [VoucherDeductKind.Discount]: '折扣',
};

export const applyModeLabels: Record<number, string> = {
  [VoucherApplyMode.FirstPaymentOnly]: '单次',
  [VoucherApplyMode.EveryRenewal]: '循环',
};

export const templateStatusLabels: Record<number, string> = {
  [VoucherTemplateStatus.Draft]: '草稿',
  [VoucherTemplateStatus.Active]: '已启用',
  [VoucherTemplateStatus.Paused]: '已暂停',
  [VoucherTemplateStatus.Archived]: '已归档',
};

export const userVoucherStatusLabels: Record<number, string> = {
  [UserVoucherStatus.Unused]: '未使用',
  [UserVoucherStatus.Used]: '已用完',
  [UserVoucherStatus.Expired]: '已过期',
  [UserVoucherStatus.Revoked]: '已作废',
};

export const activityStatusLabels: Record<number, string> = {
  [VoucherActivityStatus.Active]: '进行中',
  [VoucherActivityStatus.Paused]: '已暂停',
  [VoucherActivityStatus.Ended]: '已结束',
};

/**
 * 抵扣规则（按 deductKind 区分的判别联合）：每种券只携带自己关心的字段，
 * 用 rule.kind 收窄即可安全访问 —— 杜绝「无门槛却带 discountRate」之类的非法态。
 * 注：过线契约仍是平铺的，平铺 ↔ 联合 的折叠/展开收敛在 adapter 边界。
 */
export type VoucherRule =
  | { kind: typeof VoucherDeductKind.NoThreshold; faceValue: number }
  | { kind: typeof VoucherDeductKind.FullReduction; faceValue: number; thresholdAmount: number }
  | { kind: typeof VoucherDeductKind.Discount; discountRate: number; capValue: number; thresholdAmount: number };

/** 有效期（按 validityKind 区分的判别联合）。时间统一为 epoch 毫秒。 */
export type VoucherValidity =
  | { kind: typeof VoucherValidityKind.RelativeDays; days: number }
  | { kind: typeof VoucherValidityKind.Absolute; fromUtc: number; toUtc: number };

export interface VoucherTemplate {
  id: string;
  name: string;
  code: string;
  applyMode: number;
  rule: VoucherRule;
  scopeKind: number;
  scopeProductCodes: string[];
  validity: VoucherValidity;
  stackable: boolean;
  totalQuota?: number | null;
  issuedCount: number;
  perUserLimit?: number | null;
  status: number;
  createdAtUtc: number;
  updatedAtUtc: number;
}

export interface CreateVoucherTemplateInput {
  name: string;
  applyMode: number;
  rule: VoucherRule;
  scopeKind: number;
  scopeProductCodes: string[];
  validity: VoucherValidity;
  stackable: boolean;
  totalQuota?: number | null;
  perUserLimit?: number | null;
}

export interface UpdateVoucherTemplateInput {
  name: string;
  scopeKind: number;
  scopeProductCodes: string[];
  validity: VoucherValidity;
  stackable: boolean;
  totalQuota?: number | null;
  perUserLimit?: number | null;
}

export interface IssueVouchersInput {
  accountUids: string[];
  batchToken?: string;
}

export interface IssueVouchersResult {
  issuedCount: number;
  requestedCount: number;
}

export interface UserVoucher {
  id: string;
  templateId: string;
  accountUid: string;
  serialNo?: string | null;
  deductKind: number;
  faceValue: number;
  thresholdAmount: number;
  remainingValue: number;
  validFromUtc: number;
  validToUtc: number;
  status: number;
  issuedAtUtc: number;
}

export interface VoucherRedemption {
  id: string;
  userVoucherId: string;
  accountUid: string;
  productCode: string;
  amountDeducted: number;
  occurredAtUtc: number;
}

/** 活动投放的单张券（券 Key = templateCode）。 */
export interface ActivityVoucherItem {
  templateId: string;
  templateName?: string | null;
  /** 券 Key：用户在 N 选 M 活动里领取时，除 claimKey 外还要带上它指明领哪张。 */
  templateCode?: string | null;
}

// 领券活动：投放 N 张券（items），用户凭 claimKey 领取；N>1 时按 pickCount 选 M 张。
// 用户无法直接获得券，只能通过后台发放或领券活动领取。发券时回写 Origin=activityId。
export interface VoucherActivity {
  id: string;
  name: string;
  /** 本活动投放的券集合（N 张）。 */
  items: ActivityVoucherItem[];
  /** 用户可从 items 中选领的张数 M：1 = N 选 1；= items.length = 全部发放。 */
  pickCount: number;
  /** 领取 Key：用户在领取页输入此 Key 领取本活动的券。 */
  claimKey: string;
  /** 领取开始（null=立即开放）。 */
  startAtUtc?: number | null;
  /** 领取结束（null=长期）。 */
  endAtUtc?: number | null;
  /** 活动可领总量（null=不限，仍受模板总量约束）。 */
  totalQuota?: number | null;
  claimedCount: number;
  /** 每用户在本活动可领数量（null=跟随模板）。 */
  perUserLimit?: number | null;
  status: number;
  createdAtUtc: number;
}

export interface CreateVoucherActivityInput {
  name: string;
  /** 投放的券模板（N 张，至少 1 张）。 */
  templateIds: string[];
  /** 可选领取张数 M（1..templateIds.length）。 */
  pickCount: number;
  /** 领取开始（epoch 毫秒，null=立即开放）。 */
  startAtUtc?: number | null;
  /** 领取结束（epoch 毫秒，null=长期）。 */
  endAtUtc?: number | null;
  totalQuota?: number | null;
  perUserLimit?: number | null;
}

export interface UpdateVoucherActivityInput {
  name: string;
  /** 领取开始（epoch 毫秒，null=立即开放）。 */
  startAtUtc?: number | null;
  /** 领取结束（epoch 毫秒，null=长期）。 */
  endAtUtc?: number | null;
  totalQuota?: number | null;
  perUserLimit?: number | null;
}

/** 领取规则文案：单券 / N 选 1 / N 选 M（全领）。 */
export function activityPickLabel(activity: Pick<VoucherActivity, 'items' | 'pickCount'>): string {
  const n = activity.items.length;
  if (n <= 1) return '单券';
  const m = Math.min(Math.max(1, activity.pickCount), n);
  if (m >= n) return `${n} 选 ${n}（全领）`;
  return `${n} 选 ${m}`;
}

/** 活动领取记录：谁领了、领取 IP、时间，以及对应发出的用户券。 */
export interface ActivityClaimer {
  id: string;
  accountUid: string;
  userVoucherId: string;
  claimedAtUtc: number;
  claimIp?: string | null;
  status: number;
  /** 账户联系信息（嵌套对象，BFF 按当前页 uid 关联补全）。 */
  contact?: AccountContact;
}
