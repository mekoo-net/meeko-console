import { isMockMode } from '@/shared/runtime';

import { YomiCatalogMock } from './mock/yomiCatalogMock';
import { YomiLogsMock } from './mock/yomiLogsMock';
import { YomiModelMock } from './mock/yomiModelMock';
import { YomiVendorRouteMock } from './mock/yomiVendorRouteMock';
import { YomiRateMock } from './mock/yomiRateMock';
import { YomiProviderMock } from './mock/yomiProviderMock';
import { YomiBackendMock } from './mock/yomiBackendMock';
import { YomiRateLimitMock } from './mock/yomiRateLimitMock';
import { YomiPricingMock } from './mock/yomiPricingMock';
import { YomiPricingHttpAdapter } from '@/features/yomi/api/adapters/yomiPricingAdapter';
import { YomiBackendHttpAdapter } from '@/features/yomi/api/adapters/yomiBackendAdapter';
import { YomiRateLimitHttpAdapter } from '@/features/yomi/api/adapters/yomiRateLimitAdapter';
import { YomiCatalogHttpAdapter } from '@/features/yomi/api/adapters/yomiCatalogAdapter';
import { YomiVendorRouteHttpAdapter } from '@/features/yomi/api/adapters/yomiVendorRouteAdapter';
import { YomiProviderHttpAdapter } from '@/features/yomi/api/adapters/yomiProviderAdapter';
import { YomiModelHttpAdapter } from '@/features/yomi/api/adapters/yomiModelAdapter';
import { YomiRateHttpAdapter } from '@/features/yomi/api/adapters/yomiRateAdapter';
import { YomiLogsHttpAdapter } from '@/features/yomi/api/adapters/yomiLogsAdapter';
import type { YomiCatalogPort } from './ports/yomiCatalogPort';
import type { YomiLogsPort } from './ports/yomiLogsPort';
import type { YomiModelPort } from './ports/yomiModelPort';
import type { YomiVendorRoutePort } from './ports/yomiVendorRoutePort';
import type { YomiRatePort } from './ports/yomiRatePort';
import type { YomiProviderPort } from './ports/yomiProviderPort';
import type { YomiBackendPort } from './ports/yomiBackendPort';
import type { YomiRateLimitPort } from './ports/yomiRateLimitPort';
import type { YomiPricingPort } from './ports/yomiPricingPort';

/**
 * yomi 域端口工厂。
 *
 * - catalog / vendorRoutes：新架构（网关渠道只读 + 别名运营）
 * - rate：每条路由的有效价（直读 / 手工写）；pricing：有效价上游的价格表 / 倍率
 * - providers / models：旧端口，日志与过渡兼容保留
 */
abstract class YomiServices {
  abstract readonly catalog: YomiCatalogPort;
  abstract readonly vendorRoutes: YomiVendorRoutePort;
  abstract readonly providers: YomiProviderPort;
  abstract readonly models: YomiModelPort;
  abstract readonly rate: YomiRatePort;
  abstract readonly pricing: YomiPricingPort;
  abstract readonly logs: YomiLogsPort;
  abstract readonly backend: YomiBackendPort;
  abstract readonly rateLimit: YomiRateLimitPort;
}

class YomiMockServices extends YomiServices {
  readonly catalog = new YomiCatalogMock();
  readonly vendorRoutes = new YomiVendorRouteMock();
  readonly providers = new YomiProviderMock();
  readonly models = new YomiModelMock();
  readonly rate = new YomiRateMock();
  readonly pricing = new YomiPricingMock();
  readonly logs = new YomiLogsMock();
  readonly backend = new YomiBackendMock();
  readonly rateLimit = new YomiRateLimitMock();
}

class YomiHttpServices extends YomiServices {
  readonly catalog = new YomiCatalogHttpAdapter();
  readonly vendorRoutes = new YomiVendorRouteHttpAdapter();
  readonly providers = new YomiProviderHttpAdapter();
  readonly models = new YomiModelHttpAdapter();
  readonly rate = new YomiRateHttpAdapter();
  readonly pricing = new YomiPricingHttpAdapter();
  readonly logs = new YomiLogsHttpAdapter();
  readonly backend = new YomiBackendHttpAdapter();
  readonly rateLimit = new YomiRateLimitHttpAdapter();
}

const services: YomiServices = isMockMode ? new YomiMockServices() : new YomiHttpServices();

export function getYomiCatalogPort(): YomiCatalogPort {
  return services.catalog;
}

export function getYomiVendorRoutePort(): YomiVendorRoutePort {
  return services.vendorRoutes;
}

export function getYomiProviderPort(): YomiProviderPort {
  return services.providers;
}

export function getYomiModelPort(): YomiModelPort {
  return services.models;
}

export function getYomiRatePort(): YomiRatePort {
  return services.rate;
}

export function getYomiPricingPort(): YomiPricingPort {
  return services.pricing;
}

export function getYomiLogsPort(): YomiLogsPort {
  return services.logs;
}

export function getYomiBackendPort(): YomiBackendPort {
  return services.backend;
}

export function getYomiRateLimitPort(): YomiRateLimitPort {
  return services.rateLimit;
}
