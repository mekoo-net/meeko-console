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

export const deductKindLabels: Record<number, string> = {
  [VoucherDeductKind.NoThreshold]: '无门槛',
  [VoucherDeductKind.FullReduction]: '满减',
  [VoucherDeductKind.Discount]: '折扣',
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

export interface VoucherTemplate {
  id: string;
  name: string;
  deductKind: number;
  faceValue: number;
  thresholdAmount: number;
  discountRate?: number | null;
  scopeKind: number;
  scopeProductCodes: string[];
  validityKind: number;
  validFromUtc?: number | null;
  validToUtc?: number | null;
  validDays?: number | null;
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
  deductKind: number;
  faceValue: number;
  thresholdAmount: number;
  discountRate?: number | null;
  scopeKind: number;
  scopeProductCodes: string[];
  validityKind: number;
  validFromUtc?: string | null;
  validToUtc?: string | null;
  validDays?: number | null;
  stackable: boolean;
  totalQuota?: number | null;
  perUserLimit?: number | null;
}

export interface UpdateVoucherTemplateInput {
  name: string;
  scopeKind: number;
  scopeProductCodes: string[];
  validityKind: number;
  validFromUtc?: string | null;
  validToUtc?: string | null;
  validDays?: number | null;
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
