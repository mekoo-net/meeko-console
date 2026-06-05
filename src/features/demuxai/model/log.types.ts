import { z } from 'zod';

import { epochMillisSchema } from '@/shared/lib/epoch';

import {
  apiTypeSchema,
  billingTypeSchema,
  billReverseCodeSchema,
  type ApiType,
  type BillReverseCode,
} from './enums';

const uidString = z.union([z.string(), z.number()]).transform((v) => String(v));

/**
 * 调用日志单条。
 *
 * **大概率独立微服务**（ClickHouse / ES），与控制面 Provider/Model/Pricing 不同源；
 * 因此 Logs 单独一个 Port，HttpAdapter 也对应独立 baseUrl。
 *
 * 设计要点：
 *  - `id`：本条日志主键（snowflake）；与账户域的 `uid`（userId）区分
 *  - `account: { uid, iamId }`：租户身份 —— `uid` 是主账户 userId（扣费主体），
 *    `iamId` 是 IAM 子账户 userId；展示和关联一次拿到，不再两个并列顶层字段
 *  - `providerId` 是**供应商表的 int 主键**（非 string UID）：日志是高吞吐数据，
 *    int FK 索引比 string UID 紧凑得多；前端展示用反查 `provider.id → name`
 *  - `modelName` 即用户请求体里的 `model` 字段（如 `'demux-gpt-4o'`），快照字段
 *  - `convId` 会话 ID：多轮对话同一 convId，便于按会话维度排查与 IAM 反查
 *  - 上游模型快照只保留 `modelName`，**不再单独记** `providerModelId`（上游真实 model
 *    名）：知道命中哪个渠道 + 用户请求的 `modelName` 已经能定位调度路径，
 *    `providerModelId` 是冗余信息
 *  - **`billingType` 是判别字段**：同一条 LogEntry 里 `usage` / `cost` 的形状随 `billingType` 变化，
 *    与 `Pricing` 文档一一对应；详见 `docs/api/11-demuxai-logs.md`
 *  - `usage` / `cost` 都按 JSON 字段落库（PostgreSQL JSONB / ClickHouse JSON），
 *    `cost.total` 作为冗余索引列方便聚合
 *  - **`tokenLatency` 语义按 `streamed` 切换**（单位 ms）：
 *      - `streamed: true`  → 首字延迟（TTFT，到首 token 的耗时；反映上游响应健康度）
 *      - `streamed: false` → 端到端总耗时（请求到响应完整返回；非流式调用唯一有意义的延迟）
 *      - 失败请求一律 `null`
 *  - **`success: boolean` 表达成败二元**：
 *      - `true`  → 调用成功，`error` 必为 `null`
 *      - `false` → 调用失败，必有 `error: { code, message, httpStatus }`，错误细分类（timeout / rate_limited / cancelled / 5xx 等）
 *        通过 `error.code` 区分，不再单列状态枚举
 *  - 不存 prompt / completion 原文（隐私 & 体积），调试用另一套抓样系统
 *
 * 关于"已删除模型"：
 *  - 前端 Mock 走硬删，UI 在 Models 表查不到对应 modelId 时显示为 `<已删除>`
 *  - 真 BFF 端 Model 走软删（tombstone），仍能 join 到 displayName；前端逻辑一致
 */

// ---------- usage 子形状（按 billingType） ----------

/**
 * `per_token` 用量快照 —— 按 **input / output 父子集**分组，子维度自然嵌进父集；
 * 顶层 `totalTokens` 是冗余总和，方便聚合查询走索引。
 *
 *   {
 *     totalTokens,
 *     input: {
 *       tokens,                  // 总输入 token 数（含所有 input 子维度）
 *       cachedReadTokens,        // 走 cache 读的部分（OpenAI cached_tokens / Anthropic cache_read_input_tokens / Gemini cached_content_token_count）
 *       cachedWriteTokens,       // cache 写
 *       audioTokens,             // 音频 token（GPT-4o-audio / Realtime API；prompt_tokens_details.audio_tokens）
 *     },
 *     output: {
 *       tokens,                  // 总输出 token 数（含所有 output 子维度）
 *       reasoningTokens,         // o1 / o3 / Claude extended thinking / Gemini thoughts
 *       audioTokens,             // 输出音频（GPT-4o-audio；completion_tokens_details.audio_tokens）
 *     },
 *   }
 *
 * 全部 required —— 未触发的维度写 0，让日志能"自我描述"，不要写 `?? 0` 兜底。
 */
