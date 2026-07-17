import { z } from 'zod';

export const windowUnitSchema = z.enum(['second', 'minute', 'hour']);
export type WindowUnit = z.infer<typeof windowUnitSchema>;

/**
 * 速率限制策略。三个维度 0 均表示不限：
 * - maxRequests：单个窗口内最大请求数（含失败）
 * - maxSuccesses：单个窗口内最大成功响应数（成功 = 实际计费成功）
 * - maxConcurrency：同时在途请求数上限（与窗口无关）
 * 请求 / 成功两个计数器共用 windowValue + windowUnit 定义的统计窗口。
 */
export const rateLimitPolicySchema = z.object({
  windowValue: z.number().int().positive(),
  windowUnit: windowUnitSchema,
  maxRequests: z.number().int().nonnegative(),
  maxSuccesses: z.number().int().nonnegative(),
  maxConcurrency: z.number().int().nonnegative(),
});

export type RateLimitPolicy = z.infer<typeof rateLimitPolicySchema>;

/**
 * 单个账户的覆盖。accountUid 为字符串（后端大整数，避免 JS 精度丢失）。
 * enabled 为账户独立开关：关闭后该账户回退到全局默认策略（而非不限）。
 */
export const accountRateLimitOverrideSchema = z.object({
  accountUid: z.string().min(1),
  enabled: z.boolean(),
  policy: rateLimitPolicySchema,
});

export type AccountRateLimitOverride = z.infer<typeof accountRateLimitOverrideSchema>;

/**
 * 针对具体 IP / CIDR 的覆盖。ip 为精确 IP（1.2.3.4）或 CIDR 网段（10.0.0.0/8）。
 * enabled 关闭后该 IP 回退到默认策略（而非不限）；命中最具体的覆盖优先。
 */
export const ipRateOverrideSchema = z.object({
  ip: z.string().min(1),
  enabled: z.boolean(),
  windowValue: z.number().int().positive(),
  windowUnit: windowUnitSchema,
  maxRequests: z.number().int().nonnegative(),
  maxConcurrency: z.number().int().nonnegative(),
});

export type IpRateOverride = z.infer<typeof ipRateOverrideSchema>;

/**
 * 平台级 IP 限速（与账户无关）。网关在 sk- 鉴权之前按客户端 IP 执行，
 * 用于抵御洪水与 key 爆破。enabled 关闭或上限为 0 表示不限；
 * overrides 为针对具体 IP / CIDR 的覆盖，命中且启用时优先于默认策略。
 */
export const ipRateLimitSettingsSchema = z.object({
  enabled: z.boolean(),
  windowValue: z.number().int().positive(),
  windowUnit: windowUnitSchema,
  maxRequests: z.number().int().nonnegative(),
  maxConcurrency: z.number().int().nonnegative(),
  overrides: z.array(ipRateOverrideSchema),
});

export type IpRateLimitSettings = z.infer<typeof ipRateLimitSettingsSchema>;

/** DemuxAI 产品速率限制设置（GET/PUT /demux/api/admin/rate/setting）。 */
export const rateLimitSettingsSchema = z.object({
  /** 速率限制总开关；关闭后不下发任何限制（不含 IP 限速，其有独立开关）。 */
  enabled: z.boolean(),
  defaultPolicy: rateLimitPolicySchema,
  overrides: z.array(accountRateLimitOverrideSchema),
  ip: ipRateLimitSettingsSchema,
  /** 最近一次保存时间（Unix 毫秒）；从未配置时为 0。 */
  updatedAtUtc: z.number().int(),
});

export type RateLimitSettings = z.infer<typeof rateLimitSettingsSchema>;

export const updateRateLimitSettingsSchema = z.object({
  enabled: z.boolean(),
  defaultPolicy: rateLimitPolicySchema,
  overrides: z.array(accountRateLimitOverrideSchema),
  ip: ipRateLimitSettingsSchema,
});

export type UpdateRateLimitSettingsInput = z.infer<typeof updateRateLimitSettingsSchema>;
