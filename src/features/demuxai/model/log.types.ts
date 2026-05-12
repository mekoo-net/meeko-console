import { z } from 'zod';

import { apiTypeSchema, logStatusSchema, type ApiType, type LogStatus } from './enums';
import type { Uid } from '@/shared/lib/id';

const uidString = z.union([z.string(), z.number()]).transform((v) => String(v));

/**
 * 调用日志单条。
 *
 * **大概率独立微服务**（ClickHouse / ES），与控制面 Provider/Model/Pricing 不同源；
 * 因此 Logs 单独一个 Port，HttpAdapter 也对应独立 baseUrl。
 *
 * 设计要点：
 *  - `uid` 必须是单调递增的 snowflake，前端按它做"上一页 / 下一页" cursor 也可行
 *  - `accountUid` + `iamUserUid`：主账户钱归它扣，但实操可能是子账户（IAM 用户）
 *  - 上游模型与价格是**快照**字段（如 `providerModelId`、`multiplierSnapshot`），
 *    这样事后改定价不会影响历史账单
 *  - `errorCode` 是枚举码，`errorMessage` 是上游原文摘要（前端 truncate 200 char）
 *  - 不存 prompt / completion 原文（隐私 & 体积），调试用另一套抓样系统
 *
 * 关于"已删除模型"：
 *  - 前端 Mock 走硬删，UI 在 Models 表查不到对应 modelId 时显示为 `<已删除>`
 *  - 真 BFF 端 Model 走软删（tombstone），仍能 join 到 displayName；前端逻辑一致
 */
export const logEntrySchema = z.object({
  uid: uidString,
  occurredAtUtc: z.string(),
  accountUid: uidString,
  iamUserUid: uidString,
  /** 对外暴露的 modelId（用户请求体里的 model） */
  modelId: z.string(),
  /** 实际选中的模型渠道 uid */
  providerUid: uidString,
  /** 上游真实 model 名（如 modelId='demux-gpt-4o' → providerModelId='gpt-4o'） */
  providerModelId: z.string(),
  /** 该次调用走的协议 */
  apiType: apiTypeSchema,
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  /** 输入扣费（元） */
  inputCost: z.number().nonnegative(),
  /** 输出扣费（元） */
  outputCost: z.number().nonnegative(),
  /** = inputCost + outputCost（冗余存便于聚合 + 索引） */
  totalCost: z.number().nonnegative(),
  /** 调用时生效的全局倍率，事后改定价不影响历史 */
  multiplierSnapshot: z.number().positive(),
  /** 调用时账户 LV，事后升降不影响历史 */
  tierSnapshot: z.number().int().min(1),
  /** 总耗时 ms */
  latencyMs: z.number().int().nonnegative(),
  /** Time-to-first-token，stream 模式有意义 */
  firstTokenLatencyMs: z.number().int().nonnegative().nullable().optional(),
  status: logStatusSchema,
  /** HTTP 状态码（上游或网关返回） */
  httpStatus: z.number().int(),
  /** 枚举错误码，failed/timeout/rate_limited 时必填 */
  errorCode: z.string().nullable().optional(),
  /** 截断后的错误摘要（≤ 200 字符） */
  errorMessage: z.string().nullable().optional(),
  /** 调用方 IP，用于风控复盘 */
  requestIp: z.string().nullable().optional(),
  /** 是否流式 */
  streamed: z.boolean(),
});

export type LogEntry = z.infer<typeof logEntrySchema>;

export interface ListLogsFilter {
  /** 主账户精确匹配 */
  accountUid?: string;
  /** IAM 子账户精确匹配 */
  iamUserUid?: string;
  /** 模糊匹配 modelId */
  modelId?: string;
  providerUid?: string;
  apiType?: ApiType;
  status: LogStatus | 'all';
  /** 必传时间范围以防全表扫；UI 默认填最近 24h */
  fromUtc?: string;
  toUtc?: string;
  /** 是否仅看异常（status != 'ok'），便于一键定位 */
  errorOnly?: boolean;
}

/** 时间分桶聚合点（按 from-to 跨度自适应桶大小：1h / 1d / etc.） */
export interface LogStatsBucket {
  /** 桶起始时间（UTC ISO） */
  tsUtc: string;
  calls: number;
  errors: number;
  /** 该桶总扣费（元） */
  cost: number;
  /** 该桶总 tokens */
  tokens: number;
}

/** Top 模型条目（按调用量降序） */
export interface LogStatsTopModel {
  modelId: string;
  calls: number;
  cost: number;
  /** 0-1 */
  errorRate: number;
}

/** Top 渠道条目（按调用量降序） */
export interface LogStatsTopProvider {
  providerUid: Uid;
  calls: number;
  errors: number;
  avgLatencyMs: number;
}

/** 错误码分布条目（仅非 ok 调用） */
export interface LogStatsErrorCode {
  /** 上游 / 网关错误码；缺失时为 `unknown` */
  code: string;
  count: number;
}

/** 状态分布条目 */
export interface LogStatsStatus {
  status: LogStatus;
  count: number;
}

export interface LogStats {
  totalCalls: number;
  successCalls: number;
  errorCalls: number;
  /** 平均延迟 ms */
  avgLatencyMs: number;
  /** P95 延迟 ms */
  p95LatencyMs: number;
  /** 范围内总 tokens */
  totalTokens: number;
  /** 范围内总扣费（元） */
  totalCost: number;

  /** 范围内平均 RPM（每分钟调用数，按时间跨度归一） */
  rpm: number;
  /** 桶宽（秒）—— 前端做横轴刻度 / tooltip 用 */
  bucketSizeSec: number;
  /** 时间序列分桶（按 occurredAt 升序） */
  buckets: LogStatsBucket[];
  /** 状态分布（用于环形图） */
  statusBreakdown: LogStatsStatus[];
  /** Top 模型（≤ 5 条） */
  topModels: LogStatsTopModel[];
  /** Top 模型渠道（≤ 5 条） */
  topProviders: LogStatsTopProvider[];
  /** 错误码分布（仅 status≠ok，≤ 5 条；其余合入 `other`） */
  errorCodes: LogStatsErrorCode[];
}
