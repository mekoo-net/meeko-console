import { z } from 'zod';

import { rateBodySchema, type RateBody } from '@yomi/common';
import { epochMillisSchema } from '@/shared/lib/epoch';

import { pageSchema } from './metering.types';

/**
 * Tavern 积分（后端 `credit_*`，wire camelCase、枚举 snake_case）。
 * 积分是 Tavern 自己的账，与平台钱包分开：玩家用钱包里的钱买积分包，回合按用量扣积分，两位小数。
 */

// ---------- 价目表 ----------

/** 通配：渠道写 `*` 即不分渠道；`*`/`*` 是默认价，没单独定价的模型照它扣。 */
export const ANY = '*';

export const creditRateSchema = z.object({
  id: z.number().int(),
  vendorKey: z.string(),
  modelName: z.string(),
  price: rateBodySchema,
  updatedAt: epochMillisSchema,
});
export type CreditRate = z.infer<typeof creditRateSchema>;

/**
 * 价目表一行：目录里的、近 30 天调用过的、配过价的取并集。
 * `rate` 是这一行自己的价目；自己没有时照 `modelRate`（同模型不分渠道的价），两个都没有照默认价。
 */
export const creditModelRateSchema = z.object({
  vendorKey: z.string(),
  modelName: z.string(),
  inCatalog: z.boolean(),
  calls30d: z.number().int().nonnegative(),
  rate: creditRateSchema.nullable(),
  modelRate: creditRateSchema.nullable(),
});
export type CreditModelRate = z.infer<typeof creditModelRateSchema>;

export const creditRateBoardSchema = z.object({
  /** 默认价；启动时种好，正常不会为 null。 */
  default: creditRateSchema.nullable(),
  models: z.array(creditModelRateSchema),
});
export type CreditRateBoard = z.infer<typeof creditRateBoardSchema>;

export interface CreditRateUpsert {
  vendorKey: string;
  modelName: string;
  price: RateBody;
}

/** 积分价目可选的计量；上游积分（per_credit）、按字符不收。 */
export const creditBillingTypes = ['per_token', 'per_call', 'per_image', 'per_video', 'per_audio_minute'] as const;

// ---------- 积分包 ----------

export const creditPackSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  credits: z.number(),
  bonusCredits: z.number(),
  /** 售价，元。 */
  price: z.number(),
  active: z.boolean(),
  sort: z.number().int(),
  updatedAt: epochMillisSchema,
});
export type CreditPack = z.infer<typeof creditPackSchema>;

export interface CreditPackEdit {
  id: number | null;
  name: string;
  credits: number;
  bonusCredits: number;
  price: number;
  active: boolean;
  sort: number;
}

// ---------- 账户与流水 ----------

export const creditBalanceSchema = z.object({
  available: z.number(),
  /** 进行中的回合压着的。 */
  held: z.number(),
});
export type CreditBalance = z.infer<typeof creditBalanceSchema>;

export const creditTxnKindSchema = z.enum(['purchase', 'grant', 'deduct', 'hold', 'charge', 'release', 'refund']);
export type CreditTxnKind = z.infer<typeof creditTxnKindSchema>;

export const CreditTxnKindLabel: Readonly<Record<CreditTxnKind, string>> = {
  purchase: '购买积分包',
  grant: '员工发放',
  deduct: '员工调减',
  hold: '回合预扣',
  charge: '回合扣费',
  release: '预扣退回',
  refund: '驳回退回',
};

/** 余额增加的几种；其余是减（预扣把可用挪到预扣中，也算减）。 */
export const CREDIT_TXN_IN: ReadonlySet<CreditTxnKind> = new Set(['purchase', 'grant', 'release', 'refund']);

export const creditTxnSchema = z.object({
  id: z.number().int(),
  kind: creditTxnKindSchema,
  /** 恒为正，增减看 `kind`。 */
  amount: z.number(),
  availableAfter: z.number(),
  /** 因什么动的：`ref` 是回合 trace id、订单号或员工 uid。 */
  source: z.object({ kind: z.enum(['turn', 'order', 'staff']), ref: z.string() }),
  note: z.string().nullable(),
  createdAt: epochMillisSchema,
});
export type CreditTxn = z.infer<typeof creditTxnSchema>;

export const creditAccountSchema = z.object({
  accountUid: z.number().int(),
  balance: creditBalanceSchema,
  txns: pageSchema(creditTxnSchema),
});
export type CreditAccount = z.infer<typeof creditAccountSchema>;

export interface CreditAdjustInput {
  /** 正数发放、负数调减（最多扣到 0）。 */
  delta: number;
  note: string;
  /** 每次提交生成，重复提交只记一次。 */
  requestId: string;
}
