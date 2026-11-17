import { z } from 'zod';

import { epochMillisNullableSchema, epochMillisSchema } from '@/shared/lib/epoch';

/**
 * Jastalk 管理面的类型（后端 Meeko.Jastalk 的 `jastalk/api/admin/*`，wire camelCase、枚举 snake_case、时间 Unix 毫秒）。
 * 积分是 Jastalk 自己的账，和平台钱包分开：用户拿钱包里的钱兑换积分（1 元 = 100 积分），每次调用按用量扣，两位小数。
 */

/** 分页：`p` 从 1 起（和 Yomi、Tavern 的管理列表一样）。 */
export type PageQuery = { p: number; pageSize: number };

export const pointBalanceSchema = z.object({
  /** 能花的。 */
  available: z.number(),
  /** 进行中的调用冻着的。 */
  held: z.number(),
});
export type PointBalance = z.infer<typeof pointBalanceSchema>;

// ---------- 用户 ----------

/**
 * 进过 Jastalk 的账号（后端 `platform.users`）：平台账号第一次进来时浏览器调 onboarding 落一行。
 * 名字、邮箱归平台账户，这里只有 uid。
 */
export const jastalkUserSchema = z.object({
  accountUid: z.number().int(),
  joinedAt: epochMillisSchema,
  lastSeenAt: epochMillisSchema,
  /** 停用的时间；没停用是 null。停用后连不上、冻不了积分。 */
  blockedAt: epochMillisNullableSchema,
  pointsAvailable: z.number(),
  pointsHeld: z.number(),
});
export type JastalkUser = z.infer<typeof jastalkUserSchema>;

export type UserQuery = { accountUid?: number; blocked?: boolean };

// ---------- 积分流水 ----------

export const pointTxnKindSchema = z.enum(['exchange', 'grant', 'deduct', 'hold', 'charge', 'release']);
export type PointTxnKind = z.infer<typeof pointTxnKindSchema>;

export const pointTxnSchema = z.object({
  id: z.number().int(),
  kind: pointTxnKindSchema,
  /** 恒为正，增减看 kind。 */
  amount: z.number(),
  availableAfter: z.number(),
  heldAfter: z.number(),
  /** 因什么动的：哪次调用（幂等键）/ 哪张兑换单 / 哪个员工（uid）。 */
  source: z.object({ kind: z.enum(['usage', 'order', 'staff']), ref: z.string() }),
  note: z.string().nullable(),
  createdAt: epochMillisSchema,
});
export type PointTxn = z.infer<typeof pointTxnSchema>;

export const pointAccountSchema = z.object({
  accountUid: z.number().int(),
  balance: pointBalanceSchema,
  txns: z.object({ items: z.array(pointTxnSchema), total: z.number().int().nonnegative() }),
});
export type PointAccount = z.infer<typeof pointAccountSchema>;

/** 正数发放、负数调减（最多扣到 0）。`requestId` 每次提交生成一个，重复提交只记一次。 */
export interface PointAdjust {
  delta: number;
  note: string;
  requestId: string;
}

// ---------- 模型目录 ----------

export const modelCategories = ['chat', 'image', 'tts', 'stt', 'embed', 'rerank'] as const;
export const modelCategorySchema = z.enum(modelCategories);
export type ModelCategory = z.infer<typeof modelCategorySchema>;

export const rateUnits = ['token', 'image', 'audio_second'] as const;
export const rateUnitSchema = z.enum(rateUnits);
export type RateUnit = z.infer<typeof rateUnitSchema>;

/**
 * 目录里的一行：用户能选的一个模型。渠道和模型名原样发给 OneApi。
 * `priced`：定价表里找得到按 `unit` 算的价格；找不到的用户选不了（不能不冻积分就调）。
 */
