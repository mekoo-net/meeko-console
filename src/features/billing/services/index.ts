import { BillingMock } from './mock/billingMock';
import { PaymentChannelMock } from './mock/paymentChannelMock';
import type { BillingPort } from './ports/billingPort';
import type { PaymentChannelPort } from './ports/paymentChannelPort';

let cached: BillingPort | null = null;
let cachedChannel: PaymentChannelPort | null = null;

function shouldUseMock(): boolean {
  const raw = import.meta.env?.VITE_USE_MOCK;
  if (typeof raw === 'string') return raw.toLowerCase() !== 'false';
  return true;
}

export function getBillingPort(): BillingPort {
  if (cached !== null) return cached;
  if (shouldUseMock()) {
    cached = new BillingMock();
    return cached;
  }
  throw new Error(
    'HttpBillingAdapter 尚未实现：请在 services/bff 中接入 /api/billing 并在此处注册。',
  );
}

export function getPaymentChannelPort(): PaymentChannelPort {
  if (cachedChannel !== null) return cachedChannel;
  if (shouldUseMock()) {
    cachedChannel = new PaymentChannelMock();
    return cachedChannel;
  }
  throw new Error('HttpPaymentChannelAdapter 尚未实现。');
}