export const perTokenUsageSchema = z.object({
  totalTokens: z.number().int().nonnegative(),
  input: z.object({
    tokens: z.number().int().nonnegative(),
    cachedReadTokens: z.number().int().nonnegative(),
    cachedWriteTokens: z.number().int().nonnegative(),
    audioTokens: z.number().int().nonnegative(),
  }),
  output: z.object({
    tokens: z.number().int().nonnegative(),
    reasoningTokens: z.number().int().nonnegative(),
    audioTokens: z.number().int().nonnegative(),
  }),
});
export type PerTokenUsage = z.infer<typeof perTokenUsageSchema>;

/**
 * `per_call` 用量快照。
 *
 * 计费虽按"次"，但底层多半仍是 LLM 调用（function call / moderation 等），照样消耗 token。
 * 故只记录上游回报的输入 / 输出 / 缓存 token 原始明细，仅供观测 / 对账，
 * **不参与扣费**（扣费走 `pricePerCall`）。总数由前端按需相加。老数据未带明细时各项回退 0。
 */
export const perCallUsageSchema = z.object({
  input: z
    .object({
      tokens: z.number().int().nonnegative(),
      cachedReadTokens: z.number().int().nonnegative(),
      cachedWriteTokens: z.number().int().nonnegative(),
      audioTokens: z.number().int().nonnegative(),
    })
    .default({ tokens: 0, cachedReadTokens: 0, cachedWriteTokens: 0, audioTokens: 0 }),
  output: z
    .object({
      tokens: z.number().int().nonnegative(),
      reasoningTokens: z.number().int().nonnegative(),
      audioTokens: z.number().int().nonnegative(),
    })
    .default({ tokens: 0, reasoningTokens: 0, audioTokens: 0 }),
});
export type PerCallUsage = z.infer<typeof perCallUsageSchema>;

export const perImageUsageSchema = z.object({
  tier: z.object({ size: z.string().min(1), quality: z.string().min(1) }),
  count: z.number().int().positive(),
});
export type PerImageUsage = z.infer<typeof perImageUsageSchema>;

export const perVideoUsageSchema = z.object({
  tier: z.object({ resolution: z.string().min(1) }),
  seconds: z.number().nonnegative(),
});
export type PerVideoUsage = z.infer<typeof perVideoUsageSchema>;

export const perAudioMinuteUsageSchema = z.object({
  minutes: z.number().nonnegative(),
});
export type PerAudioMinuteUsage = z.infer<typeof perAudioMinuteUsageSchema>;

export const perCharacterUsageSchema = z.object({
  characters: z.number().int().nonnegative(),
});
export type PerCharacterUsage = z.infer<typeof perCharacterUsageSchema>;

// ---------- cost 子形状（按 billingType） ----------

/**
 * `cost` 设计要点：
 *
 * 1. **结构上与 `usage` 对称**：按 input / output 父子集分组，每个维度内联 `{ perMToken, amount }`
 *    一对快照 —— "用了多少 × 单价多少 = 扣了多少"一气呵成，不用前端再去交叉两个扁平字典。
 * 2. **`DimensionCost = { perMToken, amount }` 是可复用子类型**：未来加新 modality（image / video token）
 *    只需在 input/output 里塞一个新的 `DimensionCost` 字段，schema 结构稳定。
 * 3. **所有字段必填**：未触发的维度记 `{ perMToken: 0, amount: 0 }`，跟 usage 对称，下游不用写 `?? 0`。
 * 4. **单价单位：元 / 1M tokens**，与 OpenAI / Anthropic / Google 等厂家定价页对齐，减少对账换算。
 *
 * 扣费公式（per 维度）：
 *
 *   cost.input.amount             = usage.input.tokens             / 1_000_000 × cost.input.perMToken
 *   cost.input.cachedRead.amount  = usage.input.cachedReadTokens   / 1_000_000 × cost.input.cachedRead.perMToken
 *   …其它维度同理
 */

