import { z } from 'zod';

import type { BillingType } from './enums';

const uidString = z.union([z.string(), z.number()]).transform((v) => String(v));

/**
 * 模型定价（discriminated union）。
 *
 * 与 Model 是 1..1：每个 modelId 一条 Pricing 记录。删除 Model 必须级联删 Pricing。
 *
 * **形状**：顶层 `billingType` 是判别字段；`pricing` 嵌套对象的形状随 `billingType` 变化。
 * 6 种类型见 `BillingType`；细节见 `docs/api/10-demuxai-pricing.md`。
 *
 * **金额单位**：与钱包同币种（默认元）；不同 `billingType` 用各自计量单位。
 *
 * **倍率层**：所有 `billingType` 的基础金额最后统一乘 `multiplier × tierMultiplier`，
 * 这两个量与 `billingType` 无关，放在外层。
 *
 * **`tierMultipliers`**：按用户 LV 单独覆盖的倍率（如 `"5" → 0.7`）。未列出的 LV 走 1.0。
 * key 是 LV 整数字符串。与 `pricing.tiers[]`（产品档位）**是两个概念**——前者是
 * "用户级折扣"，后者是"产品分辨率/质量档"。
 */

// ---------- pricing 子形状（按 billingType） ----------

/**
 * `per_token` 单价 schema —— **单位：元 / 1M tokens**（与 OpenAI / Anthropic / Google
 * 等厂家定价页对齐，避免对账时反复 ×1000）。
 *
 * 结构上与 `log.cost.input/output` 对称（input/output 父子集嵌套），
 * BFF 拷贝快照到 log 时是 1:1 path 映射，只需在每个维度多写一个 `amount` 字段：
 *
 *   log.cost.input.cachedRead = {
 *     perMToken: pricing.input.cachedRead ?? 0,
 *     amount:    usage.input.cachedReadTokens / 1_000_000 × (pricing.input.cachedRead ?? 0) × multiplier
 *   }
 *
 * 子维度直接用 `number?` 而不是 `{ perMToken }?` —— pricing 端每个维度本质上就是一个单价数字，
 * 没必要为了视觉对称多包一层（cost 端要包是因为每个维度有 `perMToken + amount` 一对）。
 */
export const perTokenPricingSchema = z.object({
  input: z.object({
    /** 主输入 token 单价（元 / 1M tokens）。 */
    perMToken: z.number().nonnegative(),
    /** 命中 prompt cache 的输入单价（OpenAI cached input ≈ base × 0.5 / Anthropic cache read ≈ base × 0.1）；省略 = 不支持。 */
    cachedRead: z.number().nonnegative().optional(),
    /** **5 分钟 TTL** cache 写单价（Anthropic 默认 TTL，约 base × 1.25）；省略 = 不支持。 */
    cachedWrite5m: z.number().nonnegative().optional(),
    /** **1 小时 TTL** cache 写单价（Anthropic 长 TTL，约 base × 2.0，比 5m 贵 ~60%）；省略 = 不支持。 */
    cachedWrite1h: z.number().nonnegative().optional(),
    /** 输入音频 token 单价（GPT-4o-audio / Realtime，约 base × 16）；省略 = 不支持音频输入。 */
    audio: z.number().nonnegative().optional(),
  }),
  output: z.object({
    /** 主输出 token 单价；embedding / rerank 等无输出场景填 0。 */
    perMToken: z.number().nonnegative(),
    /** 推理 token 单价（o1 / o3 / Claude extended thinking / Gemini thoughts）；省略 = 与 output 等价。 */
    reasoning: z.number().nonnegative().optional(),
    /** 输出音频 token 单价（GPT-4o-audio，约 base × 8）；省略 = 不支持音频输出。 */
    audio: z.number().nonnegative().optional(),
  }),
});
export type PerTokenPricing = z.infer<typeof perTokenPricingSchema>;

export const perCallPricingSchema = z.object({
  pricePerCall: z.number().nonnegative(),
  cachedPricePerCall: z.number().nonnegative().optional(),
});
export type PerCallPricing = z.infer<typeof perCallPricingSchema>;

export const perImageTierSchema = z.object({
  /** 例：`"1024x1024"` / `"1792x1024"` */
  size: z.string().min(1),
  /** 例：`"standard"` / `"hd"` / `"draft"`；单档模型填 `"default"`。 */
  quality: z.string().min(1),
  pricePerImage: z.number().nonnegative(),
});
export type PerImageTier = z.infer<typeof perImageTierSchema>;

export const perImagePricingSchema = z
  .object({ tiers: z.array(perImageTierSchema).min(1) })
  .refine(
    (v) => {
      const keys = v.tiers.map((t) => `${t.size}|${t.quality}`);
      return new Set(keys).size === keys.length;
    },
    { message: 'per_image.tiers 不允许 (size, quality) 重复', path: ['tiers'] },
  );
