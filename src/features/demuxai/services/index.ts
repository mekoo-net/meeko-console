import { isMockMode } from '@/shared/runtime';

import { DemuxaiCatalogMock } from './mock/demuxaiCatalogMock';
import { DemuxaiLogsMock } from './mock/demuxaiLogsMock';
import { DemuxaiRedemptionMock } from './mock/demuxaiRedemptionMock';
import { DemuxaiModelMock } from './mock/demuxaiModelMock';
import { DemuxaiModelRouteMock } from './mock/demuxaiModelRouteMock';
import { DemuxaiPricingMock } from './mock/demuxaiPricingMock';
import { DemuxaiProviderMock } from './mock/demuxaiProviderMock';
import { DemuxaiCatalogHttpAdapter } from '@/shared/api/adapters/demuxaiCatalogAdapter';
import { DemuxaiModelRouteHttpAdapter } from '@/shared/api/adapters/demuxaiModelRouteAdapter';
import { DemuxaiProviderHttpAdapter } from '@/shared/api/adapters/demuxaiProviderAdapter';
import { DemuxaiModelHttpAdapter } from '@/shared/api/adapters/demuxaiModelAdapter';
import { DemuxaiPricingHttpAdapter } from '@/shared/api/adapters/demuxaiPricingAdapter';
import { DemuxaiLogsHttpAdapter } from '@/shared/api/adapters/demuxaiLogsAdapter';
import { DemuxaiRedemptionHttpAdapter } from '@/shared/api/adapters/demuxaiRedemptionAdapter';
import type { DemuxaiCatalogPort } from './ports/demuxaiCatalogPort';
import type { DemuxaiLogsPort } from './ports/demuxaiLogsPort';
import type { DemuxaiModelPort } from './ports/demuxaiModelPort';
import type { DemuxaiModelRoutePort } from './ports/demuxaiModelRoutePort';
import type { DemuxaiPricingPort } from './ports/demuxaiPricingPort';
import type { DemuxaiProviderPort } from './ports/demuxaiProviderPort';
import type { DemuxaiRedemptionPort } from './ports/demuxaiRedemptionPort';

/**
 * demuxai 域端口工厂。
 *
 * - catalog / modelRoutes：新架构（网关渠道只读 + 别名运营）
 * - redemption：激活码（CDK 充值，兑换后走 Billing 入账）
 * - providers / models：旧端口，日志与过渡兼容保留
 */
abstract class DemuxaiServices {
  abstract readonly catalog: DemuxaiCatalogPort;
  abstract readonly modelRoutes: DemuxaiModelRoutePort;
  abstract readonly redemption: DemuxaiRedemptionPort;
  abstract readonly providers: DemuxaiProviderPort;
  abstract readonly models: DemuxaiModelPort;
  abstract readonly pricing: DemuxaiPricingPort;
  abstract readonly logs: DemuxaiLogsPort;
}

class DemuxaiMockServices extends DemuxaiServices {
  readonly catalog = new DemuxaiCatalogMock();
  readonly modelRoutes = new DemuxaiModelRouteMock();
  readonly redemption = new DemuxaiRedemptionMock();
  readonly providers = new DemuxaiProviderMock();
  readonly models = new DemuxaiModelMock();
  readonly pricing = new DemuxaiPricingMock();
  readonly logs = new DemuxaiLogsMock();
}

class DemuxaiHttpServices extends DemuxaiServices {
  readonly catalog = new DemuxaiCatalogHttpAdapter();
  readonly modelRoutes = new DemuxaiModelRouteHttpAdapter();
  readonly redemption = new DemuxaiRedemptionHttpAdapter();
  readonly providers = new DemuxaiProviderHttpAdapter();
  readonly models = new DemuxaiModelHttpAdapter();
  readonly pricing = new DemuxaiPricingHttpAdapter();
  readonly logs = new DemuxaiLogsHttpAdapter();
}

const services: DemuxaiServices = isMockMode ? new DemuxaiMockServices() : new DemuxaiHttpServices();

export function getDemuxaiCatalogPort(): DemuxaiCatalogPort {
  return services.catalog;
}

export function getDemuxaiModelRoutePort(): DemuxaiModelRoutePort {
  return services.modelRoutes;
}

export function getDemuxaiRedemptionPort(): DemuxaiRedemptionPort {
  return services.redemption;
}

export function getDemuxaiProviderPort(): DemuxaiProviderPort {
  return services.providers;
}

export function getDemuxaiModelPort(): DemuxaiModelPort {
  return services.models;
}

export function getDemuxaiPricingPort(): DemuxaiPricingPort {
  return services.pricing;
}

export function getDemuxaiLogsPort(): DemuxaiLogsPort {
  return services.logs;
}
