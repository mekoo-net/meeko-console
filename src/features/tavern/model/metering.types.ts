import { z } from 'zod';

import { aiUsageStatusSchema, perTokenUsageSchema } from '@yomi/common';
import { epochMillisSchema } from '@/shared/lib/epoch';

/**
 * Tavern 计量的两本账（对应后端 `CallLogDto` / `UsageLogDto`，wire camelCase）：
 *  - 调用（call）：每次上游模型调用一行，不论是否向用户收费，形状对齐 Yomi `LogEntry`；
 *  - 计费回合（turn = platform.usage_logs 一行）：向用户扣费的单位，可含多次调用（工具轮次）。
 * 没挂到回合上的调用由平台承担。所有金额（折算、报价、汇总）都由服务端按现行价目算好下发。
 */

// ---------- 状态 ----------

/** 与 Yomi `AiUsageStatus` 同名同值；调用结束才上报，所以没有 pending。展示用 `AiUsageStatusLabel`。 */
export const callStatusSchema = aiUsageStatusSchema.extract(['success', 'failure', 'cancelled']);
export type CallStatus = z.infer<typeof callStatusSchema>;
export const callStatusValues = callStatusSchema.options;

export type StatusTone = 'success' | 'info' | 'warning' | 'danger';

export const CallStatusTone: Readonly<Record<CallStatus, StatusTone>> = {
  success: 'success',
  failure: 'danger',
  cancelled: 'info',
};

export const turnStatusSchema = z.enum(['charged', 'voided', 'failed']);
export type TurnStatus = z.infer<typeof turnStatusSchema>;
export const turnStatusValues = turnStatusSchema.options;

/** 作废 / 失败的回合金额按设计为 0（没收到钱），不是漏记。 */
export const TurnStatusLabel: Readonly<Record<TurnStatus, string>> = {
  charged: '已扣费',
  voided: '已作废',
  failed: '扣费失败',
};

export const TurnStatusTone: Readonly<Record<TurnStatus, StatusTone>> = {
  charged: 'success',
  voided: 'info',
  failed: 'warning',
};

// ---------- 报价 ----------

/** 价目对一条用量的报价：金额 = 计价用量 × 倍率 × 基线，四个数都由服务端给。 */
export const usageQuoteSchema = z.object({
  multiplier: z.number(),
  baseline: z.number(),
  billableQuantity: z.number(),
  amount: z.number(),
});
export type UsageQuote = z.infer<typeof usageQuoteSchema>;

const tokenTotalsSchema = z.object({
  input: z.number().int().nonnegative(),
  output: z.number().int().nonnegative(),
});

// ---------- 调用 ----------

export const pipelineRefSchema = z.object({ id: z.string(), label: z.string() });
export type PipelineRef = z.infer<typeof pipelineRefSchema>;

/**
 * 与 Yomi per_token 用量同形（OneApi `TokenUsageDocument`），产出侧多一个回图的 `imageTokens`。
 * 产出各桶互不重叠：`output.tokens` 是剥掉推理之后的正文量。
 */
export const callUsageSchema = perTokenUsageSchema.extend({
  output: perTokenUsageSchema.shape.output.extend({
    imageTokens: z.number().int().nonnegative(),
  }),
});
export type CallUsage = z.infer<typeof callUsageSchema>;

/** 调用上下文，后端 `llm_call_logs.content` jsonb 的镜像；与 Yomi `LogContent` 重合的字段同名同义。 */
export const callContentSchema = z.object({
  worldId: z.string(),
  /** 世界级调用（纪事、世界逻辑）没有频道。 */
  sessionId: z.string().nullable(),
  /** 角色自主开口：用的是 dialogue 模型，但不是用户发起的回合。 */
  proactive: z.boolean(),
  /** 首字延迟（TTFT）；什么都没回来为 null。 */
  latencyMs: z.number().int().nonnegative().nullable(),
  durationMs: z.number().int().nonnegative(),
  toolCalls: z.number().int().nonnegative(),
  /** 上游终止原因原文，不归一。 */
  stopReason: z.string().nullable(),
  /** 失败原因；成功、取消的调用没有。上游只回了原文时 code 为 null。 */
  error: z.object({ code: z.string().nullable(), message: z.string().nullable() }).nullable(),
});
export type CallContent = z.infer<typeof callContentSchema>;

/** 所属扣费回合；一回合多次调用时挂的是同一个回合、同一笔金额。 */
export const callBillSchema = z.object({
  usageLogId: z.number().int(),
  status: turnStatusSchema,
  amount: z.number(),
});
export type CallBill = z.infer<typeof callBillSchema>;

export const callLogSchema = z.object({
  id: z.string().min(1),
  traceId: z.string().nullable(),
  accountUid: z.number().int(),
  pipeline: pipelineRefSchema,
  vendorKey: z.string(),
  modelName: z.string(),
  status: callStatusSchema,
  content: callContentSchema,
  usage: callUsageSchema,
  /** 按现行价目折算，不论是否收费。 */
  cost: usageQuoteSchema,
  /** null = 不向用户收费，由平台承担。 */
  bill: callBillSchema.nullable(),
  createdAt: epochMillisSchema,
});
export type CallLog = z.infer<typeof callLogSchema>;

