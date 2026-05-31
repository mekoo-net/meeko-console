import { z } from 'zod';

import { epochMillisSchema } from '@/shared/lib/epoch';

import {
  modelCapabilitySchema,
  modelFamilySchema,
  type ModelCapability,
  type ModelFamily,
} from './enums';

const uidString = z.union([z.string(), z.number()]).transform((v) => String(v));

/**
 * 平台层 Model 条目（`provider_model_mappings.display_name` 的全局视图）。
 *
 * **生命周期完全由 Provider 映射驱动**：
 *  - 新增 `provider_model_mappings.display_name` → 自动 create 一条平台 Model
 *  - 不再被任何 mapping 引用的 displayName → 自动 delete Model
 *  - 前端不存在直接 create / delete Model 的入口（无新建按钮、无删除按钮）
 *  - 因此 Model 也没有 `enabled` 开关 —— 停用一律在 Provider 层面
 *
 * `modelId` = `displayName`，是用户请求体里的 `model` 字段（也是计费 / 配额主键）。
 * 元数据取首个承载它的 `provider_model`，BFF 端应做冲突校验或运营选定。
 *
 * "承载于哪些 Provider" 通过反向查询 `Provider.modelMappings × providerModels` 派生，
 * **不**在 Model 上落库。
 */
export const modelSchema = z.object({
  uid: uidString,
  modelId: z.string().min(1).max(128),
  displayName: z.string(),
  family: modelFamilySchema,
  capabilities: z.array(modelCapabilitySchema),
  /** 最低可见 LV，默认 1（所有人可见） */
  visibleMinTier: z.number().int().min(1).max(99),
  /** 上下文窗口，单位 tokens */
  maxContextTokens: z.number().int().positive(),
  /** 单次响应上限，单位 tokens；不设置时 = maxContextTokens */
  maxOutputTokens: z.number().int().positive().nullable().optional(),
  supportsStreaming: z.boolean(),
  supportsFunctionCall: z.boolean(),
  description: z.string().nullable().optional(),
  /** 所属渠道（BFF `ModelMetaAdminDto.vendorName`） */
  vendorName: z.string().optional(),
  createdAtUtc: epochMillisSchema,
  updatedAtUtc: epochMillisSchema,
});

export type Model = z.infer<typeof modelSchema>;

export interface UpdateModelInput {
  displayName?: string;
  family?: ModelFamily;
  capabilities?: ModelCapability[];
  visibleMinTier?: number;
  maxContextTokens?: number;
  maxOutputTokens?: number | null;
  supportsStreaming?: boolean;
  supportsFunctionCall?: boolean;
  description?: string | null;
}

export interface ListModelsFilter {
  /** 模糊匹配 modelId / displayName */
  keyword: string;
  family: ModelFamily | 'all';
  capability: ModelCapability | 'all';
}
