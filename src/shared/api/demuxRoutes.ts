/**
 * Demux API 路由分域（与后端拆分对齐）。
 *
 * - Gateway — Demux.Gateway Api 端口（8201），base：VITE_DEMUX_API_BASE
 * - Platform — Meeko.Demux 控制面，经 Meeko.Gateway 前缀 /demux，base：VITE_API_BASE
 */

/** Demux.Gateway 业务 REST（路径 `/api/*`、`/pg/*`）。 */
export const demuxGatewayPaths = {
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

/** Meeko.Demux 平台控制面（路径 `/demux/api/*`）。 */
export const demuxPlatformPaths = {
  adminProviders: '/demux/api/admin/providers',
  adminModels: '/demux/api/admin/models',
  adminPricing: '/demux/api/admin/pricing',
  adminVendorModel: '/demux/api/admin/vendor/model',
  adminRoutes: '/demux/api/admin/routes',
  adminLogs: '/demux/api/admin/logs',
  adminBackends: '/demux/api/admin/backends',
  redemption: '/demux/api/redemption',
  publicPricing: '/demux/api/pricing',
} as const;
