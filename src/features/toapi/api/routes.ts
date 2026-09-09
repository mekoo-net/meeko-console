/**
 * Meeko.ToApi 控制面 REST 路径（Controller `[Route("toapi/api/...")]`，Gateway 不 StripPrefix）。
 */
export const toapiPaths = {
  pricingGroups: '/toapi/api/pricing/groups',
  /** 供应商发现 / 接入：`/discovery` 读运行时侧 Consul KV，`/import` 建组 + 记录已接入模型。 */
  pricingVendors: '/toapi/api/pricing/vendors',
  pricingRates: '/toapi/api/pricing/rates',
  pricingModels: '/toapi/api/pricing/models',
  /** 调用日志（usage_reservations 读模型）。 */
  usageLogs: '/toapi/api/usage/logs',
  usageStats: '/toapi/api/usage/stats',
} as const;
