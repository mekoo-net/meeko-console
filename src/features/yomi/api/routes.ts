/**
 * Yomi API 路由分域（与后端拆分对齐）。
 *
 * - Gateway — Yomi.Gateway（api.meeyo.org），base：VITE_YOMI_API_BASE
 * - Platform — Meeko.Yomi 控制面，经 Meeko.Gateway 前缀 /yomi，base：VITE_API_BASE
 */

/** Yomi.Gateway 业务 REST（路径 `/api/*`、`/pg/*`）。 */
export const yomiGatewayPaths = {
  /** Staff 管理：速率限制（console 使用） */
  adminRateLimitSetting: '/api/admin/rate/setting',
  /** Account JWT：sk- 令牌 CRUD */
  token: '/api/token',
  tokenUsage: '/api/usage/token',
  logConversations: '/api/log/conversations',
  dataSelf: '/api/data',
  providerGroups: '/api/providers/groups',
  pg: '/pg',
} as const;

/** Meeko.Yomi 平台控制面（路径 `/yomi/api/*`）。 */
export const yomiPlatformPaths = {
  adminProviders: '/yomi/api/admin/providers',
  adminModels: '/yomi/api/admin/models',
  adminRate: '/yomi/api/admin/rate',
  adminVendorModel: '/yomi/api/admin/vendor/model',
  /** 价格表 / 倍率 / 编译 / 拉价 */
  adminPricing: '/yomi/api/admin/pricing',
  adminRoutes: '/yomi/api/admin/routes',
  adminLogs: '/yomi/api/admin/logs',
  adminBackends: '/yomi/api/admin/backends',
  publicRate: '/yomi/api/rate',
} as const;
