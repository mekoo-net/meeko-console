import { z } from 'zod';

/** 与 Meeko.Contracts.Billing 枚举数值一致（short） */

export const billingModeSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);

export type BillingMode = z.infer<typeof billingModeSchema>;

export const BillingModeLabel: Readonly<Record<BillingMode, string>> = {
  0: '一次性',
  1: '订阅',
  2: '按量·小时',
  3: '按量·调用',
};

export const subscriptionPeriodSchema = z.union([z.literal(0), z.literal(1)]);
export type SubscriptionPeriod = z.infer<typeof subscriptionPeriodSchema>;

export const SubscriptionPeriodLabel: Readonly<Record<SubscriptionPeriod, string>> = {
  0: '月付',
  1: '年付',
};

export const paymentSceneSchema = z.number().int();
export type PaymentScene = z.infer<typeof paymentSceneSchema>;

export const PaymentSceneLabel: Readonly<Record<number, string>> = {
  0: 'Native',
  1: 'H5',
  2: 'JsApi',
  3: 'App',
  4: 'PC',
  99: '手工入账',
};

export const orderStatusSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);

export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const OrderStatusLabel: Readonly<Record<OrderStatus, string>> = {
  0: '已创建',
  1: '开通中',
  2: '生效',
  3: '已完成',
  4: '已取消',
  5: '失败',
  6: '已暂停',
};

export const OrderStatusTone: Readonly<
  Record<OrderStatus, 'success' | 'warning' | 'danger' | 'info'>
> = {
  0: 'info',
  1: 'warning',
  2: 'success',
  3: 'info',
  4: 'danger',
  5: 'danger',
  6: 'warning',
};

export const subscriptionStatusSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);

export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

export const SubscriptionStatusLabel: Readonly<Record<SubscriptionStatus, string>> = {
  0: '活跃',
  1: '逾期',
  2: '取消中',
  3: '已取消',
};

export const SubscriptionStatusTone: Readonly<
  Record<SubscriptionStatus, 'success' | 'warning' | 'danger' | 'info'>
> = {
  0: 'success',
  1: 'danger',
  2: 'warning',
  3: 'info',
};

export const invoiceKindSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);
export type InvoiceKind = z.infer<typeof invoiceKindSchema>;

export const InvoiceKindLabel: Readonly<Record<InvoiceKind, string>> = {
  0: '订阅',
  1: '按量·月结',
  2: '一次性',
};

export const invoiceStatusSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;

export const InvoiceStatusLabel: Readonly<Record<InvoiceStatus, string>> = {
  0: '草稿',
  1: '待支付',
  2: '已支付',
  3: '作废',
};

export const InvoiceStatusTone: Readonly<
  Record<InvoiceStatus, 'success' | 'warning' | 'danger' | 'info'>
> = {
  0: 'info',
  1: 'warning',
  2: 'success',
  3: 'danger',
};
