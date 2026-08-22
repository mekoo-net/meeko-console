import { ApiKeyHttpAdapter } from '@/shared/api/adapters/apikeyAdapter';
import { isMockMode } from '@/shared/runtime';

import { ApiKeyMock } from './mock/apikeyMock';
import type { ApiKeyPort } from './ports/apikeyPort';

abstract class ApiKeyServices {
  abstract readonly keys: ApiKeyPort;
}

class ApiKeyMockServices extends ApiKeyServices {
  readonly keys = new ApiKeyMock();
}

class ApiKeyHttpServices extends ApiKeyServices {
  readonly keys = new ApiKeyHttpAdapter();
}

const services: ApiKeyServices = isMockMode ? new ApiKeyMockServices() : new ApiKeyHttpServices();

export function getApiKeyPort(): ApiKeyPort {
  return services.keys;
}
