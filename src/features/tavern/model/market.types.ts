import { z } from 'zod';

import { epochMillisNullableSchema, epochMillisSchema } from '@/shared/lib/epoch';

import { accountRefSchema, jsonValueSchema, presetSchema } from './content.types';
import type { StatusTone } from './metering.types';

/**
 * Tavern 角色卡市场（C2C）的管理面（后端 `market.*`，wire camelCase、枚举 snake_case、时间 epoch 毫秒）。
 * 玩家发布即上架；员工只能事后下架 / 恢复，下架只是停售，已买的照常用手里的版本。
 * 买家付人民币进平台钱包，卖家按「市场分成」拿积分。
 */

// ---------- 卡 ----------

export const cardFaceSchema = z.object({
  name: z.string(),
  avatar: z.string().nullable(),
  cover: z.string().nullable(),
  tagline: z.string().nullable(),
  description: z.string().nullable(),
  tags: z.array(z.string()),
  greetings: z.array(z.string()),
});
export type CardFace = z.infer<typeof cardFaceSchema>;

export const cardCapabilitiesSchema = z.object({
  moments: z.boolean(),
  mcpMemory: z.boolean(),
  imageGen: z.boolean(),
});

/** 价格；0 为免费。 */
export const marketPriceSchema = z.object({ amount: z.number(), currency: z.string() });
export type MarketPrice = z.infer<typeof marketPriceSchema>;

/** `rating` 是服务端算好的平均分。 */
export const marketStatsSchema = z.object({
  purchases: z.number().int().nonnegative(),
  rating: z.number(),
  ratingCount: z.number().int().nonnegative(),
});

export const marketCardStateSchema = z.enum(['draft', 'listed', 'taken_down']);
export type MarketCardState = z.infer<typeof marketCardStateSchema>;
export const marketCardStateValues = marketCardStateSchema.options;

export const MarketCardStateLabel: Readonly<Record<MarketCardState, string>> = {
  draft: '未发布',
  listed: '在售',
  taken_down: '已下架',
};

export const MarketCardStateTone: Readonly<Record<MarketCardState, StatusTone>> = {
  draft: 'info',
  listed: 'success',
  taken_down: 'danger',
};

export const cardTakedownSchema = z.object({
  reason: z.string(),
  staffUid: z.number().int(),
  atUtc: epochMillisSchema,
});

export const marketCardRowSchema = z.object({
  cardId: z.string().min(1),
  creator: accountRefSchema,
  /** 发布过的是在售卡面，没发布过的是草稿的。 */
  face: cardFaceSchema,
  price: marketPriceSchema,
  /** 最新发布的版本；没发布过为 0。 */
  version: z.number().int().nonnegative(),
  stats: marketStatsSchema,
  state: marketCardStateSchema,
  takedown: cardTakedownSchema.nullable(),
  /** 创作者有没发布的改动。 */
  hasDraft: z.boolean(),
  publishedAt: epochMillisNullableSchema,
  updatedAt: epochMillisSchema,
});
export type MarketCardRow = z.infer<typeof marketCardRowSchema>;

/** 一个版本的内容：preset / worldBook 与导入卡同形，原样展示。 */
export const cardVersionContentSchema = z.object({
  face: cardFaceSchema,
  preset: presetSchema,
  worldBook: z.array(jsonValueSchema),
  capabilities: cardCapabilitiesSchema,
});
export type CardVersionContent = z.infer<typeof cardVersionContentSchema>;

export const marketCardVersionSchema = z.object({
  version: z.number().int(),
  price: z.number(),
  content: cardVersionContentSchema,
  publishedAt: epochMillisSchema,
});
export type MarketCardVersion = z.infer<typeof marketCardVersionSchema>;

export const marketReviewSchema = z.object({
  id: z.number().int(),
  account: accountRefSchema,
  rating: z.number().int(),
  content: z.string().nullable(),
  cardVersion: z.number().int(),
  updatedAt: epochMillisSchema,
});
export type MarketReview = z.infer<typeof marketReviewSchema>;

export const marketCardDetailSchema = z.object({
  card: marketCardRowSchema,
  /** 创作者还没发布的下一版。 */
  draft: z.object({ content: cardVersionContentSchema, price: z.number() }).nullable(),
  /** 最新在前。 */
  versions: z.array(marketCardVersionSchema),
  reviews: z.array(marketReviewSchema),
});
export type MarketCardDetail = z.infer<typeof marketCardDetailSchema>;

export type MarketCardQuery = {
  keyword?: string;
  creatorUid?: number;
  state?: MarketCardState;
};

// ---------- 订单 ----------

export const marketOrderSourceSchema = z.enum(['purchase', 'creator']);
export type MarketOrderSource = z.infer<typeof marketOrderSourceSchema>;

export const MarketOrderSourceLabel: Readonly<Record<MarketOrderSource, string>> = {
  purchase: '购买',
  creator: '创作者',
};

export const marketOrderStatusSchema = z.enum(['pending', 'charged', 'active', 'failed']);
export type MarketOrderStatus = z.infer<typeof marketOrderStatusSchema>;

export const MarketOrderStatusLabel: Readonly<Record<MarketOrderStatus, string>> = {
  pending: '待付款',
  charged: '已扣款',
  active: '已生效',
  failed: '失败',
};

export const MarketOrderStatusTone: Readonly<Record<MarketOrderStatus, StatusTone>> = {
  pending: 'warning',
  charged: 'warning',
  active: 'success',
  failed: 'danger',
};

/** 成交时的分成快照。 */
export const marketSettlementSchema = z.object({
  commissionRate: z.number(),
  creditsPerYuan: z.number(),
  sellerCredits: z.number(),
});

export const marketOrderRowSchema = z.object({
  id: z.string().min(1),
  source: marketOrderSourceSchema,
  card: z.object({ id: z.string().min(1), name: z.string() }),
  cardVersion: z.number().int(),
  buyer: accountRefSchema,
  seller: accountRefSchema,
  price: marketPriceSchema,
  status: marketOrderStatusSchema,
  settlement: marketSettlementSchema.nullable(),
  failureReason: z.string().nullable(),
  createdAt: epochMillisSchema,
  updatedAt: epochMillisSchema,
});
export type MarketOrderRow = z.infer<typeof marketOrderRowSchema>;

export type MarketOrderQuery = {
  cardId?: string;
  buyerUid?: number;
  sellerUid?: number;
  source?: MarketOrderSource;
};

// ---------- 分成设置 ----------

export const marketSettingsSchema = z.object({
  /** 平台抽成，0–1。 */
  commissionRate: z.number(),
  /** 卖家所得每 1 元换多少积分。 */
  creditsPerYuan: z.number(),
});
export type MarketSettings = z.infer<typeof marketSettingsSchema>;

/** `updatedAt` 为 null：没配过，用的是默认值。 */
export const marketSettingsViewSchema = z.object({
  settings: marketSettingsSchema,
  updatedAt: epochMillisNullableSchema,
});
export type MarketSettingsView = z.infer<typeof marketSettingsViewSchema>;
