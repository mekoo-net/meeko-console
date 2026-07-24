import { isMockMode } from '@/shared/runtime';

import { DemuxCatalogMock } from './mock/demuxCatalogMock';
import { DemuxLogsMock } from './mock/demuxLogsMock';
import { DemuxRedemptionMock } from './mock/demuxRedemptionMock';
import { DemuxModelMock } from './mock/demuxModelMock';
import { DemuxModelRouteMock } from './mock/demuxModelRouteMock';
import { DemuxPricingMock } from './mock/demuxPricingMock';
import { DemuxProviderMock } from './mock/demuxProviderMock';
import { DemuxBackendMock } from './mock/demuxBackendMock';
import { DemuxRateLimitMock } from './mock/demuxRateLimitMock';
import { DemuxBackendHttpAdapter } from '@/features/demux/api/adapters/demuxBackendAdapter';
import { DemuxRateLimitHttpAdapter } from '@/features/demux/api/adapters/demuxRateLimitAdapter';
import { DemuxCatalogHttpAdapter } from '@/features/demux/api/adapters/demuxCatalogAdapter';
import { DemuxModelRouteHttpAdapter } from '@/features/demux/api/adapters/demuxModelRouteAdapter';
import { DemuxProviderHttpAdapter } from '@/features/demux/api/adapters/demuxProviderAdapter';
import { DemuxModelHttpAdapter } from '@/features/demux/api/adapters/demuxModelAdapter';
import { DemuxPricingHttpAdapter } from '@/features/demux/api/adapters/demuxPricingAdapter';
import { DemuxLogsHttpAdapter } from '@/features/demux/api/adapters/demuxLogsAdapter';
import { DemuxRedemptionHttpAdapter } from '@/features/demux/api/adapters/demuxRedemptionAdapter';
import type { DemuxCatalogPort } from './ports/demuxCatalogPort';
import type { DemuxLogsPort } from './ports/demuxLogsPort';
import type { DemuxModelPort } from './ports/demuxModelPort';
import type { DemuxModelRoutePort } from './ports/demuxModelRoutePort';
import type { DemuxPricingPort } from './ports/demuxPricingPort';
import type { DemuxProviderPort } from './ports/demuxProviderPort';
import type { DemuxRedemptionPort } from './ports/demuxRedemptionPort';
import type { DemuxBackendPort } from './ports/demuxBackendPort';
import type { DemuxRateLimitPort } from './ports/demuxRateLimitPort';

/**
 * demuxai 域端口工厂。
 *
 * - catalog / modelRoutes：新架构（网关渠道只读 + 别名运营）
 * - redemption：激活码（CDK 充值，兑换后走 Billing 入账）
 * - providers / models：旧端口，日志与过渡兼容保留
 */
abstract class DemuxServices {
  abstract readonly catalog: DemuxCatalogPort;
  abstract readonly modelRoutes: DemuxModelRoutePort;
  abstract readonly redemption: DemuxRedemptionPort;
  abstract readonly providers: DemuxProviderPort;
  abstract readonly models: DemuxModelPort;
  abstract readonly pricing: DemuxPricingPort;
  abstract readonly logs: DemuxLogsPort;
  abstract readonly backend: DemuxBackendPort;
  abstract readonly rateLimit: DemuxRateLimitPort;
}

class DemuxMockServices extends DemuxServices {
  readonly catalog = new DemuxCatalogMock();
  readonly modelRoutes = new DemuxModelRouteMock();
  readonly redemption = new DemuxRedemptionMock();
  readonly providers = new DemuxProviderMock();
  readonly models = new DemuxModelMock();
  readonly pricing = new DemuxPricingMock();
  readonly logs = new DemuxLogsMock();
  readonly backend = new DemuxBackendMock();
  readonly rateLimit = new DemuxRateLimitMock();
}

class DemuxHttpServices extends DemuxServices {
  readonly catalog = new DemuxCatalogHttpAdapter();
  readonly modelRoutes = new DemuxModelRouteHttpAdapter();
  readonly redemption = new DemuxRedemptionHttpAdapter();
  readonly providers = new DemuxProviderHttpAdapter();
  readonly models = new DemuxModelHttpAdapter();
  readonly pricing = new DemuxPricingHttpAdapter();
  readonly logs = new DemuxLogsHttpAdapter();
  readonly backend = new DemuxBackendHttpAdapter();
  readonly rateLimit = new DemuxRateLimitHttpAdapter();
}

const services: DemuxServices = isMockMode ? new DemuxMockServices() : new DemuxHttpServices();

export function getDemuxCatalogPort(): DemuxCatalogPort {
  return services.catalog;
}

export function getDemuxModelRoutePort(): DemuxModelRoutePort {
  return services.modelRoutes;
}

export function getDemuxRedemptionPort(): DemuxRedemptionPort {
  return services.redemption;
}

export function getDemuxProviderPort(): DemuxProviderPort {
  return services.providers;
}

export function getDemuxModelPort(): DemuxModelPort {
  return services.models;
}

export function getDemuxPricingPort(): DemuxPricingPort {
  return services.pricing;
}

export function getDemuxLogsPort(): DemuxLogsPort {
  return services.logs;
}

export function getDemuxBackendPort(): DemuxBackendPort {
  return services.backend;
}

export function getDemuxRateLimitPort(): DemuxRateLimitPort {
  return services.rateLimit;
}
