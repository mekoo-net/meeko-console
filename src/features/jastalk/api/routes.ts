/**
 * Meeko.Jastalk 管理面 REST 路径（Controller `[Route("jastalk/api/admin/...")]`，Gateway 不 StripPrefix）。
 */
export const jastalkPaths = {
  users: '/jastalk/api/admin/users',
  user: (accountUid: number) => `/jastalk/api/admin/users/${accountUid}`,
  blockUser: (accountUid: number) => `/jastalk/api/admin/users/${accountUid}/block`,
  unblockUser: (accountUid: number) => `/jastalk/api/admin/users/${accountUid}/unblock`,
  /** 一个账号的积分：余额 + 全部流水。 */
  pointAccount: (accountUid: number) => `/jastalk/api/admin/points/accounts/${accountUid}`,
  adjustPoints: (accountUid: number) => `/jastalk/api/admin/points/accounts/${accountUid}/adjust`,
  /** 模型目录；改完版本号加一，网关几秒内拉到新的。 */
  catalogModels: '/jastalk/api/admin/catalog/models',
  catalogModel: (id: number) => `/jastalk/api/admin/catalog/models/${id}`,
  catalogRates: '/jastalk/api/admin/catalog/rates',
  catalogRate: (id: number) => `/jastalk/api/admin/catalog/rates/${id}`,
  usageLogs: '/jastalk/api/admin/usage-logs',
  /** 给 Jastalk.Gateway 签发调业务用的凭据。 */
  backends: '/jastalk/api/admin/backends',
} as const;
