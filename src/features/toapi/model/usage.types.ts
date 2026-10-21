import { z } from 'zod';

import {
  aiUsageStatusSchema,
  logContentSchema,
  perImageUsageSchema,
  perTokenUsageSchema,
  perVideoUsageSchema,
  uidString,
  type AiUsageStatus,
} from '@yomi/common';
import { epochMillisSchema } from '@/shared/lib/epoch';

/**
 * ToApi 调用日志，形状对齐 Yomi `LogEntry`（`@yomi/common` log.ts）：
 * 同名字段同义，`status` / `content` / `usage` 直接复用同一套 schema。
 *
 * 与 Yomi 的差异只有三处：
 *  - `token` 多一个 `kind`：ToApi 的调用方可能是用户令牌，也可能是 IDE 接入会话
 *  - `cost` 只有 `estimated` / `total`：ToApi 按钉住的定价行整笔结算，不拆维度
 *  - 没有 `vendorPlug` / `vendorModel` / `bill`：ToApi 不做别名，也不产生 Bill
 *
 * 后端来源是 `usage_reservations` 一行：Reserve 建行、Commit 落用量与实扣、失败释放。
 * 状态映射：Active → pending，Committed → success（带 errorCode 则 failure），Cancelled → failure，Expired → cancelled。
 */

export const tokenKindValues = ['token', 'access'] as const;
export type TokenKind = (typeof tokenKindValues)[number];
export const TokenKindLabel: Record<TokenKind, string> = {
  token: '令牌',
  access: 'IDE 接入',
};

const usageLogBaseShape = {
  id: uidString,
  /** 网关生成的 W3C trace id，同时是占用单幂等键。 */
  traceId: z.string().min(1),
  createAt: epochMillisSchema,
  account: z.object({
    uid: uidString,
    email: z.string().nullish(),
    phone: z.string().nullish(),
  }),
  /** 调用方快照；老数据未记录时为 null。 */
  token: z
    .object({
      id: uidString,
      name: z.string(),
      kind: z.enum(tokenKindValues),
    })
    .nullable()
    .optional(),
  vendorKey: z.string().min(1),
  modelName: z.string().min(1),
  status: aiUsageStatusSchema,
  content: logContentSchema,
  /** CNY。`estimated` 是 Reserve 预扣；`total` 是 Commit 实扣，未结算为 0。 */
  cost: z.object({
    estimated: z.number().nonnegative(),
    total: z.number().nonnegative(),
  }),
};

export const usageLogSchema = z.discriminatedUnion('billingType', [
  z.object({ ...usageLogBaseShape, billingType: z.literal('per_token'), usage: perTokenUsageSchema }),
  z.object({ ...usageLogBaseShape, billingType: z.literal('per_image'), usage: perImageUsageSchema }),
  z.object({ ...usageLogBaseShape, billingType: z.literal('per_video'), usage: perVideoUsageSchema }),
  /** 未结算（pending / 失败释放）时 usage 尚未落，后端给 token 形全零。 */
  z.object({ ...usageLogBaseShape, billingType: z.literal('unknown'), usage: perTokenUsageSchema }),
]);
export type UsageLog = z.infer<typeof usageLogSchema>;

export interface ListUsageLogsFilter {
  accountUid?: string;
  /** 邮箱 / 手机，服务端经 Keystone 解析成 account_uid。 */
  contactKeyword?: string;
  fromUtc?: number;
  toUtc?: number;
  vendorKey?: string;
  /** 模糊匹配 */
  modelName?: string;
  traceId?: string;
  status?: AiUsageStatus | 'all';
  tokenKind?: TokenKind | 'all';
}

/** 与 Yomi `LogStats` 同名字段的子集；ToApi 不出分桶 / 排行。 */
export const usageLogStatsSchema = z.object({
  totalCalls: z.number().int().nonnegative(),
  successCalls: z.number().int().nonnegative(),
  errorCalls: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  totalCost: z.number().nonnegative(),
  /** ms；有 latencyMs 的成功样本均值，无样本为 0。 */
  avgTokenLatency: z.number().nonnegative(),
});
export type UsageLogStats = z.infer<typeof usageLogStatsSchema>;
