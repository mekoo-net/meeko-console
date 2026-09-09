import { z } from 'zod';

/**
 * 与 Meeko.ToApi `Application/Pricing/PricingCatalogDtos.cs` 一一对应（PlatformJsonOptions：camelCase、
 * DateTime → epoch ms、long+LongToStringConverter → string）。
 * ToApi 全部按量：per_token（聊天）/ per_image（生图）/ per_video（生视频），没有按次。
 */

export const toapiBillingTypeValues = ['per_token', 'per_image', 'per_video'] as const;
export const toapiBillingTypeSchema = z.enum(toapiBillingTypeValues);
export type ToApiBillingType = z.infer<typeof toapiBillingTypeSchema>;

export const ToApiBillingTypeLabel: Record<ToApiBillingType, string> = {
  per_token: '按量',
  per_image: '按张',
  per_video: '按秒',
};

export const catalogStatusValues = ['live', 'beta', 'soon', 'disabled'] as const;
export const catalogStatusSchema = z.enum(catalogStatusValues);
export type CatalogStatus = z.infer<typeof catalogStatusSchema>;

export const CatalogStatusLabel: Record<CatalogStatus, string> = {
  live: '已上线',
  beta: 'Beta',
  soon: '即将上线',
  disabled: '已停用',
};

// ── 供应分组 ──

export const supplyGroupSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  status: catalogStatusSchema,
  sortOrder: z.number().int(),
  notes: z.string().nullable().optional(),
  createdAtUtc: z.number(),
  updatedAtUtc: z.number(),
});
export type SupplyGroup = z.infer<typeof supplyGroupSchema>;

export interface UpsertSupplyGroupInput {
  key: string;
  name: string;
  status: CatalogStatus;
  sortOrder: number;
  notes?: string | null;
}

// ── 定价行 ──

export const rateTierSchema = z.object({
  /** image：`{size}/{quality}`；video：`{resolution}`。 */
  key: z.string(),
  price: z.number(),
});
export type RateTier = z.infer<typeof rateTierSchema>;

export const tokenRateSchema = z.object({
  perMToken: z.number(),
  cachedRead: z.number().nullable().optional(),
  cachedWrite: z.number().nullable().optional(),
  reasoning: z.number().nullable().optional(),
});
export type TokenRate = z.infer<typeof tokenRateSchema>;

export const modelRateDocumentSchema = z.object({
  input: tokenRateSchema,
  output: tokenRateSchema,
  image: z.object({ pricePerImage: z.number(), tiers: z.array(rateTierSchema) }),
  video: z.object({ pricePerSecond: z.number(), tiers: z.array(rateTierSchema) }),
});
export type ModelRateDocument = z.infer<typeof modelRateDocumentSchema>;

export const modelMetaDocumentSchema = z.object({
  displayName: z.string(),
  family: z.string(),
  tags: z.array(z.string()),
});
export type ModelMetaDocument = z.infer<typeof modelMetaDocumentSchema>;

export const modelRateSchema = z.object({
  id: z.string(),
  groupKey: z.string(),
  modelId: z.string(),
  billingType: toapiBillingTypeSchema,
  rate: modelRateDocumentSchema,
  meta: modelMetaDocumentSchema,
  currency: z.string(),
  status: z.enum(['active', 'superseded']),
  effectiveFromUtc: z.number(),
  supersededAtUtc: z.number().nullable().optional(),
});
export type ModelRate = z.infer<typeof modelRateSchema>;

export interface PublishModelRateInput {
  groupKey: string;
  modelId: string;
  billingType: ToApiBillingType;
  rate: ModelRateDocument;
  meta: ModelMetaDocument;
  /** epoch ms；null = 立即生效。 */
  effectiveFromUtc: number | null;
}

export function emptyRateDocument(): ModelRateDocument {
  return {
    input: { perMToken: 0, cachedRead: null, cachedWrite: null, reasoning: null },
    output: { perMToken: 0, cachedRead: null, cachedWrite: null, reasoning: null },
    image: { pricePerImage: 0, tiers: [] },
    video: { pricePerSecond: 0, tiers: [] },
  };
}

/** 定价页一行的"价格摘要"，按口径取对应段。 */
export function summarizeRate(row: ModelRate): string {
  const r = row.rate;
  switch (row.billingType) {
    case 'per_image':
      return `¥${r.image.pricePerImage} / 张${r.image.tiers.length ? ` · ${r.image.tiers.length} 档` : ''}`;
    case 'per_video':
      return `¥${r.video.pricePerSecond} / 秒${r.video.tiers.length ? ` · ${r.video.tiers.length} 档` : ''}`;
    default:
      return `入 ¥${r.input.perMToken} · 出 ¥${r.output.perMToken} / MTok`;
  }
}