/** 单一维度的"单价 + 实际扣费"快照对。 */
export const dimensionCostSchema = z.object({
  /** 调用时定价单价快照（元 / 1M tokens；该维度不支持时为 0）。 */
  perMToken: z.number().nonnegative(),
  /** 该维度实际扣费金额（元；未触发为 0）。 */
  amount: z.number().nonnegative(),
});
export type DimensionCost = z.infer<typeof dimensionCostSchema>;

export const perTokenCostSchema = z.object({
  input: z.object({
    /** 输入 token 单价快照（元 / 1M）。 */
    perMToken: z.number().nonnegative(),
    /** 输入 token 实际扣费（元）。 */
    amount: z.number().nonnegative(),
    /** Cache 读（OpenAI cached input / Anthropic cache_read，约 base × 0.1~0.5）。 */
    cachedRead: dimensionCostSchema,
    /** cache 写。 */
    cachedWrite: dimensionCostSchema,
    /** 输入音频 token（GPT-4o-audio，约 base × 16）。 */
    audio: dimensionCostSchema,
  }),
  output: z.object({
    /** 输出 token 单价快照（元 / 1M）。 */
    perMToken: z.number().nonnegative(),
    /** 输出 token 实际扣费（元）。 */
    amount: z.number().nonnegative(),
    /** 推理 token（o1 / extended thinking / Gemini thoughts）。 */
    reasoning: dimensionCostSchema,
    /** 输出音频 token（GPT-4o-audio，约 base × 8）。 */
    audio: dimensionCostSchema,
  }),

  /** 总额（所有维度 amount 之和）。 */
  total: z.number().nonnegative(),
});
export type PerTokenCost = z.infer<typeof perTokenCostSchema>;

/**
 * 非 token 类型的 cost schema —— 与 `perTokenCostSchema` **同等待遇**：
 * 每种 `billingType` 都把"调用时单价快照"刻在 log 里，让 cost 能脱离 Pricing 表自我描述。
 *
 * `per_image` / `per_video` 是按 tier 分级单价的，调用必然命中其中一档（由 `usage.tier`
 * 定位），所以单价快照只记**命中那条 tier 的单价**即可，不必把整个 `tiers[]` 数组复制进 log。
 */

/** 总额；所有非 token cost 都包含。 */
const costContextShape = {
  total: z.number().nonnegative(),
};

export const perCallCostSchema = z.object({
  /** 命中"非缓存"调用的单价快照（元 / 次）。 */
  pricePerCall: z.number().nonnegative(),
  /** 命中"缓存"调用的单价快照（元 / 次）；该模型不支持 cache 时为 0。 */
  cachedPricePerCall: z.number().nonnegative(),
  ...costContextShape,
});
export type PerCallCost = z.infer<typeof perCallCostSchema>;

export const perImageCostSchema = z.object({
  /** 命中 tier 的单价快照（元 / 张）。具体哪档由 `usage.tier.{size,quality}` 定位。 */
  pricePerImage: z.number().nonnegative(),
  ...costContextShape,
});
export type PerImageCost = z.infer<typeof perImageCostSchema>;

export const perVideoCostSchema = z.object({
  /** 命中 tier 的单价快照（元 / 秒）。具体哪档由 `usage.tier.resolution` 定位。 */
  pricePerSecond: z.number().nonnegative(),
  ...costContextShape,
});
export type PerVideoCost = z.infer<typeof perVideoCostSchema>;

export const perAudioMinuteCostSchema = z.object({
  /** 单价快照（元 / 分钟）。 */
  pricePerMinute: z.number().nonnegative(),
  ...costContextShape,
});
export type PerAudioMinuteCost = z.infer<typeof perAudioMinuteCostSchema>;

export const perCharacterCostSchema = z.object({
  /** 单价快照（元 / 1K 字符；与 Pricing 同口径）。 */
  pricePerKChar: z.number().nonnegative(),
  ...costContextShape,
});
export type PerCharacterCost = z.infer<typeof perCharacterCostSchema>;

// ---------- LogEntry 共通字段 ----------

