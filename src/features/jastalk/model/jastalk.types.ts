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
 * 命中缓存的输入每百万 token 多少积分（只有对话用得上：向量、重排没有缓存这一说）。
 * - null：没有单独的缓存价，命中缓存的按输入价算；
 * - 没有这个字段（undefined）：后端还不分缓存价——页面上不摆缓存那一档，也不让填，免得填了后端不认、悄悄丢掉。
 *
 * 角色扮演每一轮都把人设和前面的对话重发一遍，命中缓存的占输入的大头；上游对命中缓存的只收一成左右，
 * 按输入价扣的话用户多花，也和渠道的成本对不上。
 * TODO(网关)：价格表加缓存价（编译时取牌价的 `input.cachedRead` × 倍率 × 100）；网关上报用量时把命中缓存的 token 单列——
 * 现在 Anthropic 那一路是把 `cache_read_input_tokens` 加进输入、按输入价扣的（Jastalk.Infrastructure/Llm/AnthropicMessages.cs）。
 */
const cachedInputPriceSchema = z.number().nullable().optional();

/**
 * 目录里的一行：用户能选的一个模型。渠道和模型名原样发给 OneApi。
 * `priced`：价格表里找得到按 `unit` 算的价格；找不到的用户选不了（不能不冻积分就调）。
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
  cachedInputPrice: cachedInputPriceSchema,
  /** 照价格表里哪一行算的：「渠道/模型」，通配写 `*`；没有是 null。 */
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

// ---------- 渠道 ----------

/**
 * 一个渠道：OneApi 上的一个 provider（kiro、claude……），清单是后端回的，不手敲。
 * 渠道上只定一个倍率：有效价（元）= 牌价（美元）× 倍率，再 × 100 折成积分——倍率本身就是美元到人民币的换算，
 * 和 Yomi 的渠道倍率同一个意思。价格后端算好，这边只显示。
 */
export const channelSchema = z.object({
  vendorKey: z.string(),
  vendorName: z.string(),
  /** 没设是 null：这个渠道不按牌价算，它的模型只认单独定的价。 */
  multiplier: z.number().nullable(),
  /** OneApi 那边现在有这个渠道的 provider 在跑。 */
  online: z.boolean(),
  /** OneApi 那边这个渠道发布了多少个模型。 */
  upstreamModels: z.number().int(),
  /** 接进目录的有多少个；`priced + unpriced` 就是它。 */
  models: z.number().int(),
  priced: z.number().int(),
  unpriced: z.number().int(),
  /** 没在这边设置过（没定过名字、倍率）的渠道是 null。 */
  updatedAt: epochMillisNullableSchema,
});
export type Channel = z.infer<typeof channelSchema>;

export const channelBoardSchema = z.object({
  /** 目录和价格表合起来的版本号，每改一次加一；网关凭它知道手上那份还新不新。 */
  version: z.number().int().nonnegative(),
  channels: z.array(channelSchema),
  /** false = 这次没读到 OneApi 的渠道目录，在线状态和可接入的模型不准。 */
  upstreamReachable: z.boolean(),
  /** false = 手上没有牌价，算不了新价；已经算好的照旧在用。 */
  listPricesLoaded: z.boolean(),
  listPriceCount: z.number().int(),
});
export type ChannelBoard = z.infer<typeof channelBoardSchema>;

/**
 * 一个模型在牌价（OneApi 的价格表，美元，全站一份，在别处维护）里对上的那一行。
 * `usdInput` / `usdOutput` 是折算时取的那两个数：按 token 的是每百万 token 的输入价、输出价；按张的只有输出；按秒的两个一样。
 */
