/**
 * mock 模式专用的权限码样例（模拟 Keystone staff_permissions 表内容）。
 * 真实环境权限目录来自 GET /api/admin/staff/permissions，由平台 seeder 与
 * 各产品（Demux 等）启动时自注册产生；本文件仅供 StaffMock / mock 登录使用,
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
  'demux:redemption:read',
  'demux:redemption:write',
  'demux:models:read',
  'demux:models:write',
  'demux:providers:read',
  'demux:providers:write',
  'demux:pricing:read',
  'demux:pricing:write',
  'demux:routes:read',
  'demux:routes:write',
  'demux:backends:read',
  'demux:backends:write',
  'demux:usage:read',
  'demux:usage:write',
  'demux:users:read',
  'demux:users:write',
  'demux:tasks:read',
  'demux:ratelimit:read',
  'demux:ratelimit:write',
] as const;

/** 只读角色子集（mock 非 admin 用户）。 */
export const MOCK_READ_ONLY_STAFF_PERMISSIONS = MOCK_ALL_STAFF_PERMISSIONS.filter((code) =>
  code.endsWith('read'),
);
