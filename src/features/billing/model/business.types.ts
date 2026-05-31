import { z } from 'zod';

import { epochMillisNullableSchema, epochMillisSchema } from '@/shared/lib/epoch';

/**
 * 业务（已开通服务）实例。语义上属于"账户已激活的产品资源"——
 * 与订单（OrderDto，下单/支付/完结过程）、订阅（SubscriptionDto，计费周期）解耦。
 *
 * 业务状态仅三态：开通 / 暂停 / 停止。其他过渡状态由订单层表达。
 */
export const businessStatusValues = ['opened', 'paused', 'stopped'] as const;
export type BusinessStatus = (typeof businessStatusValues)[number];

export const BusinessStatusLabel: Readonly<Record<BusinessStatus, string>> = {
  opened: '开通',
  paused: '暂停',
  stopped: '停止',
};

export const BusinessStatusTone: Readonly<
  Record<BusinessStatus, 'success' | 'warning' | 'danger' | 'info'>
> = {
  opened: 'success',
  paused: 'warning',
  stopped: 'danger',
};

const idString = z.union([z.string(), z.number()]).transform((v) => String(v));

export const businessInstanceSchema = z.object({
  id: idString,
  accountUid: idString,
  productCode: z.string(),
  productName: z.string(),
  status: z.enum(businessStatusValues),
  openedAtUtc: epochMillisSchema,
  pausedAtUtc: epochMillisNullableSchema.optional(),
  stoppedAtUtc: epochMillisNullableSchema.optional(),
  /** 当前计费周期到期时间；停止业务可省略。 */
  currentPeriodEndUtc: epochMillisNullableSchema.optional(),
});

export type BusinessInstance = z.infer<typeof businessInstanceSchema>;

export interface ListBusinessesFilter {
  status: BusinessStatus | 'all';
}