const logEntryBaseShape = {
  id: uidString,
  /** 调用发生时间（Unix 毫秒 UTC）。原名 `occurredAtUtc`，按"用户感知"语义简化为 `createAt`。 */
  createAt: epochMillisSchema,
  /**
   * 租户身份聚合对象 —— 替代原先并列的 `accountUid` + `iamUserUid` 顶层字段。
   *
   * - `uid`：主账户 userId（扣费主体，billing 主键）
   * - `iamId`：IAM 子账户 userId（实际操作者）
   */
  account: z.object({
    uid: uidString,
    /** IAM 子账户 userId；主账户直接调用时为 null。 */
    iamId: uidString.nullable().optional(),
    /** 账户昵称 / 组织名（BFF enrich 自 Keystone）。 */
    displayName: z.string().optional(),
    /** 主账户联系邮箱。 */
    email: z.string().optional(),
    /** 主账户联系手机。 */
    phone: z.string().nullish(),
  }),
  /** 多轮对话的会话 ID。同一对话的多次调用共享同一 convId；无会话上下文时为 null。 */
  convId: z.string().min(1).nullable().optional(),
  /**
   * 调用来源令牌快照。sk- 后端调用时有 `{ id, name }`；PG 页面直发时为 null（UI 显示 "PG"）。
   */
  token: z
    .object({
      id: uidString,
      name: z.string(),
    })
    .nullable()
    .optional(),
  /** 对外暴露的模型名（= 用户请求体里的 `model` 字段，如 `'demux-gpt-4o'`）。 */
  modelName: z.string(),
  /** 命中渠道（供应商组）。来自别名快照绑定，别名/供应商删除后历史仍可还原；未绑定时为 null。 */
  vendorKey: z.string().nullable().optional(),
  /** 命中的上游真实模型名（vendor_model）。来自别名快照绑定；未绑定时为 null。 */
  vendorModel: z.string().nullable().optional(),
  /**
   * 命中的模型渠道**数据库主键（int）**，非 string UID。
   *
   * 与 `Provider.id` 强一致，做 join 时直接走 int 索引；不再单独记 `providerModelId`，
   * 上游真实 model 名通过 (`providerId`, `modelName`) → 渠道 mapping 反查即可。
   */
  /** 命中渠道 int 主键；best-effort，上游未能解析时为 null。 */
  providerId: z.number().int().positive().nullable().optional(),
  /** 该次调用走的协议；未知时为 null。 */
  apiType: apiTypeSchema.nullable().optional(),
  /**
   * 单位 ms。语义随 `streamed` 切换：
   *  - `streamed: true`  → 首字延迟（TTFT）
   *  - `streamed: false` → 端到端总耗时
   *  - 失败请求 → null
   */
  tokenLatency: z.number().int().nonnegative().nullable(),
  /**
   * 是否调用成功（二元）。
   *
   * - `true`  → `error` 必为 `null`，不要读取
   * - `false` → 必有 `error: { code, message, httpStatus }`，从 `error.code` 区分失败原因
   *
   * 旧的 `status: 'ok' | 'error' | 'timeout' | 'rate_limited' | 'cancelled'` 枚举已废弃 ——
   * 它混合了"是否成功"和"失败原因"两个维度，不纯粹；现在两者拆开。
   */
  success: z.boolean(),
  /**
   * `success === true` 时为 null，否则 `{ code, message, httpStatus }`。
   *
   * `httpStatus` 是上游 / 网关返回的 HTTP 状态码（无上游响应时为 0）；
   * 挪进 error 而不是放顶层是因为成功调用默认 200，没必要单列。
   */
  error: z
    .object({
      code: z.string().min(1),
      /** 错误描述；无上游信息时可能为 null。 */
      message: z.string().max(512).nullable(),
      httpStatus: z.number().int().nonnegative(),
    })
    .nullable(),
  /**
   * 调用方 IPv4，**网络字节序 uint32**（非点分字符串）。
   * 例：`203.0.113.7` → `3401195783`。展示用 `formatIpv4`（`@/shared/lib/ipv4`）。
   * 落库 4 字节，支持 `BETWEEN` 网段筛选；IPv6 另字段（待接）再存。
   */
  clientIpV4: z.number().int().nonnegative().nullable().optional(),
  /** 是否流式 */
  streamed: z.boolean(),
  /**
   * 关联账单（钱包扣费事件）快照。
   *
   * - 一次成功扣费的调用 → 必有一条 Bill，`status='completed'`
   * - 调用失败但仍触发扣费（如已开始流式输出后断流）→ 同样会写入 Bill，admin 可走"驳回"流程
   * - 历史导入数据 / BFF 暂未 join 上 Bill → 字段为 `null`，UI 兜底显示"扣费"金额但不允许驳回
   *
   * 驳回不另起一条流水，而是**就地改原账单**（与 `docs/api/05-billing-bills.md` 一致）：
   *   `status='reversed'` + 嵌套 `reversal` 对象
   *
   * 钱包余额结算公式：`Σ actualAmount WHERE status ∈ {completed, partial_refunded}`，
   * 驳回行自然落空，不需要再生成一条"反向"流水。
   */
  bill: z
    .discriminatedUnion('status', [
      z.object({
        id: z.string().min(1),
        status: z.literal('completed'),
      }),
      z.object({
        id: z.string().min(1),
        status: z.literal('reversed'),
        reversal: z.object({
          atUtc: epochMillisSchema,
          by: z.string().nullable(),
          code: billReverseCodeSchema,
          remark: z.string().nullable().optional(),
        }),
      }),
    ])
    .nullable()
    .optional(),
};

