/**
 * mock 模式专用的权限码样例（模拟 Keystone staff_permissions 表内容）。
 * 真实环境权限目录来自 GET /api/admin/staff/permissions，由平台 seeder 与
 * 各产品（Yomi 等）启动时自注册产生；本文件仅供 StaffMock / mock 登录使用,
 * 业务代码禁止引用。
 */
export const MOCK_ALL_STAFF_PERMISSIONS = [
  'platform.read',
  'platform.staff.read',
  'platform.staff.write',
  'platform.role.read',
  'platform.role.write',
  'platform.settings.read',
  'platform.settings.write',
  'platform.apikey.read',
  'platform.apikey.write',
  'notice.template.read',
  'notice.template.write',
  'notice.channel.read',
  'notice.channel.write',
  'billing.recharge.read',
  'billing.recharge.write',
  'billing.bill.read',
  'billing.bill.write',
  'billing.channel.read',
  'billing.channel.write',
  'billing.voucher.read',
  'billing.voucher.write',
  'account.admin.read',
  'account.admin.write',
  'storage.backend.read',
  'storage.backend.write',
  'yomi:redemption:read',
  'yomi:redemption:write',
  'yomi:models:read',
  'yomi:models:write',
  'yomi:providers:read',
  'yomi:providers:write',
  'yomi:rate:read',
  'yomi:rate:write',
  'yomi:routes:read',
  'yomi:routes:write',
  'yomi:backends:read',
  'yomi:backends:write',
  'yomi:usage:read',
  'yomi:usage:write',
  'yomi:users:read',
  'yomi:users:write',
  'yomi:tasks:read',
  'yomi:ratelimit:read',
  'yomi:ratelimit:write',
] as const;

/** 只读角色子集（mock 非 admin 用户）。 */
export const MOCK_READ_ONLY_STAFF_PERMISSIONS = MOCK_ALL_STAFF_PERMISSIONS.filter((code) =>
  code.endsWith('read'),
);
