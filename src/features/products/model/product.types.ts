export type BillingModeCode = 'one_shot' | 'subscription' | 'payg_hour' | 'payg_call';

export type SubscriptionPeriodCode = 'monthly' | 'yearly';

export interface BillingProduct {
  code: string;
  domain: string;
  displayName: string;
  billingMode: BillingModeCode;
  unitPrice: number;
  unit: string;
  period?: SubscriptionPeriodCode | null;
  metadataJson?: string | null;
  active: boolean;
  createdAtUtc: number;
  updatedAtUtc: number;
}

export interface RegisterProductInput {
  code: string;
  domain: string;
  displayName: string;
  billingMode: BillingModeCode;
  unitPrice: number;
  unit: string;
  period?: SubscriptionPeriodCode | null;
  metadataJson?: string | null;
}

export interface UpdateProductInput {
  displayName?: string;
  unitPrice?: number;
  unit?: string;
  period?: SubscriptionPeriodCode | null;
  clearPeriod?: boolean;
  metadataJson?: string | null;
}

export const billingModeOptions: Array<{ value: BillingModeCode; label: string }> = [
  { value: 'payg_call', label: '按次 (PAYG Call)' },
  { value: 'payg_hour', label: '按小时 (PAYG Hour)' },
  { value: 'one_shot', label: '一次性 (OneShot)' },
  { value: 'subscription', label: '订阅 (Subscription)' },
];

export const periodOptions: Array<{ value: SubscriptionPeriodCode; label: string }> = [
  { value: 'monthly', label: '月付' },
  { value: 'yearly', label: '年付' },
];
