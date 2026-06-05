import { z } from 'zod';

import { providerGroupStatusSchema } from './enums';
import { epochMillisSchema } from '@/shared/lib/epoch';

/** 后端主键以 long 下发（JSON number），前端统一规整为字符串，兼容 string/number 两种来源。 */
const uidString = z.union([z.string(), z.number()]).transform((v) => String(v));

/**
 * 已入库的供应商组（QueueGroup）—— admin 通过「接入」流程从网关拉取后选择导入。
 *
 * 字段与 NATS `gateway.chat.{queueGroup}` / ModelRouting 的 providerId 一致；
 * 控制面不跟踪网关实例存活（liveness 由 LLM 网关自己负责），因此没有
 * `instanceCount` / `syncedAtUtc` / `source` 等字段。
 */
export const providerGroupSchema = z.object({
  /** 供应商组（vendor）主键，删除/编辑以此为准。 */
  id: uidString,
  /** QueueGroup，全局唯一，创建后不可改。 */
  queueGroup: z.string().min(1).max(64),
  /** 对外公开通道 slug（如 nai / pa）；未设置时不参与公开定价。 */
  vendorSlug: z.string().min(1).max(64).nullable().optional(),
  status: providerGroupStatusSchema,
  upstreamModelCount: z.number().int().nonnegative(),
  notes: z.string().nullable().optional(),
  importedAtUtc: epochMillisSchema,
  updatedAtUtc: epochMillisSchema,
});

export type ProviderGroup = z.infer<typeof providerGroupSchema>;

/** 已入库的上游模型（供应商组内的一条技术注册名）。 */
export const providerUpstreamModelSchema = z.object({
  /** 入库条目（model_meta）主键，删除/编辑以此为准。 */
  id: uidString,
  queueGroup: z.string(),
  vendorModel: z.string().min(1).max(160),
  label: z.string().optional(),
});

export type ProviderUpstreamModel = z.infer<typeof providerUpstreamModelSchema>;

// ---------------------------------------------------------------------------
// 接入流程：从网关发现 → admin 选择 → 创建入库
// ---------------------------------------------------------------------------

/** 网关报告的某个上游模型（用于「接入」页右栏勾选）。 */
export interface DiscoveredUpstreamModel {
  vendorModel: string;
  /** 若该模型已在某次 import 中入库，UI 用于禁用勾选并打 tag。 */
  alreadyImported: boolean;
}

/** 网关报告的某个 QueueGroup（用于「接入」页左栏列表）。 */
export interface DiscoveredProviderGroup {
  queueGroup: string;
  displayName: string;
  models: DiscoveredUpstreamModel[];
  /** 该 QueueGroup 整体是否已入库（用于左栏「未入库」过滤）。 */
  alreadyImported: boolean;
}

export interface DiscoverCatalogResult {
  groups: DiscoveredProviderGroup[];
  discoveredAtUtc: number;
}

export const discoveredUpstreamModelSchema = z.object({
  vendorModel: z.string(),
  alreadyImported: z.boolean(),
});

export const discoveredProviderGroupSchema = z.object({
  queueGroup: z.string(),
  displayName: z.string(),
  alreadyImported: z.boolean(),
  models: z.array(discoveredUpstreamModelSchema),
});

export const discoverCatalogResultSchema = z.object({
  groups: z.array(discoveredProviderGroupSchema),
  discoveredAtUtc: epochMillisSchema,
});

export interface ImportUpstreamModelInput {
  vendorModel: string;
}

export interface ImportProviderGroupInput {
  queueGroup: string;
  /** 对外公开通道 slug（如 nai / pa），与 QueueGroup 1:1 唯一绑定。 */
  vendorSlug?: string | null;
  notes?: string | null;
  models: ImportUpstreamModelInput[];
}

export interface ImportProviderGroupResult {
  queueGroup: string;
  importedModelCount: number;
  importedAtUtc: number;
}

export const importProviderGroupResultSchema = z.object({
  queueGroup: z.string(),
  importedModelCount: z.number().int().nonnegative(),
  importedAtUtc: epochMillisSchema,
});