// ---------- LogEntry 主 schema（discriminated union） ----------

export const logEntrySchema = z.discriminatedUnion('billingType', [
  z.object({
    ...logEntryBaseShape,
    billingType: z.literal('per_token'),
    usage: perTokenUsageSchema,
    cost: perTokenCostSchema,
  }),
  z.object({
    ...logEntryBaseShape,
    billingType: z.literal('per_call'),
    usage: perCallUsageSchema,
    cost: perCallCostSchema,
  }),
  z.object({
    ...logEntryBaseShape,
    billingType: z.literal('per_image'),
    usage: perImageUsageSchema,
    cost: perImageCostSchema,
  }),
  z.object({
    ...logEntryBaseShape,
    billingType: z.literal('per_video'),
    usage: perVideoUsageSchema,
    cost: perVideoCostSchema,
  }),
  z.object({
    ...logEntryBaseShape,
    billingType: z.literal('per_audio_minute'),
    usage: perAudioMinuteUsageSchema,
    cost: perAudioMinuteCostSchema,
  }),
  z.object({
    ...logEntryBaseShape,
    billingType: z.literal('per_character'),
    usage: perCharacterUsageSchema,
    cost: perCharacterCostSchema,
  }),
]);

export type LogEntry = z.infer<typeof logEntrySchema>;

// ---------- Filter / Stats ----------

export interface ListLogsFilter {
  /** 主账户 userId 精确匹配（= `account.uid`） */
  accountUid?: string;
  /** IAM 子账户 userId 精确匹配（= `account.iamId`） */
  iamId?: string;
  /** 模糊匹配 `modelName` */
  modelName?: string;
  /** 按渠道（供应商组）精确过滤；匹配定价快照绑定的 `vendorKey`。 */
  vendorKey?: string;
  /** 命中渠道的 int 主键（= `Provider.id`） */
  providerId?: number;
  apiType?: ApiType;
  /** 会话 ID 精确匹配（用于按对话维度排障） */
  convId?: string;
  /** 必传时间范围以防全表扫；UI 默认填最近 24h */
  fromUtc?: number;
  toUtc?: number;
  /** 仅看失败调用（`success === false`）。等同于 `errorOnly` 的旧语义。 */
  errorOnly?: boolean;
  /**
   * 精确过滤 `error.code`（仅对 `success === false` 的记录生效）。
   * 配合上面 `errorOnly = true` 一起用，前端常见用法：
   *  - 排障："仅看异常" + `errorCode = 'upstream_5xx'` 定位上游故障
   *  - 风控："仅看异常" + `errorCode = 'rate_limited'` 看限流热点
   */
  errorCode?: string;
}

/** 时间分桶聚合点（按 from-to 跨度自适应桶大小：1h / 1d / etc.） */
export interface LogStatsBucket {
  /** 桶起始时间（Unix 毫秒 UTC） */
  tsUtc: number;
  calls: number;
  errors: number;
  /** 该桶总扣费（元，跨 billingType 累加） */
  cost: number;
  /** 该桶 token 数（仅 per_token 类型 usage.totalTokens 累加） */
  tokens: number;
}

/** Top 模型条目（按调用量降序） */
export interface LogStatsTopModel {
  modelName: string;
  calls: number;
  cost: number;
  /** 0-1 */
  errorRate: number;
}

