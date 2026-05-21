import { z } from 'zod';

import { providerCatalogSourceSchema, providerGroupStatusSchema } from './enums';

/**
 * 供应商组 = demuxai-api Provider 的 QueueGroup（如 kiro、gemini、codex）。
 * 与 NATS `gateway.chat.{queueGroup}`、ModelRouting 的 providerId 一致。
 */
export const providerGroupSchema = z.object({
  /** QueueGroup，全局唯一，创建后不可改 */
  queueGroup: z.string().min(1).max(64),
  displayName: z.string().min(1).max(128),
  source: providerCatalogSourceSchema,
  status: providerGroupStatusSchema,
  /** 网关注册的健康实例数 */
  instanceCount: z.number().int().nonnegative(),
  upstreamModelCount: z.number().int().nonnegative(),
  notes: z.string().nullable().optional(),
  syncedAtUtc: z.string(),
  createdAtUtc: z.string(),
  updatedAtUtc: z.string(),
});

export type ProviderGroup = z.infer<typeof providerGroupSchema>;

/** 组内上游模型（技术注册名） */
export const providerUpstreamModelSchema = z.object({
  queueGroup: z.string(),
  upstreamModelId: z.string().min(1).max(160),
  label: z.string().optional(),
  source: providerCatalogSourceSchema,
});

export type ProviderUpstreamModel = z.infer<typeof providerUpstreamModelSchema>;

export interface SyncProviderCatalogResult {
  providerCount: number;
  modelCount: number;
  syncedAtUtc: string;
}

export interface CreateProviderGroupInput {
  queueGroup: string;
  displayName: string;
  notes?: string | null;
}

export interface CreateUpstreamModelInput {
  queueGroup: string;
  upstreamModelId: string;
  label?: string;
}

export type SyncCatalogResult = SyncProviderCatalogResult;
