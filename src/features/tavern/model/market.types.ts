import { z } from 'zod';

import { epochMillisNullableSchema, epochMillisSchema } from '@/shared/lib/epoch';

import {
  accountRefSchema,
  presetSchema,
  ruleSchema,
  ruleVariableSchema,
  worldBookEntrySchema,
  worldBookNodeSchema,
} from './content.types';
import type { StatusTone } from './metering.types';

/**
 * Tavern 市场（C2C）的管理面（后端 `market.*`，wire camelCase、枚举 snake_case、时间 epoch 毫秒）。
 * 卖两类商品：角色卡、世界书（一整套世界模板，买了用它开新世界）。
 * 玩家发布即上架；员工只能事后下架 / 恢复，下架只是停售，已买的照常用。
 * 员工看的是市场上在卖的东西：没发布过的不列，版本不露——只给在卖的那一版。
 * 买家付人民币进平台钱包，卖家按「市场分成」拿积分。
 */

// ---------- 类别 ----------

export const marketItemKindSchema = z.enum(['character_card', 'world_book']);
export type MarketItemKind = z.infer<typeof marketItemKindSchema>;

export const MarketItemKindLabel: Readonly<Record<MarketItemKind, string>> = {
  character_card: '角色卡',
  world_book: '世界书',
};

// ---------- 门面与目录上露的样子 ----------

/** 两类一样的门面。 */
export const itemFaceSchema = z.object({
  name: z.string(),
  cover: z.string().nullable(),
  tagline: z.string().nullable(),
  description: z.string().nullable(),
  tags: z.array(z.string()),
});
export type ItemFace = z.infer<typeof itemFaceSchema>;

/** 角色才有的：头像和开场白。 */
export const characterProfileSchema = z.object({
  avatar: z.string().nullable(),
  greetings: z.array(z.string()),
});
export type CharacterProfile = z.infer<typeof characterProfileSchema>;

export const cardCapabilitiesSchema = z.object({
  moments: z.boolean(),
  mcpMemory: z.boolean(),
  imageGen: z.boolean(),
});

export const templateTimeModeSchema = z.enum(['frozen', 'realtime', 'turnbased']);
export type TemplateTimeMode = z.infer<typeof templateTimeModeSchema>;

/** 和客户端世界设置「时间」一样的叫法。 */
export const TemplateTimeModeLabel: Readonly<Record<TemplateTimeMode, string>> = {
  frozen: '停滞',
  realtime: '流逝',
  turnbased: '推进',
};

/** 开世界时的时间：流逝看倍率，推进看每回合分钟；故事钟从 `storyStart` 开始。 */
export const worldTimeTemplateSchema = z.object({
  mode: templateTimeModeSchema,
  ratio: z.number(),
  turnMinutes: z.number().int(),
  storyStart: z.string().nullable(),
});
export type WorldTimeTemplate = z.infer<typeof worldTimeTemplateSchema>;

/** 世界书的规模：几段叙事、几条设定、几条规则，时间怎么走。 */
export const worldTemplateSummarySchema = z.object({
  narratives: z.number().int(),
  settings: z.number().int(),
  rules: z.number().int(),
  time: worldTimeTemplateSchema,
});

/** 在售那一版在目录上露的样子，按类别分。 */
export const marketListingSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('character_card'),
    face: itemFaceSchema,
    character: characterProfileSchema,
    capabilities: cardCapabilitiesSchema,
  }),
  z.object({
    kind: z.literal('world_book'),
    face: itemFaceSchema,
    summary: worldTemplateSummarySchema,
  }),
]);
export type MarketListing = z.infer<typeof marketListingSchema>;

/** 价格；0 为免费。 */
export const marketPriceSchema = z.object({ amount: z.number(), currency: z.string() });
export type MarketPrice = z.infer<typeof marketPriceSchema>;

/** `rating` 是服务端算好的平均分。 */
export const marketStatsSchema = z.object({
  purchases: z.number().int().nonnegative(),
  rating: z.number(),
  ratingCount: z.number().int().nonnegative(),
});

