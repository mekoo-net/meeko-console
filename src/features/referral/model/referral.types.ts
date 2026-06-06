import { z } from 'zod';

import { epochMillisNullableSchema, epochMillisSchema } from '@/shared/lib/epoch';

export const referralWithdrawalStatusValues = [
  'pending',
  'approved',
  'rejected',
  'paid',
] as const;

export type ReferralWithdrawalStatus = (typeof referralWithdrawalStatusValues)[number];

export const referralWithdrawalMethodValues = ['alipay', 'bank'] as const;
export type ReferralWithdrawalMethod = (typeof referralWithdrawalMethodValues)[number];

export const referralWithdrawalSchema = z.object({
  id: z.string().min(1),
  accountUid: z.string().min(1),
  accountDisplayName: z.string().optional(),
  accountEmail: z.string().optional(),
  amount: z.number().positive(),
  currency: z.string(),
  method: z.enum(referralWithdrawalMethodValues),
  accountNo: z.string(),
  accountName: z.string(),
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
};

export const referralWithdrawalMethodLabel: Readonly<Record<ReferralWithdrawalMethod, string>> = {
  alipay: '支付宝',
  bank: '银行卡',
};
