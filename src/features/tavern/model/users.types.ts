import { z } from 'zod';

import { epochMillisSchema } from '@/shared/lib/epoch';

import { accountRefSchema } from './content.types';
import { creditBalanceSchema } from './credits.types';

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

/** 玩家在 WorldLine 里现有的世界和角色卡数，玩家删掉的不算。 */
export const userContentStatsSchema = z.object({
  worlds: z.number().int().nonnegative(),
  cards: z.number().int().nonnegative(),
});
export type UserContentStats = z.infer<typeof userContentStatsSchema>;

/** 在市场里买过几张（不算创作者自己那一单）、发布过几张。 */
export const userMarketStatsSchema = z.object({
  purchased: z.number().int().nonnegative(),
  published: z.number().int().nonnegative(),
});
export type UserMarketStats = z.infer<typeof userMarketStatsSchema>;

/** 用户视角的头部。`content` 在 WorldLine 不通时为 null，头部照常显示其余的。 */
export const tavernUserDetailSchema = z.object({
  user: tavernUserSchema,
  content: userContentStatsSchema.nullable(),
  market: userMarketStatsSchema,
});
export type TavernUserDetail = z.infer<typeof tavernUserDetailSchema>;

/** `keyword` 搜平台账户的名字 / 邮箱 / 手机。 */
export type UserQuery = {
  uid?: number;
  keyword?: string;
};
