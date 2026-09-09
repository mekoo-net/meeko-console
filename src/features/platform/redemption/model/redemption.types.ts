import { z } from 'zod';

/**
 * 平台兑换码：兑换后直接进平台钱包（InternalRecharge source=redemption，不计返利），
 * 与具体产品无关。id 为字符串、时间为 epoch ms、状态为 snake_case、面额为 CNY。
 */

export const redemptionStatusValues = ['unused', 'used', 'disabled', 'expired'] as const;
export const redemptionStatusSchema = z.enum(redemptionStatusValues);
export type RedemptionStatus = z.infer<typeof redemptionStatusSchema>;

export const RedemptionStatusLabel: Record<RedemptionStatus, string> = {
  unused: '未使用',
  used: '已用完',
  disabled: '已停用',
  expired: '已过期',
};

export const redemptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  keyMasked: z.string(),
  status: redemptionStatusSchema,
  /** CNY */
  quota: z.number(),
  maxRedemptions: z.number().int().positive(),
  redeemedCount: z.number().int().nonnegative(),
  usedByAccountUid: z.string().nullable().optional(),
  createdAtUtc: z.number(),
  redeemedAtUtc: z.number().nullable().optional(),
  expiresAtUtc: z.number().nullable().optional(),
});
export type Redemption = z.infer<typeof redemptionSchema>;

export interface ListRedemptionsFilter {
  keyword?: string;
  status?: RedemptionStatus | 'all';
}

export interface CreateRedemptionsInput {
  name: string;
  /** CNY */
  quota: number;
  count: number;
  maxRedemptions: number;
  /** epoch ms；null = 长期有效。 */
  expiresAtUtc: number | null;
}

export function isSharedRedemption(row: Redemption): boolean {
  return row.maxRedemptions > 1;
}

export function redemptionDisplayStatus(row: Redemption): {
  label: string;
  tone: 'success' | 'info' | 'warning' | 'danger' | 'primary';
} {
  if (row.status === 'disabled') return { label: '已停用', tone: 'danger' };
  if (row.status === 'expired' || (row.expiresAtUtc && row.expiresAtUtc <= Date.now()))
    return { label: '已过期', tone: 'info' };
  if (row.redeemedCount >= row.maxRedemptions) return { label: isSharedRedemption(row) ? '已领完' : '已使用', tone: 'success' };
  if (row.redeemedCount > 0) return { label: '进行中', tone: 'primary' };
  return { label: '可领取', tone: 'warning' };
}
