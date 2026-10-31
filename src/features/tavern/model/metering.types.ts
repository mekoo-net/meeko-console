import { z } from 'zod';

import { aiUsageStatusSchema, billReverseCodeSchema, perTokenUsageSchema, type BillReverseCode } from '@yomi/common';
import { epochMillisSchema } from '@/shared/lib/epoch';

/**
 * Tavern 调用日志（对应后端 `LogRowDto`，wire camelCase），按 `kind` 分两种行：
 *  - `call`：一次上游模型调用，形状对齐 Yomi `LogEntry`；
 *  - `turn`：没有调用明细的扣费回合——调用日志 2026-10-31 才开始记，之前的回合只有扣费与用量。
 * 扣费挂在行上：Tavern 按回合（`usage_logs` 一行）扣费，回合可含多次调用（工具轮次），这几行挂同一个 `bill`；
 * 没挂回合的调用由平台承担。折算、扣费、能否驳回都由服务端算好下发。
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

/** 扣费回合的状态。驳回是扣过费之后的事，所以单列：只有已驳回的回合带驳回记录，见 {@link callBillSchema}。 */
const unreversedTurnStatusSchema = z.enum(['charged', 'voided', 'failed']);
export const turnStatusSchema = z.enum([...unreversedTurnStatusSchema.options, 'reversed']);
export type TurnStatus = z.infer<typeof turnStatusSchema>;
export const turnStatusValues = turnStatusSchema.options;

/** 作废 / 失败的回合金额按设计为 0（没收到钱），不是漏记；驳回的金额是退回的数。 */
export const TurnStatusLabel: Readonly<Record<TurnStatus, string>> = {
  charged: '已扣费',
  voided: '已作废',
  failed: '扣费失败',
  reversed: '已驳回',
};

export const TurnStatusTone: Readonly<Record<TurnStatus, StatusTone>> = {
  charged: 'success',
  voided: 'info',
  failed: 'warning',
  reversed: 'danger',
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

/** 谁、何时、为什么驳回；钱已由 Billing 全额退回钱包。 */
export const turnReversalSchema = z.object({
  atUtc: epochMillisSchema,
  /** 操作的员工 uid。 */
  by: z.number().int(),
  /** 与 Yomi 调用日志、平台账单同一套原因码。 */
  code: billReverseCodeSchema,
  remark: z.string().nullable(),
});
export type TurnReversal = z.infer<typeof turnReversalSchema>;

const callBillBase = {
  usageLogId: z.number().int(),
  /** 整回合的实扣金额；作废 / 失败为 0，驳回的是退回的数。 */
  amount: z.number(),
  billSerialNo: z.string().nullable(),
  /** 服务端判定能不能驳回：给不给勾、给不给按钮都看它。 */
  reversible: z.boolean(),
  /** 这笔挂在几行上（回合有几次调用）；大于 1 时同一笔金额在每一行上都有，不能逐行相加。 */
  calls: z.number().int().positive(),
};

/** 所属扣费回合，按 status 判别：只有已驳回的带 reversal。 */
export const callBillSchema = z.discriminatedUnion('status', [
  z.object({ ...callBillBase, status: unreversedTurnStatusSchema }),
  z.object({ ...callBillBase, status: z.literal('reversed'), reversal: turnReversalSchema }),
]);
export type CallBill = z.infer<typeof callBillSchema>;

export const callLogSchema = z.object({
  kind: z.literal('call'),
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

// ---------- 计价用量（计费配置页的报价预览） ----------

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

// ---------- 没有调用明细的回合 ----------

/** 一整个扣费回合占一行：用量是回合内各次调用的明细，钱和驳回与调用行同一个 `bill`。 */
export const turnLogSchema = z.object({
  kind: z.literal('turn'),
  /** `usage_logs` 的 id，与 `bill.usageLogId` 相同。 */
  id: z.number().int(),
  traceId: z.string(),
  accountUid: z.number().int(),
  sessionId: z.string().nullable(),
  proactive: z.boolean(),
  usages: z.array(meteredUsageSchema),
  bill: callBillSchema,
  createdAt: epochMillisSchema,
});
export type TurnLog = z.infer<typeof turnLogSchema>;

export const logRowSchema = z.discriminatedUnion('kind', [callLogSchema, turnLogSchema]);
export type LogRow = z.infer<typeof logRowSchema>;

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
export interface CallLogQuery {
  page: number;
  pageSize: number;
  fromUtc: number;
  toUtc: number;
  accountUid?: number;
  /** 一个回合的全部调用。 */
  traceId?: string;
  pipeline?: string;
  /** 不分大小写匹配「渠道/模型」的一段：`opus`、`kiro/`、`kiro/claude-opus-5.5` 都行。 */
  model?: string;
  status?: CallStatus;
  /** true = 只看向用户收费的；false = 只看平台承担的。 */
  billed?: boolean;
}

// ---------- 驳回 ----------

/** 驳回一个或一批回合：一批共用一个原因码，备注可选（≤200 字）。 */
export interface ReverseTurnsInput {
  ids: number[];
  reasonCode: BillReverseCode;
  remark?: string;
}

/** 服务端逐个处理、逐个回结果：成了带驳回记录（回合其余不变），没成带原因。 */
export const turnReversalOutcomeSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('reversed'), id: z.number().int(), reversal: turnReversalSchema }),
  z.object({ outcome: z.literal('rejected'), id: z.number().int(), reason: z.string() }),
]);
export type TurnReversalOutcome = z.infer<typeof turnReversalOutcomeSchema>;
export type TurnReversed = Extract<TurnReversalOutcome, { outcome: 'reversed' }>;
export type TurnReversalRejected = Extract<TurnReversalOutcome, { outcome: 'rejected' }>;