/** 管理面只列发布过的，所以只有这两种。 */
export const marketItemStateSchema = z.enum(['listed', 'taken_down']);
export type MarketItemState = z.infer<typeof marketItemStateSchema>;
export const marketItemStateValues = marketItemStateSchema.options;

export const MarketItemStateLabel: Readonly<Record<MarketItemState, string>> = {
  listed: '在售',
  taken_down: '已下架',
};

export const MarketItemStateTone: Readonly<Record<MarketItemState, StatusTone>> = {
  listed: 'success',
  taken_down: 'danger',
};

export const itemTakedownSchema = z.object({
  reason: z.string(),
  staffUid: z.number().int(),
  atUtc: epochMillisSchema,
});

export const marketItemRowSchema = z.object({
  itemId: z.string().min(1),
  creator: accountRefSchema,
  /** 在卖那一版露的样子；类别看 `listing.kind`。 */
  listing: marketListingSchema,
  price: marketPriceSchema,
  stats: marketStatsSchema,
  state: marketItemStateSchema,
  takedown: itemTakedownSchema.nullable(),
  publishedAt: epochMillisNullableSchema,
  updatedAt: epochMillisSchema,
});
export type MarketItemRow = z.infer<typeof marketItemRowSchema>;

// ---------- 在卖的内容 ----------

/** 一段叙事：客户端世界「叙事」页的一条。 */
export const narrativeEntrySchema = z.object({ name: z.string(), content: z.string() });
export type NarrativeEntry = z.infer<typeof narrativeEntrySchema>;

/** 模板里的世界书、规则书是创作者世界里那两份文档原样；世界没写过时可能是空对象。 */
export const templateWorldBookSchema = z.looseObject({ nodes: z.array(worldBookNodeSchema).default([]) });
export const templateRulebookSchema = z.looseObject({
  variables: z.array(ruleVariableSchema).default([]),
  rules: z.array(ruleSchema).default([]),
});

/**
 * 在卖那一版的内容，按类别分：
 * - 角色卡：预设、描写与导入卡同形；
 * - 世界书：叙事、世界书、规则书、时间。
 */
export const marketItemContentSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('character_card'),
    face: itemFaceSchema,
    character: characterProfileSchema,
    preset: presetSchema,
    worldBook: z.array(worldBookEntrySchema),
    capabilities: cardCapabilitiesSchema,
  }),
  z.object({
    kind: z.literal('world_book'),
    face: itemFaceSchema,
    world: z.object({
      narratives: z.array(narrativeEntrySchema),
      worldBook: templateWorldBookSchema,
      rulebook: templateRulebookSchema,
      time: worldTimeTemplateSchema,
    }),
  }),
]);
export type MarketItemContent = z.infer<typeof marketItemContentSchema>;
export type CharacterCardContent = Extract<MarketItemContent, { kind: 'character_card' }>;
export type WorldBookContent = Extract<MarketItemContent, { kind: 'world_book' }>;

export const marketReviewSchema = z.object({
  id: z.number().int(),
  account: accountRefSchema,
  rating: z.number().int(),
  content: z.string().nullable(),
  updatedAt: epochMillisSchema,
});
export type MarketReview = z.infer<typeof marketReviewSchema>;

export const marketItemDetailSchema = z.object({
  item: marketItemRowSchema,
  onSale: marketItemContentSchema,
});
export type MarketItemDetail = z.infer<typeof marketItemDetailSchema>;

export type MarketItemQuery = {
  kind?: MarketItemKind;
  keyword?: string;
  creatorUid?: number;
  state?: MarketItemState;
  /** 上架时间范围，epoch 毫秒，可只给一头。 */
  fromUtc?: number;
  toUtc?: number;
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
  item: z.object({ id: z.string().min(1), kind: marketItemKindSchema, name: z.string() }),
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
  itemId?: string;
  kind?: MarketItemKind;
  buyerUid?: number;
  sellerUid?: number;
  source?: MarketOrderSource;
  /** 下单时间范围，epoch 毫秒，可只给一头。 */
  fromUtc?: number;
  toUtc?: number;
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
