import { DemuxaiLogsMock } from './mock/demuxaiLogsMock';
import { DemuxaiModelMock } from './mock/demuxaiModelMock';
import { DemuxaiPricingMock } from './mock/demuxaiPricingMock';
import { DemuxaiProviderMock } from './mock/demuxaiProviderMock';
import type { DemuxaiLogsPort } from './ports/demuxaiLogsPort';
import type { DemuxaiModelPort } from './ports/demuxaiModelPort';
import type { DemuxaiPricingPort } from './ports/demuxaiPricingPort';
import type { DemuxaiProviderPort } from './ports/demuxaiProviderPort';

/**
 * demuxai 域端口工厂。
 *
 * 4 个端口对应 2 个微服务：
 *  - Provider / Model / Pricing → 控制面 demuxai-admin
 *  - Logs → 数据面 demuxai-logs（ClickHouse / ES 网关）
 *
 * 真接 BFF 时新增：
 *  - services/bff/httpProviderAdapter.ts
 *  - services/bff/httpModelAdapter.ts
 *  - services/bff/httpPricingAdapter.ts
 *  - services/bff/httpLogsAdapter.ts
 * 然后在下面对应 `getXxxPort()` 工厂里按 env 注册。视图与 composable 不变。
 */

let cachedProvider: DemuxaiProviderPort | null = null;
let cachedModel: DemuxaiModelPort | null = null;
let cachedPricing: DemuxaiPricingPort | null = null;
let cachedLogs: DemuxaiLogsPort | null = null;

function shouldUseMock(): boolean {
  const raw = import.meta.env?.VITE_USE_MOCK;
  if (typeof raw === 'string') return raw.toLowerCase() !== 'false';
  return true;
}

export function getDemuxaiProviderPort(): DemuxaiProviderPort {
  if (cachedProvider !== null) return cachedProvider;
  if (shouldUseMock()) {
    cachedProvider = new DemuxaiProviderMock();
    return cachedProvider;
  }
  throw new Error(
    'HttpDemuxaiProviderAdapter 尚未实现：请创建 services/bff/httpProviderAdapter.ts 并接入 demuxai-admin。',
  );
}

export function getDemuxaiModelPort(): DemuxaiModelPort {
  if (cachedModel !== null) return cachedModel;
  if (shouldUseMock()) {
    cachedModel = new DemuxaiModelMock();
    return cachedModel;
  }
  throw new Error('HttpDemuxaiModelAdapter 尚未实现。');
}

export function getDemuxaiPricingPort(): DemuxaiPricingPort {
  if (cachedPricing !== null) return cachedPricing;
  if (shouldUseMock()) {
    cachedPricing = new DemuxaiPricingMock();
    return cachedPricing;
  }
  throw new Error('HttpDemuxaiPricingAdapter 尚未实现。');
}

export function getDemuxaiLogsPort(): DemuxaiLogsPort {
  if (cachedLogs !== null) return cachedLogs;
  if (shouldUseMock()) {
    cachedLogs = new DemuxaiLogsMock();
    return cachedLogs;
  }
  throw new Error('HttpDemuxaiLogsAdapter 尚未实现。');
}
