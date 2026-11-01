import { z } from 'zod';

import { epochMillisSchema } from '@/shared/lib/epoch';

import { accountRefSchema } from './content.types';
import { creditBalanceSchema } from './credits.types';
import { marketItemKindSchema, marketItemStateSchema, type MarketItemKind } from './market.types';

/**
 * Tavern 的玩家（后端 `platform.users`）：玩家进 Tavern 时客户端调 onboarding 落一行，之后每次进来刷新最近活跃。
 * 名字、邮箱、手机是平台账户的，服务端按页从 Keystone 补上。
 */
export const tavernUserSchema = z.object({
  account: accountRefSchema,
  credits: creditBalanceSchema,
  joinedAt: epochMillisSchema,
  lastSeenAt: epochMillisSchema,
});
export type TavernUser = z.infer<typeof tavernUserSchema>;

/** 玩家在 WorldLine 里现有的世界线和联系人数，玩家删掉的不算。 */
export const userContentStatsSchema = z.object({
  worlds: z.number().int().nonnegative(),
  cards: z.number().int().nonnegative(),
});
export type UserContentStats = z.infer<typeof userContentStatsSchema>;

/** 手里几张卡，按类别分（自己做的和买来的；权益在工坊）。 */
export const ownedCardsSchema = z.object({
  worldCards: z.number().int().nonnegative(),
  characterCards: z.number().int().nonnegative(),
});
export type OwnedCards = z.infer<typeof ownedCardsSchema>;

/** 上架过几件（下架的也算）。 */
export const userMarketStatsSchema = z.object({
  listed: z.number().int().nonnegative(),
});
export type UserMarketStats = z.infer<typeof userMarketStatsSchema>;

/** 用户视角的头部。`content` 在 WorldLine 不通时为 null，头部照常显示其余的。 */
export const tavernUserDetailSchema = z.object({
  user: tavernUserSchema,
  content: userContentStatsSchema.nullable(),
  cards: ownedCardsSchema,
  market: userMarketStatsSchema,
});
export type TavernUserDetail = z.infer<typeof tavernUserDetailSchema>;

/** `keyword` 搜平台账户的名字 / 邮箱 / 手机。 */
export type UserQuery = {
  uid?: number;
  keyword?: string;
};

// ---------- 用户手里的卡（用户视角 › 卡片） ----------

/** 卡是怎么来的：自己做的（作者）、在市场买的。权益在工坊；按来源筛时用它。 */
export const entitlementSourceSchema = z.enum(['authored', 'purchased']);
export type EntitlementSource = z.infer<typeof entitlementSourceSchema>;

export const EntitlementSourceLabel: Readonly<Record<EntitlementSource, string>> = {
  authored: '创作',
  purchased: '购买',
};

/** 同服务端 `EntitlementOrigin`，按 `kind` 判别：买来的带着那一单。 */
export const entitlementOriginSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('authored') }),
  z.object({ kind: z.literal('purchased'), orderId: z.string().min(1), serialNo: z.string().min(1) }),
]);
export type EntitlementOrigin = z.infer<typeof entitlementOriginSchema>;

/** 一张卡：`image` 是角色卡头像、世界卡封面。 */
export const cardRefSchema = z.object({
  id: z.string().min(1),
  kind: marketItemKindSchema,
  name: z.string(),
  image: z.string().nullable(),
});
export type CardRef = z.infer<typeof cardRefSchema>;

/** 手里的一张卡（工坊）：卡、作者、怎么来的、得到时第几版（自己做的为 0）、什么时候得的。 */
export const heldCardSchema = z.object({
  card: cardRefSchema,
  author: accountRefSchema,
  origin: entitlementOriginSchema,
  acquiredVersion: z.number().int().nonnegative(),
  acquiredAt: epochMillisSchema,
});
export type HeldCard = z.infer<typeof heldCardSchema>;

/** 用户视角「卡片」的一行：手里的卡（工坊）和它在市场上的状态（市场；没上过架为 null）。 */
export const userCardRowSchema = z.object({
  held: heldCardSchema,
  market: marketItemStateSchema.nullable(),
});
export type UserCardRow = z.infer<typeof userCardRowSchema>;

export type UserCardQuery = {
  kind?: MarketItemKind;
  source?: EntitlementSource;
};
