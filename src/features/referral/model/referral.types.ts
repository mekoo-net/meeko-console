import { z } from 'zod';

import { epochMillisNullableSchema, epochMillisSchema } from '@/shared/lib/epoch';

export const referralWithdrawalStatusValues = [
  'pending',
  'approved',
  'rejected',
  'paid',
  'canceled',
  'failed',
] as const;

export type ReferralWithdrawalStatus = (typeof referralWithdrawalStatusValues)[number];

export const referralWithdrawalMethodValues = ['alipay', 'bank'] as const;
export type ReferralWithdrawalMethod = (typeof referralWithdrawalMethodValues)[number];

/** 提现申请账户：uid + BFF 补全的展示名 / 邮箱。 */
export const referralWithdrawalAccountSchema = z.object({
  uid: z.string().min(1),
  displayName: z.string().optional(),
  email: z.string().optional(),
});

export type ReferralWithdrawalAccount = z.infer<typeof referralWithdrawalAccountSchema>;

/** 提现金额块：金额 + 币种。 */
export const referralWithdrawalAmountSchema = z.object({
  value: z.number().positive(),
  currency: z.string(),
});

/** 收款信息：渠道 / 收款账号 / 收款人。 */
export const referralWithdrawalPayoutSchema = z.object({
  method: z.enum(referralWithdrawalMethodValues),
  accountNo: z.string(),
  accountName: z.string(),
});

export type ReferralWithdrawalPayout = z.infer<typeof referralWithdrawalPayoutSchema>;

export const referralWithdrawalSchema = z.object({
  id: z.string().min(1),
  /** 申请账户（uid + 展示名 / 邮箱） */
  account: referralWithdrawalAccountSchema,
  /** 金额块 */
  amount: referralWithdrawalAmountSchema,
  /** 收款信息（渠道 / 账号 / 收款人） */
  payout: referralWithdrawalPayoutSchema,
  status: z.enum(referralWithdrawalStatusValues),
  rejectReason: z.string().nullable().optional(),
  appliedAtUtc: epochMillisSchema,
  reviewedAtUtc: epochMillisNullableSchema.optional(),
  paidAtUtc: epochMillisNullableSchema.optional(),
});

export type ReferralWithdrawal = z.infer<typeof referralWithdrawalSchema>;

export interface ReferralWithdrawalFilter {
  status: ReferralWithdrawalStatus | 'all';
}

export const referralWithdrawalStatusLabel: Readonly<Record<ReferralWithdrawalStatus, string>> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
  paid: '已打款',
  canceled: '已取消',
  failed: '打款失败',
};

export const referralWithdrawalMethodLabel: Readonly<Record<ReferralWithdrawalMethod, string>> = {
  alipay: '支付宝',
  bank: '银行卡',
};
