import { z } from 'zod';

import {
  billingModeSchema,
  invoiceKindSchema,
  invoiceStatusSchema,
  orderStatusSchema,
  subscriptionPeriodSchema,
  subscriptionStatusSchema,
} from './billingEnums';
import type { InvoiceKind, OrderStatus } from './billingEnums';

export const rechargeStatusValues = ['pending', 'paid', 'expired', 'cancelled'] as const;
export type RechargeStatus = (typeof rechargeStatusValues)[number];

export const RechargeStatusLabel: Readonly<Record<RechargeStatus, string>> = {
  pending: '待支付',
  paid: '已支付',
  expired: '已过期',
  cancelled: '已取消',
};

export const RechargeStatusTone: Readonly<Record<RechargeStatus, 'success' | 'warning' | 'danger' | 'info'>> = {
  pending: 'warning',
  paid: 'success',
  expired: 'info',
  cancelled: 'danger',
};

/** long → string（与仓库其余 UID 约定一致） */
const uidString = z.union([z.string(), z.number()]).transform((v) => String(v));

export const walletSnapshotSchema = z.object({
  accountUid: uidString,
  available: z.number(),
  held: z.number(),
  currency: z.string(),
  updatedAtUtc: z.string(),
});

export type WalletSnapshot = z.infer<typeof walletSnapshotSchema>;

export const rechargeIntentSchema = z.object({
  rechargeUid: uidString,
  outTradeNo: z.string(),
  provider: z.string(),
  scene: z.number().int(),
  amount: z.number(),
  currency: z.string(),
  qrCodeUrl: z.string().nullable().optional(),
  redirectUrl: z.string().nullable().optional(),
  jsApiPayloadJson: z.string().nullable().optional(),
  createdAtUtc: z.string(),
  expiresAtUtc: z.string().nullable().optional(),
});

export type RechargeIntent = z.infer<typeof rechargeIntentSchema>;

export const placeOrderResultSchema = z.object({
  orderUid: uidString,
  status: orderStatusSchema,
  billingMode: billingModeSchema,
  holdUid: uidString.nullable().optional(),
  subscriptionUid: uidString.nullable().optional(),
  invoiceUid: uidString.nullable().optional(),
  amount: z.number(),
});

export type PlaceOrderResult = z.infer<typeof placeOrderResultSchema>;

export const orderDtoSchema = z.object({
  uid: uidString,
  accountUid: uidString,
  productCode: z.string(),
  quantity: z.number().int(),
  billingMode: billingModeSchema,
  unitPriceSnapshot: z.number(),
  status: orderStatusSchema,
  resourceUid: uidString.nullable().optional(),
  metadataJson: z.string().nullable().optional(),
  createdAtUtc: z.string(),
  activatedAtUtc: z.string().nullable().optional(),
  terminatedAtUtc: z.string().nullable().optional(),
});

export type OrderDto = z.infer<typeof orderDtoSchema>;

export const subscriptionDtoSchema = z.object({
  uid: uidString,
  accountUid: uidString,
  orderUid: uidString,
  productCode: z.string(),
  period: subscriptionPeriodSchema,
  currentPeriodStartUtc: z.string(),
  currentPeriodEndUtc: z.string(),
  nextBillingAtUtc: z.string(),
  status: subscriptionStatusSchema,
  autoRenew: z.boolean(),
  cancelAtPeriodEnd: z.boolean(),
  createdAtUtc: z.string(),
});

export type SubscriptionDto = z.infer<typeof subscriptionDtoSchema>;

export const invoiceDtoSchema = z.object({
  uid: uidString,
  accountUid: uidString,
  kind: invoiceKindSchema,
  periodStartUtc: z.string().nullable().optional(),
  periodEndUtc: z.string().nullable().optional(),
  subtotal: z.number(),
  tax: z.number(),
  total: z.number(),
  currency: z.string(),
  status: invoiceStatusSchema,
  issuedAtUtc: z.string(),
  paidAtUtc: z.string().nullable().optional(),
  subscriptionUid: uidString.nullable().optional(),
  orderUid: uidString.nullable().optional(),
});

export type InvoiceDto = z.infer<typeof invoiceDtoSchema>;

export const rechargeRecordSchema = z.object({
  uid: uidString,
  accountUid: uidString,
  outTradeNo: z.string(),
  provider: z.string(),
  scene: z.number().int(),
  amount: z.number(),
  currency: z.string(),
  status: z.enum(rechargeStatusValues),
  createdAtUtc: z.string(),
  paidAtUtc: z.string().nullable().optional(),
});

export type RechargeRecord = z.infer<typeof rechargeRecordSchema>;

/**
 * 消费（扣费）记录。
 *
 * 业务语义：账户钱包发生的一次扣费事件，可能来源于订阅扣款、用量扣费、
 * 一次性订单、人工调账等。比 Invoice 更细粒度，对运营是审计型流水。
 */
export const consumptionTypeValues = ['subscription', 'usage', 'one_time', 'adjustment'] as const;
export type ConsumptionType = (typeof consumptionTypeValues)[number];

export const ConsumptionTypeLabel: Readonly<Record<ConsumptionType, string>> = {
  subscription: '订阅扣款',
  usage: '用量扣费',
  one_time: '一次性订单',
  adjustment: '人工调账',
};

export const consumptionStatusValues = ['completed', 'pending', 'reversed'] as const;
export type ConsumptionStatus = (typeof consumptionStatusValues)[number];

export const ConsumptionStatusLabel: Readonly<Record<ConsumptionStatus, string>> = {
  completed: '已完成',
  pending: '处理中',
  reversed: '已冲正',
};

export const ConsumptionStatusTone: Readonly<
  Record<ConsumptionStatus, 'success' | 'warning' | 'danger' | 'info'>
> = {
  completed: 'success',
  pending: 'warning',
  reversed: 'danger',
};

export const consumptionRecordSchema = z.object({
  uid: uidString,
  accountUid: uidString,
  productCode: z.string(),
  description: z.string().optional(),
  /** 扣费金额，正数；冲正记录用 reversed 状态体现 */
  amount: z.number(),
  currency: z.string(),
  type: z.enum(consumptionTypeValues),
  status: z.enum(consumptionStatusValues),
  orderUid: uidString.nullable().optional(),
  invoiceUid: uidString.nullable().optional(),
  occurredAtUtc: z.string(),
});

export type ConsumptionRecord = z.infer<typeof consumptionRecordSchema>;

export interface CreateRechargeInput {
  amount: number;
  provider?: string | undefined;
  scene?: number | undefined;
  subject?: string | undefined;
  clientIp?: string | undefined;
  returnUrl?: string | undefined;
  openId?: string | undefined;
}

export interface PlaceOrderInput {
  productCode: string;
  quantity: number;
  currency?: string | undefined;
  metadataJson?: string | undefined;
  idempotencyKey?: string | undefined;
}

export interface ListOrdersFilter {
  status: OrderStatus | 'all';
}

export interface ListInvoicesFilter {
  kind: InvoiceKind | 'all';
  fromUtc?: string | undefined;
  toUtc?: string | undefined;
}