export const listPriceSchema = z.object({
  modelKey: z.string(),
  maker: z.string(),
  /** 牌价的计价方式（per_token、per_image……），只拿来显示；后端加了新的这边原样显示。 */
  billingType: z.string(),
  /** 牌价原文，形状随 `billingType`。 */
  rate: z.unknown(),
  usdInput: z.number().nullable(),
  usdOutput: z.number().nullable(),
  /**
   * 牌价里命中缓存的输入价（美元 / 百万 token，牌价的 `input.cachedRead`）。不是按 token 计价、牌价没写缓存价的是 null，
   * 那样命中缓存的按输入价算。TODO(网关)：后端还没回这个字段，没有就当 null。
   */
  usdCachedInput: z.number().nullish().transform((v) => v ?? null),
  /** false = 牌价的计价方式折不成这个模型的计量单位，只能单独定价。 */
  convertible: z.boolean(),
  /** 按渠道现在的倍率折出来的积分；渠道没设倍率、或者折不了是 null。 */
  pointsInput: z.number().nullable(),
  pointsOutput: z.number().nullable(),
  /** 缓存价按渠道现在的倍率折出来的积分；`usdCachedInput` 是 null、或者渠道没设倍率时是 null。 */
  pointsCachedInput: z.number().nullish().transform((v) => v ?? null),
});
export type ListPrice = z.infer<typeof listPriceSchema>;

/**
 * 一个模型现在的价格是怎么来的：compiled 按牌价 × 渠道倍率算出来的；manual 这个模型单独定的；
 * default 落在通配的默认价上；none 没有价格（用户选不了）。
 */
export const channelPricings = ['compiled', 'manual', 'default', 'none'] as const;
export const channelPricingSchema = z.enum(channelPricings);
export type ChannelPricing = z.infer<typeof channelPricingSchema>;

export const channelModelSchema = z.object({
  model: catalogModelSchema,
  pricing: channelPricingSchema,
  /**
   * 这个模型自己那一行价格的编号：单独定的、算出来的才有。落在通配价上的是 null——那一行不归它，
   * 不能让页面顺手删了。从单独定价切回跟渠道，就是拿它去删那一行。
   */
  rateId: z.number().int().nullable(),
  /** null = 牌价里对不上这个模型。 */
  listPrice: listPriceSchema.nullable(),
  /** false = OneApi 那边现在没发布这个模型了。 */
  upstream: z.boolean(),
});
export type ChannelModel = z.infer<typeof channelModelSchema>;

/** OneApi 有、还没接进来的模型。还没接的不知道归哪一类，牌价按取详情时带的那个类别的计量单位折（不带是对话）。 */
export const upstreamModelSchema = z.object({
  modelName: z.string(),
  listPrice: listPriceSchema.nullable(),
});
export type UpstreamModel = z.infer<typeof upstreamModelSchema>;

export const channelDetailSchema = z.object({
  channel: channelSchema,
  models: z.array(channelModelSchema),
  available: z.array(upstreamModelSchema),
});
export type ChannelDetail = z.infer<typeof channelDetailSchema>;

/** 和后端的上限一样（只拦手滑多敲几个 0）。 */
export const MULTIPLIER_MAX = 1000;

/** `vendorName` 不给就用渠道的键；`multiplier` 给 null = 这个渠道不按牌价算，它算出来的价会被删掉。 */
export interface ChannelEdit {
  vendorName: string | null;
  multiplier: number | null;
}

export const unmatchedReasonSchema = z.enum(['no_list_price', 'unit_mismatch']);
export type UnmatchedReason = z.infer<typeof unmatchedReasonSchema>;

/**
 * 一次重算的结果。`unmatched` 是设了倍率但这次算不出价的模型（原来有价的还在用原来的）；
 * `listPricesEmpty` 是这次手上没有牌价、什么都没重算，不代表模型没有价格。
 */
export const rateCompileResultSchema = z.object({
  compiled: z.number().int(),
  unchanged: z.number().int(),
  removed: z.number().int(),
  unmatched: z.array(z.object({ vendorKey: z.string(), modelName: z.string(), reason: unmatchedReasonSchema })),
  listPricesEmpty: z.boolean(),
  /** 有改动时目录的新版本号；没改动是 null。 */
  newVersion: z.number().int().nullable(),
});
export type RateCompileResult = z.infer<typeof rateCompileResultSchema>;

export const channelSavedSchema = z.object({ channel: channelSchema, compile: rateCompileResultSchema });
export type ChannelSaved = z.infer<typeof channelSavedSchema>;

/** 从 OneApi 的清单里接一批模型，一次接一类。 */
export interface ModelImport {
  category: ModelCategory;
  models: string[];
  enabled: boolean;
}

