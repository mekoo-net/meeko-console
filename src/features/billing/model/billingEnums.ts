import { z } from 'zod';

/** 与 Meeko.Contracts.Billing 枚举数值一致（short） */

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