export const catalogModelSchema = z.object({
  id: z.number().int(),
  category: modelCategorySchema,
  vendorKey: z.string(),
  vendorName: z.string(),
  modelName: z.string(),
  displayName: z.string(),
  enabled: z.boolean(),
  sort: z.number().int(),
  priced: z.boolean(),
  unit: rateUnitSchema,
  inputPrice: z.number(),
  outputPrice: z.number(),
  /** 照定价表里哪一行算的：「渠道/模型」，通配写 `*`；没有是 null。 */
  ratedBy: z.string().nullable(),
  updatedAt: epochMillisSchema,
});
export type CatalogModel = z.infer<typeof catalogModelSchema>;

export const catalogBoardSchema = z.object({
  /** 目录和定价合起来的版本号，每改一次加一；网关凭它知道手上那份还新不新。 */
  version: z.number().int().nonnegative(),
  models: z.array(catalogModelSchema),
});
export type CatalogBoard = z.infer<typeof catalogBoardSchema>;

/** `id` 为 null 是新加；类别、渠道、模型是一行的身份，建了以后不能改。 */
export interface CatalogModelEdit {
  id: number | null;
  category: ModelCategory;
  vendorKey: string;
  modelName: string;
  vendorName: string;
  displayName: string;
  enabled: boolean;
  sort: number;
}

// ---------- 定价 ----------

/** 通配：渠道写 `*` 即不分渠道；`*` / `*` 是默认价。 */
export const ANY = '*';

/**
 * 定价表的一行。单价的意思看 `unit`：token 是每百万 token 多少积分（输入、输出分开）；
 * image 是每张（输出价）；audio_second 是每秒（合成算输出价，听写算输入价）。
 */
export const pointRateSchema = z.object({
  id: z.number().int(),
  vendorKey: z.string(),
  modelName: z.string(),
  unit: rateUnitSchema,
  inputPrice: z.number(),
  outputPrice: z.number(),
  updatedAt: epochMillisSchema,
});
export type PointRate = z.infer<typeof pointRateSchema>;

export interface PointRateEdit {
  vendorKey: string;
  modelName: string;
  unit: RateUnit;
  inputPrice: number;
  outputPrice: number;
}

// ---------- 用量明细 ----------

export const usageStatusSchema = z.enum(['charged', 'voided']);
export type UsageStatus = z.infer<typeof usageStatusSchema>;

/** 一条用量和它的报价：单价是结算当时的，改价不改历史。 */
export const usageLineSchema = z.object({
  kind: z.string(),
  vendorKey: z.string(),
  modelName: z.string(),
  unit: z.string(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  quantity: z.number(),
  /** 上游没报用量，是按字数估的。 */
  estimated: z.boolean(),
  /** 照定价表里哪一行算的；没找到价格是 `-`。 */
  ratedBy: z.string(),
  inputPrice: z.number(),
  outputPrice: z.number(),
  points: z.number(),
});
export type UsageLine = z.infer<typeof usageLineSchema>;

/** 网关每结算一次一行。一件事（actionId）背后可能有好几行：对话、向量、重排各一次。 */
export const usageLogSchema = z.object({
  id: z.number().int(),
  accountUid: z.number().int(),
  actionId: z.string(),
  purpose: z.string(),
  conversationId: z.string().nullable(),
  traceId: z.string().nullable(),
  status: usageStatusSchema,
  /** 上游成没成，只是记录；扣不扣看有没有用量。 */
  upstreamSuccess: z.boolean(),
  lines: z.array(usageLineSchema),
  /** 实扣的积分。 */
  amount: z.number(),
  createdAt: epochMillisSchema,
});
export type UsageLog = z.infer<typeof usageLogSchema>;

export type UsageLogQuery = {
  accountUid?: number;
  purpose?: string;
  status?: UsageStatus;
  /** Unix 毫秒，含。 */
  from?: number;
  /** Unix 毫秒，不含。 */
  to?: number;
};

export interface Paged<T> {
  items: T[];
  total: number;
}