export const modelImportResultSchema = z.object({
  added: z.number().int(),
  /** 这一类里本来就有、跳过的。 */
  skipped: z.number().int(),
  compile: rateCompileResultSchema,
});
export type ModelImportResult = z.infer<typeof modelImportResultSchema>;

// ---------- 价格表 ----------

/** 通配：渠道写 `*` 即不分渠道；`*` / `*` 是默认价。 */
export const ANY = '*';

export const rateSourceSchema = z.enum(['manual', 'compiled']);
export type RateSource = z.infer<typeof rateSourceSchema>;

/**
 * 价格表的一行。单价的意思看 `unit`：token 是每百万 token 多少积分（输入、输出分开）；
 * image 是每张（输出价）；audio_second 是每秒（合成算输出价，听写算输入价）。
 * `source`：compiled 是按牌价 × 渠道倍率算出来的，牌价或倍率一变就跟着重算；manual 是人单独定的，重算不碰它。
 */
export const pointRateSchema = z.object({
  id: z.number().int(),
  vendorKey: z.string(),
  modelName: z.string(),
  unit: rateUnitSchema,
  inputPrice: z.number(),
  outputPrice: z.number(),
  cachedInputPrice: cachedInputPriceSchema,
  updatedAt: epochMillisSchema,
  source: rateSourceSchema,
  /** 算出来的行对上的是牌价里哪个键；单独定的没有。 */
  sourceModelKey: z.string().nullable(),
  /** 算出来的行用的渠道倍率；单独定的没有。 */
  multiplierApplied: z.number().nullable(),
});
export type PointRate = z.infer<typeof pointRateSchema>;

export interface PointRateEdit {
  vendorKey: string;
  modelName: string;
  unit: RateUnit;
  inputPrice: number;
  outputPrice: number;
  /** null = 命中缓存的按输入价算。不带这个字段是没摆缓存那一档（后端还不分缓存价），不是「清掉」。 */
  cachedInputPrice?: number | null;
}

// ---------- 用量明细 ----------

export const usageStatusSchema = z.enum(['charged', 'voided']);
export type UsageStatus = z.infer<typeof usageStatusSchema>;

/**
 * 一条用量的单价是怎么来的，结算当时的快照：后来改了倍率、牌价，这里不变，查账时看得出当时为什么是这个价。
 * TODO(网关)：结算时还没记，没有是 null（页面上只写照价格表里哪一行算的）。
 */
export const usageBasisSchema = z.object({
  /** compiled 牌价 × 渠道倍率算出来的；manual 单独定的；default 落在通配的默认价上。 */
  source: z.enum(['compiled', 'manual', 'default']),
  /** 算出来的：对上的牌价键、当时的渠道倍率、当时牌价里的三个数（美元 / 百万 token）。别的来源都是 null。 */
  listModelKey: z.string().nullable(),
  multiplier: z.number().nullable(),
  usdInput: z.number().nullable(),
  usdCachedInput: z.number().nullable(),
  usdOutput: z.number().nullable(),
});
export type UsageBasis = z.infer<typeof usageBasisSchema>;

/** 一条用量和它的报价：单价是结算当时的，改价不改历史。只有管理端看得到这些数，用户那边只给积分。 */
export const usageLineSchema = z.object({
  kind: z.string(),
  vendorKey: z.string(),
  modelName: z.string(),
  unit: z.string(),
  /** 没命中缓存的输入（含这一次新写进缓存的）。 */
  inputTokens: z.number().int(),
  /** 命中缓存的输入。TODO(网关)：后端还没分出来，现在命中缓存的算在 `inputTokens` 里、按输入价扣；没有这个字段是 0。 */
  cachedInputTokens: z.number().int().nullish().transform((v) => v ?? 0),
  outputTokens: z.number().int(),
  quantity: z.number(),
  /** 上游没报用量，是按字数估的。 */
  estimated: z.boolean(),
  /** 照价格表里哪一行算的；没找到价格是 `-`。 */
  ratedBy: z.string(),
  inputPrice: z.number(),
  outputPrice: z.number(),
  /** 结算当时的缓存价；null = 没有单独的缓存价，命中缓存的按输入价算。 */
  cachedInputPrice: z.number().nullish().transform((v) => v ?? null),
  basis: usageBasisSchema.nullish().transform((v) => v ?? null),
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