/** 一组调用的合计；金额拆成挂在扣费回合上的与平台承担的。 */
export const callTallySchema = z.object({
  calls: z.number().int().nonnegative(),
  failures: z.number().int().nonnegative(),
  tokens: tokenTotalsSchema,
  cost: z.object({ billed: z.number(), platformBorne: z.number(), total: z.number() }),
});
export type CallTally = z.infer<typeof callTallySchema>;

/** 服务端已按平台承担金额降序排好。 */
export const callSummarySchema = z.object({
  pipelines: z.array(z.object({ pipeline: pipelineRefSchema, tally: callTallySchema })),
  total: callTallySchema,
});
export type CallSummary = z.infer<typeof callSummarySchema>;
export type PipelineTally = CallSummary['pipelines'][number];

// ---------- 计费回合 ----------

export const countedUnitSchema = z.enum(['image', 'audio_second', 'video_second']);
export type CountedUnit = z.infer<typeof countedUnitSchema>;

export const CountedUnitLabel: Readonly<Record<CountedUnit, string>> = {
  image: '张',
  audio_second: '秒语音',
  video_second: '秒视频',
};

const meteredUsageBase = {
  /** 裸模型名（不带渠道前缀），倍率表按它查。 */
  modelName: z.string(),
  vendorKey: z.string().nullable(),
  kind: z.string(),
};

/** 一条计价用量：按 token 计（输入 / 输出）或按件计（张 / 秒），`unit` 判别形状。 */
export const meteredUsageSchema = z.discriminatedUnion('unit', [
  z.object({
    ...meteredUsageBase,
    unit: z.literal('token'),
    promptTokens: z.number().int().nonnegative(),
    completionTokens: z.number().int().nonnegative(),
  }),
  z.object({
    ...meteredUsageBase,
    unit: countedUnitSchema,
    quantity: z.number().nonnegative(),
  }),
]);
export type MeteredUsage = z.infer<typeof meteredUsageSchema>;

export const UsageKindLabel: Readonly<Record<string, string>> = {
  chat: '对话',
  wake: '自主唤醒',
  embedding: '向量化',
  generation: '媒体生成',
};

export const usageLogSchema = z.object({
  id: z.number().int(),
  traceId: z.string(),
  accountUid: z.number().int(),
  sessionId: z.string().nullable(),
  proactive: z.boolean(),
  status: turnStatusSchema,
  amount: z.number(),
  billSerialNo: z.string().nullable(),
  usages: z.array(meteredUsageSchema),
  createdAt: epochMillisSchema,
});
export type UsageLog = z.infer<typeof usageLogSchema>;

export const usageLogDetailSchema = z.object({
  turn: usageLogSchema,
  /** 每条用量按现行价目的报价。 */
  lines: z.array(z.object({ usage: meteredUsageSchema, quote: usageQuoteSchema })),
  /** 用现在的价目重算整回合（含自主倍率）。 */
  amountAtCurrentPricing: z.number(),
  /** 实扣过、且与现行价目算出来的不一样：扣费之后改过价。作废 / 失败的回合恒为 false。 */
  repriced: z.boolean(),
  /** 同一 trace 下的全部调用，按发生顺序。 */
  calls: z.array(callLogSchema),
});
export type UsageLogDetail = z.infer<typeof usageLogDetailSchema>;
export type UsageLine = UsageLogDetail['lines'][number];

export const usageSummarySchema = z.object({
  turns: z.object({
    total: z.number().int().nonnegative(),
    charged: z.number().int().nonnegative(),
    voided: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  }),
  chargedAmount: z.number(),
  payingAccounts: z.number().int().nonnegative(),
  tokens: tokenTotalsSchema,
  /** 按实扣金额降序。 */
  topAccounts: z.array(
    z.object({ accountUid: z.number().int(), turns: z.number().int(), amount: z.number() }),
  ),
});
export type UsageSummary = z.infer<typeof usageSummarySchema>;
export type AccountSpend = UsageSummary['topAccounts'][number];

// ---------- 分页与查询 ----------

/** 同 Yomi 日志页的 `ItemsEnvelope`：`p` 从 1 起。 */
export function pageSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    page: z.number().int(),
    pageSize: z.number().int(),
  });
}

/** 后端要求时间范围必填且不超过 31 天。 */
export interface RangeQuery {
  fromUtc: number;
  toUtc: number;
  accountUid?: number;
}

export interface PageQuery extends RangeQuery {
  page: number;
  pageSize: number;
}

export interface CallLogQuery extends PageQuery {
  pipeline?: string;
  /** 不分大小写匹配「渠道/模型」的一段：`opus`、`kiro/claude-opus-5.5` 都行。 */
  model?: string;
  status?: CallStatus;
  /** true = 只看向用户收费的；false = 只看平台承担的。 */
  billed?: boolean;
}

export interface UsageLogQuery extends PageQuery {
  status?: TurnStatus;
}