export type PerImagePricing = z.infer<typeof perImagePricingSchema>;

export const perVideoTierSchema = z.object({
  /** 例：`"720p"` / `"1080p"` / `"4k"` */
  resolution: z.string().min(1),
  pricePerSecond: z.number().nonnegative(),
});
export type PerVideoTier = z.infer<typeof perVideoTierSchema>;

export const perVideoPricingSchema = z
  .object({
    tiers: z.array(perVideoTierSchema).min(1),
    minSeconds: z.number().positive().optional(),
    maxSeconds: z.number().positive().optional(),
  })
  .refine(
    (v) => new Set(v.tiers.map((t) => t.resolution)).size === v.tiers.length,
    { message: 'per_video.tiers 不允许 resolution 重复', path: ['tiers'] },
  )
  .refine((v) => v.minSeconds == null || v.maxSeconds == null || v.minSeconds <= v.maxSeconds, {
    message: 'minSeconds 必须 ≤ maxSeconds',
    path: ['maxSeconds'],
  });
export type PerVideoPricing = z.infer<typeof perVideoPricingSchema>;

export const perAudioMinutePricingSchema = z.object({
  pricePerMinute: z.number().nonnegative(),
});
export type PerAudioMinutePricing = z.infer<typeof perAudioMinutePricingSchema>;

export const perCharacterPricingSchema = z.object({
  pricePerKChar: z.number().nonnegative(),
});
export type PerCharacterPricing = z.infer<typeof perCharacterPricingSchema>;

// ---------- 外层共通字段 ----------

const pricingBaseShape = {
  uid: uidString,
  /** 与 Model.modelId 强一致；删除 Model 必须级联删 Pricing */
  modelId: z.string().min(1),
  multiplier: z.number().positive(),
  currency: z.string(),
  /** key 是 LV 字符串，value 是该 LV 的倍率（如 `"5" → 0.7`）。 */
  tierMultipliers: z.record(z.string(), z.number().positive()),
  /** 生效时间（UTC）；未来时间 = 预生效。BFF 调度按"最近一条已生效"取数。 */
  effectiveFromUtc: z.string(),
  updatedAtUtc: z.string(),
  /** 最近一次改动操作人 IAM uid */
  updatedByIamUid: uidString.nullable().optional(),
};

// ---------- 主 schema（discriminated union） ----------

export const pricingSchema = z.discriminatedUnion('billingType', [
  z.object({
    ...pricingBaseShape,
    billingType: z.literal('per_token'),
    pricing: perTokenPricingSchema,
  }),
  z.object({
    ...pricingBaseShape,
    billingType: z.literal('per_call'),
    pricing: perCallPricingSchema,
  }),
  z.object({
    ...pricingBaseShape,
    billingType: z.literal('per_image'),
    pricing: perImagePricingSchema,
  }),
  z.object({
    ...pricingBaseShape,
    billingType: z.literal('per_video'),
    pricing: perVideoPricingSchema,
  }),
  z.object({
    ...pricingBaseShape,
    billingType: z.literal('per_audio_minute'),
    pricing: perAudioMinutePricingSchema,
  }),
  z.object({
    ...pricingBaseShape,
    billingType: z.literal('per_character'),
    pricing: perCharacterPricingSchema,
  }),
]);

export type Pricing = z.infer<typeof pricingSchema>;

// ---------- Upsert 入参（同形状，去掉 uid / updatedAtUtc / updatedByIamUid） ----------

const upsertBaseShape = {
  modelId: z.string().min(1),
  multiplier: z.number().positive(),
  currency: z.string(),
  tierMultipliers: z.record(z.string(), z.number().positive()),
  effectiveFromUtc: z.string(),
};

export const upsertPricingInputSchema = z.discriminatedUnion('billingType', [
  z.object({
    ...upsertBaseShape,
    billingType: z.literal('per_token'),
    pricing: perTokenPricingSchema,
  }),
  z.object({
    ...upsertBaseShape,
    billingType: z.literal('per_call'),
    pricing: perCallPricingSchema,
  }),
  z.object({
    ...upsertBaseShape,
    billingType: z.literal('per_image'),
    pricing: perImagePricingSchema,
  }),
  z.object({
    ...upsertBaseShape,
    billingType: z.literal('per_video'),
    pricing: perVideoPricingSchema,
  }),
  z.object({
    ...upsertBaseShape,
    billingType: z.literal('per_audio_minute'),
    pricing: perAudioMinutePricingSchema,
  }),
  z.object({
    ...upsertBaseShape,
    billingType: z.literal('per_character'),
    pricing: perCharacterPricingSchema,
  }),
]);

export type UpsertPricingInput = z.infer<typeof upsertPricingInputSchema>;

// ---------- 列表筛选 ----------

export interface ListPricingFilter {
  /** 模糊匹配 modelId */
  keyword: string;
  billingType: BillingType | 'all';
}
