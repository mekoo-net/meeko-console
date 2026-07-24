import { isMockMode } from '@/shared/runtime';
import { TavernBackendHttpAdapter } from '@/features/tavern/api/adapters/tavernBackendAdapter';
import { TavernLlmSettingsHttpAdapter } from '@/features/tavern/api/adapters/tavernLlmSettingsAdapter';
import { TavernUsageStatsHttpAdapter } from '@/features/tavern/api/adapters/tavernUsageStatsAdapter';

import { TavernBackendMock } from './mock/tavernBackendMock';
import { TavernLlmSettingsMock } from './mock/tavernLlmSettingsMock';
import { TavernUsageStatsMock } from './mock/tavernUsageStatsMock';
import type { TavernBackendPort } from './ports/tavernBackendPort';
import type { TavernLlmSettingsPort } from './ports/tavernLlmSettingsPort';
import type { TavernUsageStatsPort } from './ports/tavernUsageStatsPort';

abstract class TavernServices {
  abstract readonly backend: TavernBackendPort;
  abstract readonly llmSettings: TavernLlmSettingsPort;
  abstract readonly usageStats: TavernUsageStatsPort;
}

class TavernMockServices extends TavernServices {
  readonly backend = new TavernBackendMock();
  readonly llmSettings = new TavernLlmSettingsMock();
  readonly usageStats = new TavernUsageStatsMock();
}

class TavernHttpServices extends TavernServices {
  readonly backend = new TavernBackendHttpAdapter();
  readonly llmSettings = new TavernLlmSettingsHttpAdapter();
  readonly usageStats = new TavernUsageStatsHttpAdapter();
}

const services: TavernServices = isMockMode ? new TavernMockServices() : new TavernHttpServices();

export function getTavernBackendPort(): TavernBackendPort {
  return services.backend;
}

export function getTavernLlmSettingsPort(): TavernLlmSettingsPort {
  return services.llmSettings;
}

export function getTavernUsageStatsPort(): TavernUsageStatsPort {
  return services.usageStats;
}
