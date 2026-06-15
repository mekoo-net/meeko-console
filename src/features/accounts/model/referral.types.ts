import { z } from 'zod';

import { epochMillisNullableSchema, epochMillisSchema } from '@/shared/lib/epoch';

export const referralWithdrawalMethodValues = ['alipay', 'bank'] as const;
export type ReferralWithdrawalMethod = (typeof referralWithdrawalMethodValues)[number];

export const ReferralWithdrawalMethodLabel: Readonly<Record<ReferralWithdrawalMethod, string>> = {
  alipay: '支付宝',
  bank: '银行卡',
};

export const referralWithdrawalStatusValues = ['pending', 'approved', 'rejected', 'paid'] as const;
export type ReferralWithdrawalStatus = (typeof referralWithdrawalStatusValues)[number];

export const ReferralWithdrawalStatusLabel: Readonly<Record<ReferralWithdrawalStatus, string>> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
  paid: '已打款',
};

export const ReferralWithdrawalStatusTone: Readonly<
  Record<ReferralWithdrawalStatus, 'success' | 'warning' | 'danger' | 'info'>
> = {
  pending: 'warning',
  approved: 'info',
  rejected: 'danger',
  paid: 'success',
};

export const referralAccountSummarySchema = z.object({
  inviteCount: z.number().int().nonnegative(),
  totalRebateAmount: z.number().nonnegative(),
  withdrawableAmount: z.number().nonnegative(),
  withdrawnAmount: z.number().nonnegative(),
  currency: z.string(),
});

export type ReferralAccountSummary = z.infer<typeof referralAccountSummarySchema>;

export const referralInviteeSchema = z.object({
  accountUid: z.string().min(1),
  displayName: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().nullish(),
  registeredAtUtc: epochMillisSchema,
  hasRecharged: z.boolean(),
  contributedRebateAmount: z.number().nonnegative(),
  status: z.enum(['active', 'suspended']),
});

export type ReferralInvitee = z.infer<typeof referralInviteeSchema>;

export const referralRebateSchema = z.object({
  id: z.string().min(1),
  sourceAccountUid: z.string().min(1),
  sourceLabel: z.string(),
  rechargeAmount: z.number().nonnegative(),
  rebateRatePercent: z.number().min(0).max(100),
  rebateAmount: z.number().nonnegative(),
  currency: z.string(),
  occurredAtUtc: epochMillisSchema,
  linkedRechargeId: z.string().min(1),
});

export type ReferralRebate = z.infer<typeof referralRebateSchema>;

export const referralWithdrawalAdminSchema = z.object({
  id: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string(),
  method: z.enum(referralWithdrawalMethodValues),
  accountNo: z.string(),
  accountName: z.string(),
  status: z.enum(referralWithdrawalStatusValues),
  rejectReason: z.string().optional(),
  appliedAtUtc: epochMillisSchema,
  reviewedAtUtc: epochMillisNullableSchema.optional(),
  paidAtUtc: epochMillisNullableSchema.optional(),
});

export type ReferralWithdrawalAdmin = z.infer<typeof referralWithdrawalAdminSchema>;
