import { z } from 'zod';

import {
  apiTypeSchema,
  modelCapabilitySchema,
  modelFamilySchema,
  providerStatusSchema,
  type ApiType,
  type ModelCapability,
  type ModelFamily,
  type ProviderStatus,
} from './enums';

const uidString = z.union([z.string(), z.number()]).transform((v) => String(v));

/**
 * `provider_model`：归属某 Provider 的「上游模型实体」。
 *
 * - **`modelName`**：上游 HTTP 请求体里的 `model` 字段，与上游 `/v1/models`
 *   / 厂商文档保持一致，**调度时**写到 upstream body 上。
 * - `family / capabilities / maxContextTokens / maxOutputTokens /
 *   visibleMinTier` 都是模型本身的技术属性，**与上架展示解耦**。
 *
 * 一个 Provider 可以"声明"多个 provider_model（拉取上游目录后逐个登记），
 * 但**只有被 `modelMappings` 引用的 provider_model 才真正对外可见**。
 */
export const providerModelSchema = z.object({
  uid: uidString,
  modelName: z.string().min(1).max(128),
  family: modelFamilySchema,
  capabilities: z.array(modelCapabilitySchema),
  visibleMinTier: z.number().int().min(1).max(99),
  maxContextTokens: z.number().int().positive(),
  maxOutputTokens: z.number().int().positive().nullable().optional(),
});
export type ProviderModel = z.infer<typeof providerModelSchema>;

/**
 * `provider_model_mappings`：Provider 下的「对外上架条目」。
 *
 * - 通过 `providerModelUid` 指向同一 Provider 内的某个 `ProviderModel`
 * - **`displayName`** 是对终端用户展示的名称（产品名 / 营销名），
 *   与上游 `modelName` 解耦
 * - 同一 `providerModelUid` 可挂多条映射（不同 `displayName` 的套餐名
 *   指向同一上游技术名）
 * - `enabled` 软关停一条映射；`notes` 备注（运营 / 内部沟通）
 *
 * `sortOrder` / `mappingWeight` 可选：用于控制台展示与按比例分流草稿；BFF 未落库时可省略。
 */
export const providerModelMappingSchema = z.object({
  uid: uidString,
  providerModelUid: uidString,
  displayName: z.string().min(1).max(128),
  enabled: z.boolean(),
  notes: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  /** 多条映射共存时的相对权重（100 为中立默认） */
  mappingWeight: z.number().int().positive().optional(),
});
export type ProviderModelMapping = z.infer<typeof providerModelMappingSchema>;

/**
 * 供应商（上游凭据 + 模型实体 + 上架映射）。
 *
 * 一个 Provider = 一组凭据 + 一种 apiType + 一组 `providerModels` + 一组 `modelMappings`。
 *
 * 命中 Provider 后，根据用户请求的 `displayName` 解析到 `providerModelUid` →
 * 读取 `providerModel.modelName` 作为上游 body 的 `model` 字段。
 *
 * `apiKeyMasked` 是脱敏快照（如 `sk-***abc1`），完整密钥仅写入时存在内存，
 * BFF 端落库为不可逆 hash + 加密原文；管理台从不展示原文。
 *
 * `auto_disabled` 由 BFF 调度侧根据连续错误率自动写入，UI 仅展示原因；
 * 恢复必须人工 `setStatus('enabled')`，防止抖动来回切换。
 *
 * NOTE: 跨 Provider 的调度策略（priority 分池 + weight 加权）当前阶段未启用，
 * 需要时再把 `priority` / `weight` 加回 Provider schema。
 */