/** Top 渠道条目（按调用量降序） */
export interface LogStatsTopProvider {
  /** 渠道 int 主键（= `Provider.id`） */
  providerId: number;
  calls: number;
  errors: number;
  /** 平均首字延迟（TTFT），仅 `streamed && success` 样本入聚合；纯图像 / 视频渠道为 0。单位 ms。 */
  avgTokenLatency: number;
}

/** 错误码分布条目（仅 `success === false` 的调用） */
export interface LogStatsErrorCode {
  /** 上游 / 网关错误码；缺失时为 `unknown` */
  code: string;
  count: number;
}

export interface LogStats {
  totalCalls: number;
  successCalls: number;
  errorCalls: number;
  /**
   * 平均首字延迟（TTFT），单位 ms。
   *
   * **统计口径**：仅 `streamed === true && success === true` 的样本进入聚合。
   *  - 非流式 `tokenLatency` 是端到端总耗时，量级与生成长度强相关，混入会污染平均值
   *  - 失败请求 `tokenLatency` 为 null，自然不计入
   */
  avgTokenLatency: number;
  /** P95 首字延迟（TTFT），单位 ms（与 avg 同口径）。 */
  p95TokenLatency: number;
  /** 范围内 per_token 类型的 token 求和；非 token 类型不计入。 */
  totalTokens: number;
  /** 范围内总扣费（元）。跨 billingType 可加。 */
  totalCost: number;

  /** 范围内平均 RPM（每分钟调用数，按时间跨度归一） */
  rpm: number;
  /** 桶宽（秒）—— 前端做横轴刻度 / tooltip 用 */
  bucketSizeSec: number;
  /** 时间序列分桶（按 occurredAt 升序） */
  buckets: LogStatsBucket[];
  /** Top 模型（≤ 5 条） */
  topModels: LogStatsTopModel[];
  /** Top 模型渠道（≤ 5 条） */
  topProviders: LogStatsTopProvider[];
  /** 错误码分布（仅 `success === false`，≤ 5 条；其余合入 `other`） */
  errorCodes: LogStatsErrorCode[];
}

/**
 * 按渠道（供应商组）聚合的消费统计行。
 *
 * 数据来自定价快照绑定（`ModelPricing.vendorKey`）—— 别名/供应商被删后历史仍可统计，
 * 故金额/调用量按"调用当时实际命中的渠道"归集，永不丢数据。
 */
export interface VendorConsumptionRow {
  /** 渠道（供应商组 / queue_group）。 */
  vendorKey: string;
  /** 调用次数（仅成功调用）。 */
  requestCount: number;
  /** 累计输入 token。 */
  totalPromptTokens: number;
  /** 累计输出 token。 */
  totalCompletionTokens: number;
  /** 累计扣费（元）。 */
  totalCost: number;
  /** 该渠道下出现过的上游真实模型数（去重）。 */
  upstreamModelCount: number;
}

// 让 TS 能从外部 import 这个判别签名（虽然 zod schema 已经导出）。
export type LogEntryBillingType = z.infer<typeof billingTypeSchema>;

/**
 * 驳回单条调用日志对应的账单。
 *
 * - `logId`：要驳回的日志主键，BFF 端反查 `Bill` 表用 `refType='order' && refId=logId`
 * - `reasonCode`：必填，从预设枚举里选一个；自由文本通过 `remark` 走
 * - `remark`：可选备注，会写进审计日志（admin 后期复盘用）
 *
 * BFF 端实现要点：
 *  - 事务内一次写完（避免"先驳回再回滚"的中间态）
 *  - `Bill.status = 'reversed'`、`actualAmount = 0`、回写 `reversedAtUtc/By/Code`
 *  - 钱包余额做反向冲账（按 `originalAmount`）
 *  - 重复驳回 → 409 Conflict
 */
export interface ReverseLogInput {
  logId: string;
  reasonCode: BillReverseCode;
  remark?: string;
}

/** 驳回成功后的回执 —— 用于前端就地刷新行状态，避免整页 reload */
export interface ReverseLogResult {
  logId: string;
  billId: string;
  reversedAtUtc: number;
  reversedBy: string;
  reversedCode: BillReverseCode;
}

