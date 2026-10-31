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
 * 卖两类商品：角色卡、世界线（一整套世界模板，买了用它开新世界）。
 * 玩家发布即上架；员工只能事后下架 / 恢复，下架只是停售，已买的照常用。
 * 员工看的是市场上在卖的东西：没发布过的不列，版本不露——只给在卖的那一版。
 * C2C：买家付人民币进平台钱包，卖家拿钱（人民币，记在 Tavern 账上）：平台抽成后先冻结，期满转可提现，提现由员工审核打款。
 */

// ---------- 类别 ----------

export const marketItemKindSchema = z.enum(['character_card', 'world_line']);
export type MarketItemKind = z.infer<typeof marketItemKindSchema>;

export const MarketItemKindLabel: Readonly<Record<MarketItemKind, string>> = {
  character_card: '角色卡',
  world_line: '世界线',
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

/** 世界线的规模：几段叙事、几条设定、几条规则，时间怎么走。 */
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
    kind: z.literal('world_line'),
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

/**
 * 管理面只列发布过的：在售、已下架（卖家自己下的或员工下的，卖家随时能重新上架）、
 * 已删除（管理员删的已下架商品，默认列表不显示，能恢复成已下架）。
 */
export const marketItemStateSchema = z.enum(['listed', 'unlisted', 'deleted']);
export type MarketItemState = z.infer<typeof marketItemStateSchema>;
export const marketItemStateValues = marketItemStateSchema.options;

export const MarketItemStateLabel: Readonly<Record<MarketItemState, string>> = {
  listed: '在售',
  unlisted: '已下架',
  deleted: '已删除',
};

export const MarketItemStateTone: Readonly<Record<MarketItemState, StatusTone>> = {
  listed: 'success',
  unlisted: 'warning',
  deleted: 'info',
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
 * - 世界线：叙事、世界书、规则书、时间。
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
    kind: z.literal('world_line'),
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
export type WorldLineContent = Extract<MarketItemContent, { kind: 'world_line' }>;

export const marketReviewSchema = z.object({
  id: z.number().int(),
  account: accountRefSchema,
  rating: z.number().int(),
  content: z.string().nullable(),
  updatedAt: epochMillisSchema,
});
export type MarketReview = z.infer<typeof marketReviewSchema>;

/** 好评 4–5 星、中评 3 星、差评 1–2 星（同常见电商的口径）。 */
export const reviewSentimentSchema = z.enum(['good', 'neutral', 'bad']);
export type ReviewSentiment = z.infer<typeof reviewSentimentSchema>;

export const ReviewSentimentLabel: Readonly<Record<ReviewSentiment, string>> = {
  good: '好评',
  neutral: '中评',
  bad: '差评',
};

export const reviewSummarySchema = z.object({
  good: z.number().int(),
  neutral: z.number().int(),
  bad: z.number().int(),
});
export type ReviewSummary = z.infer<typeof reviewSummarySchema>;

export type MarketReviewQuery = {
  accountUid?: number;
  sentiment?: ReviewSentiment;
};

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

/**
 * 订单状态：买家的权益和卖家的结算合成一个（服务端算好）。
 * 生效了、卖家的钱还在冻结期是「待结算」；冻结期满或本来没钱可分（免费、创作者那单）是「已完成」。
 */
export const marketOrderStageSchema = z.enum(['pending', 'charged', 'settling', 'completed', 'failed']);
export type MarketOrderStage = z.infer<typeof marketOrderStageSchema>;

export const MarketOrderStageLabel: Readonly<Record<MarketOrderStage, string>> = {
  pending: '待付款',
  charged: '已扣款',
  settling: '待结算',
  completed: '已完成',
  failed: '失败',
};

export const MarketOrderStageTone: Readonly<Record<MarketOrderStage, StatusTone>> = {
  pending: 'warning',
  charged: 'warning',
  settling: 'info',
  completed: 'success',
  failed: 'danger',
};

/** 列表上的一单；钱怎么分、账单号、失败原因在详情里。 */
export const marketOrderRowSchema = z.object({
  /** 客户端下单时给的幂等键，不给人看。 */
  id: z.string().min(1),
  /** 订单号：MO + yyyyMMdd + 9 位当天序号（平台流水号规范），按时间排。 */
  serialNo: z.string().min(1),
  source: marketOrderSourceSchema,
  item: z.object({ id: z.string().min(1), kind: marketItemKindSchema, name: z.string() }),
  buyer: accountRefSchema,
  seller: accountRefSchema,
  price: marketPriceSchema,
  stage: marketOrderStageSchema,
  createdAt: epochMillisSchema,
  updatedAt: epochMillisSchema,
});
export type MarketOrderRow = z.infer<typeof marketOrderRowSchema>;

export type MarketOrderQuery = {
  /** 订单号，精确匹配。 */
  serialNo?: string;
  itemId?: string;
  kind?: MarketItemKind;
  buyerUid?: number;
  sellerUid?: number;
  source?: MarketOrderSource;
  stage?: MarketOrderStage;
  /** 下单时间范围，epoch 毫秒，可只给一头。 */
  fromUtc?: number;
  toUtc?: number;
};

// ---------- 仓库（用户视角） ----------

/** 仓库里的一件：商品、在售状态、创作者、获得方式（购买 / 创作）、对应订单、获得时间。 */
export const inventoryRowSchema = z.object({
  item: z.object({ id: z.string().min(1), kind: marketItemKindSchema, name: z.string() }),
  /** 角色卡是头像，世界线是封面。 */
  image: z.string().nullable(),
  itemState: marketItemStateSchema,
  creator: accountRefSchema,
  source: marketOrderSourceSchema,
  orderId: z.string().min(1),
  serialNo: z.string().min(1),
  acquiredAt: epochMillisSchema,
});
export type InventoryRow = z.infer<typeof inventoryRowSchema>;

export type InventoryQuery = {
  kind?: MarketItemKind;
  source?: MarketOrderSource;
};

/** 仓库里的「获得方式」：买来的是「购买」，自己上架时得的那一份是「创作」。 */
export const InventorySourceLabel: Readonly<Record<MarketOrderSource, string>> = {
  purchase: '购买',
  creator: '创作',
};

// ---------- 分成设置 ----------

export const marketSettingsSchema = z.object({
  /** 平台抽成，0–1。 */
  commissionRate: z.number(),
  /** 卖出的钱冻结几天（留给退款）再转可提现。 */
  settlementDays: z.number().int(),
});
export type MarketSettings = z.infer<typeof marketSettingsSchema>;

/** `updatedAt` 为 null：没配过，用的是默认值。 */
export const marketSettingsViewSchema = z.object({
  settings: marketSettingsSchema,
  updatedAt: epochMillisNullableSchema,
});
export type MarketSettingsView = z.infer<typeof marketSettingsViewSchema>;

// ---------- 卖家收益与提现（人民币） ----------

/** 卖家收益四格。 */
export const sellerBalanceSchema = z.object({
  pending: z.number(),
  available: z.number(),
  withdrawing: z.number(),
  withdrawn: z.number(),
});
export type SellerBalance = z.infer<typeof sellerBalanceSchema>;

export const SellerBalanceLabel: Readonly<Record<keyof SellerBalance, string>> = {
  pending: '待结算',
  available: '可提现',
  withdrawing: '提现中',
  withdrawn: '已提现',
};

export const sellerEarningsSchema = z.object({ balance: sellerBalanceSchema });
export type SellerEarnings = z.infer<typeof sellerEarningsSchema>;

export const sellerTxnKindSchema = z.enum(['sale', 'settle', 'withdraw', 'withdraw_returned', 'withdraw_paid']);
export type SellerTxnKind = z.infer<typeof sellerTxnKindSchema>;

export const SellerTxnKindLabel: Readonly<Record<SellerTxnKind, string>> = {
  sale: '卖出',
  settle: '结算',
  withdraw: '申请提现',
  withdraw_returned: '提现退回',
  withdraw_paid: '已打款',
};

export const sellerTxnSchema = z.object({
  id: z.number().int(),
  kind: sellerTxnKindSchema,
  amount: z.number(),
  balanceAfter: sellerBalanceSchema,
  /** `ref` 是订单号或提现单号。 */
  source: z.object({ kind: z.enum(['order', 'withdrawal']), ref: z.string() }),
  note: z.string().nullable(),
  createdAt: epochMillisSchema,
});
export type SellerTxn = z.infer<typeof sellerTxnSchema>;

export const withdrawalStatusSchema = z.enum(['pending', 'approved', 'rejected', 'paid', 'failed']);
export type WithdrawalStatus = z.infer<typeof withdrawalStatusSchema>;

export const WithdrawalStatusLabel: Readonly<Record<WithdrawalStatus, string>> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
  paid: '已打款',
  failed: '打款失败',
};

export const WithdrawalStatusTone: Readonly<Record<WithdrawalStatus, StatusTone>> = {
  pending: 'warning',
  approved: 'info',
  rejected: 'danger',
  paid: 'success',
  failed: 'danger',
};

export const withdrawalMethodSchema = z.enum(['alipay', 'bank']);
export type WithdrawalMethod = z.infer<typeof withdrawalMethodSchema>;

export const WithdrawalMethodLabel: Readonly<Record<WithdrawalMethod, string>> = {
  alipay: '支付宝',
  bank: '银行卡',
};

export const withdrawalRowSchema = z.object({
  id: z.string().min(1),
  /** 提现单号：MW + yyyyMMdd + 9 位当天序号。 */
  serialNo: z.string().min(1),
  account: accountRefSchema,
  amount: z.number(),
  payout: z.object({ method: withdrawalMethodSchema, accountNo: z.string(), accountName: z.string() }),
  status: withdrawalStatusSchema,
  /** 驳回或打款失败的原因。 */
  reason: z.string().nullable(),
  appliedAt: epochMillisSchema,
  updatedAt: epochMillisSchema,
});
export type WithdrawalRow = z.infer<typeof withdrawalRowSchema>;

export type WithdrawalQuery = {
  status?: WithdrawalStatus;
  accountUid?: number;
  /** 提现单号，精确匹配。 */
  serialNo?: string;
  /** 申请时间范围，epoch 毫秒，可只给一头。 */
  fromUtc?: number;
  toUtc?: number;
};

// ---------- 订单详情 ----------

/**
 * 一单的钱怎么分（人民币）：抽成比例和金额、卖家所得。`settlesAt` 是卖家的钱转可提现的时间，`settledAt` 为 null 表示还在冻结期；
 * 免费的单两个时间都是 null。
 */
export const orderSettlementSchema = z.object({
  commissionRate: z.number(),
  platformAmount: z.number(),
  sellerAmount: z.number(),
  settlesAt: epochMillisNullableSchema,
  settledAt: epochMillisNullableSchema,
});
export type OrderSettlement = z.infer<typeof orderSettlementSchema>;

/** `billSerialNo` 是平台钱包扣款的账单号（免费的没有）；`sellerTxns` 是卖家收益里因这一单记的流水。 */
export const marketOrderDetailSchema = z.object({
  order: marketOrderRowSchema,
  itemVersion: z.number().int(),
  billSerialNo: z.string().nullable(),
  failureReason: z.string().nullable(),
  settlement: orderSettlementSchema.nullable(),
  sellerTxns: z.array(sellerTxnSchema),
});
export type MarketOrderDetail = z.infer<typeof marketOrderDetailSchema>;
