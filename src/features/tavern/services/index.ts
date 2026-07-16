import { isMockMode } from '@/shared/runtime';
import { TavernBackendHttpAdapter } from '@/shared/api/adapters/tavernBackendAdapter';

import { TavernBackendMock } from './mock/tavernBackendMock';
import type { TavernBackendPort } from './ports/tavernBackendPort';

abstract class TavernServices {
  abstract readonly backend: TavernBackendPort;
}

class TavernMockServices extends TavernServices {
  readonly backend = new TavernBackendMock();
}

class TavernHttpServices extends TavernServices {
  readonly backend = new TavernBackendHttpAdapter();
}

const services: TavernServices = isMockMode ? new TavernMockServices() : new TavernHttpServices();

export function getTavernBackendPort(): TavernBackendPort {
  return services.backend;
}
