import { z } from 'zod';

/** 与 Meeko.Contracts.DemuxAi.Common.RedemptionStatus 数值一致。 */
export const redemptionStatusSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);

export type RedemptionStatus = z.infer<typeof redemptionStatusSchema>;

export const redemptionAccountSchema = z.object({
  uid: z.string().min(1),
  owner: z
    .object({
      email: z.string().optional(),
      displayName: z.string().optional(),
    })
    .optional(),
});

export type RedemptionAccount = z.infer<typeof redemptionAccountSchema>;

export const redemptionStaffSchema = z.object({
  uid: z.string().min(1),
  displayName: z.string(),
  username: z.string().optional(),
});

export type RedemptionStaff = z.infer<typeof redemptionStaffSchema>;

/** 单次领取记录（一码多次时有多条）。 */
export const redemptionClaimSchema = z.object({
  account: redemptionAccountSchema,
  redeemedTime: z.number(),
});

export type RedemptionClaim = z.infer<typeof redemptionClaimSchema>;

export const redemptionCodeSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  key: z.string(),
  status: redemptionStatusSchema,
  quota: z.number(),
  /** 总可领取次数；1 表示一人一码单次使用。 */
  maxRedemptions: z.number().int().positive(),
  /** 已领取次数。 */
  redeemedCount: z.number().int().nonnegative(),
  createdTime: z.number(),
  redeemedTime: z.number().nullable(),
  /** 最近一次领取人（列表摘要；明细见 claims）。 */
  account: redemptionAccountSchema.nullable(),
  /** 领取明细；一码一次时通常 0~1 条。 */
  claims: z.array(redemptionClaimSchema),
  createdBy: redemptionStaffSchema,
  /** 截止领取时间（Unix 秒）；null 表示长期有效。 */
  expiredTime: z.number().nullable(),
});

export type RedemptionCode = z.infer<typeof redemptionCodeSchema>;

export type RedemptionCodeKind = 'all' | 'shared' | 'single';

export interface ListRedemptionCodesFilter {
  keyword?: string;
  status?: RedemptionStatus | 'all';
  /** 活动码（一码多次）/ 一次性码 */
  kind?: RedemptionCodeKind;
}

export interface CreateRedemptionCodesInput {
  name: string;
  amount: number;
  /** 生成几条不同的 Key；活动码（一码多次）时固定为 1。 */
  count: number;
  /** 每条 Key 可被领取的总次数。 */
  maxRedemptions: number;
  /** ISO8601 截止领取时间；null 表示不限期。 */
  expiredAtUtc: string | null;
}

export interface CreateRedemptionCodesResult {
  keys: string[];
}

/** 是否为「一码多次」活动码。 */
export function isSharedRedemptionCode(row: RedemptionCode): boolean {
  return row.maxRedemptions > 1;
}

/** 领取明细：优先 claims，否则由 account + redeemedTime 推导。 */
export function redemptionClaimsOf(row: RedemptionCode): RedemptionClaim[] {
  const list =
    row.claims.length > 0
      ? row.claims
      : row.account && row.redeemedTime
        ? [{ account: row.account, redeemedTime: row.redeemedTime }]
        : [];
  return list.filter((c) => Boolean(c?.account?.uid));
}