export const providerSchema = z.object({
  uid: uidString,
  name: z.string().min(1).max(64),
  apiType: apiTypeSchema,
  baseUrl: z.string(),
  /** 脱敏快照，仅展示用；真实密钥不出 BFF。 */
  apiKeyMasked: z.string(),
  /** 备注，≤ 500 字 */
  notes: z.string().nullable().optional(),
  status: providerStatusSchema,
  /** auto_disabled 时填，枚举码：`upstream_5xx_burst` / `auth_failed` / `quota_exceeded` 等。 */
  autoDisabledCode: z.string().nullable().optional(),
  /** 最近一次 ping 延迟，仅参考。 */
  testLatencyMs: z.number().int().nullable().optional(),
  testSucceededAtUtc: z.string().nullable().optional(),
  /** 24h 错误率（0..1），由 BFF 聚合写回。 */
  errorRate24h: z.number().min(0).max(1).optional(),
  /** 24h 调用次数，用于 UI 排序参考 */
  callCount24h: z.number().int().nonnegative().optional(),
  /** 供应商内登记的「上游模型实体」（per upstream model_name） */
  providerModels: z.array(providerModelSchema),
  /** 对外上架映射（displayName → providerModel） */
  modelMappings: z.array(providerModelMappingSchema),
  createdAtUtc: z.string(),
  updatedAtUtc: z.string(),
});

export type Provider = z.infer<typeof providerSchema>;

/**
 * 草稿态的 ProviderModel —— 表单里临时维护用：
 *  - 新增时 `uid` 由前端预生成（`"tmp-xxx"` 也可，BFF 接收后会改写为 UUID v7）
 *  - 编辑时保留服务端下发的真 `uid`
 *
 * 字段语义与 `ProviderModel` 一致。
 */
export interface ProviderModelDraft {
  uid: string;
  modelName: string;
  family: ModelFamily;
  capabilities: ModelCapability[];
  visibleMinTier: number;
  maxContextTokens: number;
  maxOutputTokens?: number | null;
}

/**
 * 草稿态的 ProviderModelMapping。
 *
 * - `providerModelUid` 既可指向「已存在的 ProviderModel.uid」，也可指向
 *   同一表单批次内**刚刚新建**的 ProviderModelDraft.uid（临时 uid）。
 *   BFF 应在事务内一次性 reconcile。
 * - `uid` 在新增时为空，由后端生成；mock 端会预生成 string 以便表单 v-model。
 */
export interface ProviderModelMappingDraft {
  uid?: string;
  providerModelUid: string;
  displayName: string;
  enabled: boolean;
  notes?: string | null;
  sortOrder?: number;
  mappingWeight?: number;
}

export interface CreateProviderInput {
  name: string;
  apiType: ApiType;
  baseUrl: string;
  /** 写入时是明文，BFF 入库前 hash + 加密；前端绝不缓存。 */
  apiKey: string;
  notes?: string | null;
  providerModels: ProviderModelDraft[];
  modelMappings: ProviderModelMappingDraft[];
}

export interface UpdateProviderInput {
  name?: string;
  baseUrl?: string;
  /** 不变更密钥时省略；为空字符串视为"清空"，仅在解绑场景使用。 */
  apiKey?: string;
  notes?: string | null;
  /**
   * 整体覆盖式提交：传入的就是「当前保存意图下的全集」。
   * BFF 端 diff 出新增 / 修改 / 删除，并级联清理孤立 mapping。
   */
  providerModels?: ProviderModelDraft[];
  modelMappings?: ProviderModelMappingDraft[];
}

export interface ProviderTestResult {
  /** 整体连通性 */
  ok: boolean;
  latencyMs: number;
  /** 探测时拉取到的可用模型列表（用于建议拉取） */
  reachableModelNames: string[];
  /** 失败时的枚举码 */
  errorCode?: string;
  errorMessage?: string;
}

export interface FetchUpstreamModelsResult {
  /** 上游 `/v1/models` 返回的 `model` 技术名列表（= `provider_model.model_name`） */
  upstreamModelNames: string[];
}

export interface ListProvidersFilter {
  /** 模糊匹配 name / baseUrl */
  keyword: string;
  apiType: ApiType | 'all';
  status: ProviderStatus | 'all';
}

/** 调度自动停用枚举码（前端只做 i18n 映射，绝不存自由文本） */
export const providerAutoDisabledCodeLabel: Readonly<Record<string, string>> = {
  upstream_5xx_burst: '上游 5xx 突发',
  auth_failed: '认证失败',
  quota_exceeded: '额度耗尽',
  network_unreachable: '网络不可达',
  rate_limited: '上游限流',
  manual_recovery_required: '需人工恢复',
};
