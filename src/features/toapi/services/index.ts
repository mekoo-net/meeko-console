import { isMockMode } from '@/shared/runtime';
import { ToApiPricingHttpAdapter } from '@/features/toapi/api/adapters/toapiPricingAdapter';
import { ToApiUsageHttpAdapter } from '@/features/toapi/api/adapters/toapiUsageAdapter';

import { ToApiPricingMock } from './mock/toapiPricingMock';
import { ToApiUsageMock } from './mock/toapiUsageMock';
import type { ToApiPricingPort } from './ports/toapiPricingPort';
import type { ToApiUsagePort } from './ports/toapiUsagePort';

abstract class ToApiServices {
  abstract readonly pricing: ToApiPricingPort;
  abstract readonly usage: ToApiUsagePort;
}

class ToApiMockServices extends ToApiServices {
  readonly pricing = new ToApiPricingMock();
  readonly usage = new ToApiUsageMock();
}

class ToApiHttpServices extends ToApiServices {
  readonly pricing = new ToApiPricingHttpAdapter();
  readonly usage = new ToApiUsageHttpAdapter();
}

const services: ToApiServices = isMockMode ? new ToApiMockServices() : new ToApiHttpServices();

export function getToApiPricingPort(): ToApiPricingPort {
  return services.pricing;
}

export function getToApiUsagePort(): ToApiUsagePort {
  return services.usage;
}
