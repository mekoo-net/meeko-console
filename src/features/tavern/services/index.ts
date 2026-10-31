import { isMockMode } from '@/shared/runtime';
import { TavernBackendHttpAdapter } from '@/features/tavern/api/adapters/tavernBackendAdapter';
import { TavernBillingHttpAdapter } from '@/features/tavern/api/adapters/tavernBillingAdapter';
import { TavernCallLogHttpAdapter } from '@/features/tavern/api/adapters/tavernCallLogAdapter';
import { TavernLlmSettingsHttpAdapter } from '@/features/tavern/api/adapters/tavernLlmSettingsAdapter';
import { TavernCreditsHttpAdapter } from '@/features/tavern/api/adapters/tavernCreditsAdapter';
import { TavernUsageStatsHttpAdapter } from '@/features/tavern/api/adapters/tavernUsageStatsAdapter';

import { TavernBackendMock } from './mock/tavernBackendMock';
import { TavernBillingMock } from './mock/tavernBillingMock';
import { TavernCallLogMock } from './mock/tavernCallLogMock';
import { TavernLlmSettingsMock } from './mock/tavernLlmSettingsMock';
import { TavernCreditsMock } from './mock/tavernCreditsMock';
import { TavernUsageStatsMock } from './mock/tavernUsageStatsMock';
import type { TavernBackendPort } from './ports/tavernBackendPort';
import type { TavernBillingPort } from './ports/tavernBillingPort';
import type { TavernCallLogPort } from './ports/tavernCallLogPort';
import type { TavernLlmSettingsPort } from './ports/tavernLlmSettingsPort';
import type { TavernCreditsPort } from './ports/tavernCreditsPort';
import type { TavernUsageStatsPort } from './ports/tavernUsageStatsPort';

abstract class TavernServices {
  abstract readonly backend: TavernBackendPort;
  abstract readonly llmSettings: TavernLlmSettingsPort;
  abstract readonly usageStats: TavernUsageStatsPort;
  abstract readonly callLogs: TavernCallLogPort;
  abstract readonly billing: TavernBillingPort;
  abstract readonly credits: TavernCreditsPort;
}

class TavernMockServices extends TavernServices {
  readonly backend = new TavernBackendMock();
  readonly llmSettings = new TavernLlmSettingsMock();
  readonly usageStats = new TavernUsageStatsMock();
  readonly callLogs = new TavernCallLogMock();
  readonly billing = new TavernBillingMock();
  readonly credits = new TavernCreditsMock();
}

class TavernHttpServices extends TavernServices {
  readonly backend = new TavernBackendHttpAdapter();
  readonly llmSettings = new TavernLlmSettingsHttpAdapter();
  readonly usageStats = new TavernUsageStatsHttpAdapter();
  readonly callLogs = new TavernCallLogHttpAdapter();
  readonly billing = new TavernBillingHttpAdapter();
  readonly credits = new TavernCreditsHttpAdapter();
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

export function getTavernCallLogPort(): TavernCallLogPort {
  return services.callLogs;
}

export function getTavernBillingPort(): TavernBillingPort {
  return services.billing;
}

export function getTavernCreditsPort(): TavernCreditsPort {
  return services.credits;
}
