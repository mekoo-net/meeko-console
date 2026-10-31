import { z } from 'zod';

import { epochMillisSchema } from '@/shared/lib/epoch';

/**
 * Tavern 价目表（tavern_settings 的 metering_pricing 行，对应后端 `MeteringPricingAdminDto`），
 * 整行原子读写，靠 version 防并发覆盖。
 * 金额 = 计价用量 × 模型倍率 × 单位基线；token 计价用量 = 输入 + 输出 × 输出权重；自主唤醒回合再 × 自主倍率。
 */

export const meteringUnitSchema = z.enum(['token', 'image', 'audio_second', 'video_second']);
export type MeteringUnit = z.infer<typeof meteringUnitSchema>;

export const MeteringUnitLabel: Readonly<Record<MeteringUnit, string>> = {
  token: 'Token',
  image: '图片',
  audio_second: '语音',
  video_second: '视频',
};

export const MeteringUnitSuffix: Readonly<Record<MeteringUnit, string>> = {
  token: '/token',
  image: '/张',
  audio_second: '/秒',
  video_second: '/秒',
};

/** 价目表的可编辑部分，读写同形。服务端保证四个单位都在。 */
export const pricingRulesSchema = z.object({
  baselines: z.array(z.object({ unit: meteringUnitSchema, price: z.number() })),
  /** 键是裸模型名：同一模型走不同渠道共用一个倍率。 */
  modelMultipliers: z.array(z.object({ modelName: z.string(), multiplier: z.number() })),
  defaultModelMultiplier: z.number(),
  completionWeight: z.number(),
  proactiveRateMultiplier: z.number(),
});
export type PricingRules = z.infer<typeof pricingRulesSchema>;
export type BaselinePrice = PricingRules['baselines'][number];
export type ModelMultiplier = PricingRules['modelMultipliers'][number];

/** 目录里的模型与近 30 天实际调用过的模型的并集，按裸名合并。 */
export const pricingModelSchema = z.object({
  modelName: z.string(),
  vendors: z.array(z.string()),
  inCatalog: z.boolean(),
  calls30d: z.number().int().nonnegative(),
});
export type PricingModel = z.infer<typeof pricingModelSchema>;

export const meteringPricingSchema = z.object({
  rules: pricingRulesSchema,
  /** 并发令牌，保存时原样带回；别人先改过就会被拒。 */
  version: z.number().int(),
  updatedAt: epochMillisSchema,
  models: z.array(pricingModelSchema),
});
export type MeteringPricing = z.infer<typeof meteringPricingSchema>;

export interface UpdateMeteringPricingInput {
  rules: PricingRules;
  version: number;
}

/** 与服务端校验同一上限：超过这个数基本是多打了几个 0。 */
export const PRICING_MAX = 1000;
