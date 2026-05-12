import { z } from 'zod';

import { pricingModeSchema, type PricingMode } from './enums';

const uidString = z.union([z.string(), z.number()]).transform((v) => String(v));

/**
 * 模型定价。
 *
 * 与 Model 是 1..1：每个 modelId 一条 Pricing 记录。删除模型必须同时删除定价。
 *
 * **金额单位**：元 / 1K tokens（与钱包 WalletSnapshot.available 同币种 / 同尺度）。
 * 后端落库为 decimal，前端用 number；展示用 `formatMoney` 走 Intl 标准 banker rounding。
 *
 * **倍率（multiplier）**：在基础价上叠加的全局乘数，便于"统一调价 1.2x"这种活动。
 * 实际计费金额 = price × tokens / 1000 × multiplier × tierMultiplier。
 *
 * **tierMultipliers**：按 LV 单独覆盖的倍率（如 Lv5 → 0.7）。未列出的 LV 走 1.0。
 * key 是 LV 整数字符串（"1","2","3"），保证 JSON 友好。
 */
export const pricingSchema = z.object({
  uid: uidString,
  /** 与 Model.modelId 强一致；删除 Model 必须级联删 Pricing */
  modelId: z.string().min(1),
  mode: pricingModeSchema,
  /** 输入 token 单价（元 / 1K tokens），mode = per_token 时必填 */
  inputPricePerKToken: z.number().nonnegative().nullable().optional(),
  /** 输出 token 单价（元 / 1K tokens），mode = per_token 时必填 */
  outputPricePerKToken: z.number().nonnegative().nullable().optional(),
  /** 每次调用价（元），mode = per_call 时必填 */
  pricePerCall: z.number().nonnegative().nullable().optional(),
  /** 每张图片价（元），mode = per_image 时必填 */
  pricePerImage: z.number().nonnegative().nullable().optional(),
  /** 每分钟价（元），mode = per_minute 时必填 */
  pricePerMinute: z.number().nonnegative().nullable().optional(),
  multiplier: z.number().positive(),
  currency: z.string(),
  /** key 是 LV 字符串，value 是该 LV 的倍率（如 "5" → 0.7） */
  tierMultipliers: z.record(z.string(), z.number().positive()),
  /** 生效时间（UTC）；未来时间 = 预生效；BFF 调度按 occurredAt 选择最近一条生效记录 */
  effectiveFromUtc: z.string(),
  updatedAtUtc: z.string(),
  /** 最近一次改动操作人 IAM uid */
  updatedByIamUid: uidString.nullable().optional(),
});

export type Pricing = z.infer<typeof pricingSchema>;

export interface UpsertPricingInput {
  modelId: string;
  mode: PricingMode;
  inputPricePerKToken?: number | null;
  outputPricePerKToken?: number | null;
  pricePerCall?: number | null;
  pricePerImage?: number | null;
  pricePerMinute?: number | null;
  multiplier: number;
  currency: string;
  tierMultipliers: Record<string, number>;
  effectiveFromUtc: string;
}

export interface ListPricingFilter {
  /** 模糊匹配 modelId */
  keyword: string;
  mode: PricingMode | 'all';
}
