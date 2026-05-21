import { isMockMode } from '@/shared/runtime';

import { BillingMock } from './mock/billingMock';
import { PaymentChannelMock } from './mock/paymentChannelMock';
import { BillingHttpAdapter } from '@/shared/api/adapters/billingAdapter';
import { PaymentChannelHttpAdapter } from '@/shared/api/adapters/paymentChannelAdapter';
import type { BillingPort } from './ports/billingPort';
import type { PaymentChannelPort } from './ports/paymentChannelPort';

abstract class BillingServices {
  abstract readonly billing: BillingPort;
  abstract readonly channels: PaymentChannelPort;
}

class BillingMockServices extends BillingServices {
  readonly billing = new BillingMock();
  readonly channels = new PaymentChannelMock();
}

class BillingHttpServices extends BillingServices {
  readonly billing = new BillingHttpAdapter();
  readonly channels = new PaymentChannelHttpAdapter();
}

const services: BillingServices = isMockMode ? new BillingMockServices() : new BillingHttpServices();

export function getBillingPort(): BillingPort {
  return services.billing;
}

export function getPaymentChannelPort(): PaymentChannelPort {
  return services.channels;
}
