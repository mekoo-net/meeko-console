import { z } from 'zod';

/** 与 Keystone StaffPermissions 对齐的权限码全集（mock SuperAdmin 用）。 */
export const ALL_STAFF_PERMISSIONS = [
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
  'account.admin.read',
  'account.admin.write',
] as const;

/** 只读角色子集（mock 非 admin 用户）。 */
export const READ_ONLY_STAFF_PERMISSIONS = [
  'platform.read',
  'platform.staff.read',
  'platform.role.read',
  'platform.settings.read',
  'notice.template.read',
  'notice.channel.read',
  'billing.recharge.read',
  'billing.bill.read',
  'billing.channel.read',
  'account.admin.read',
] as const;

export type StaffPermissionCode = (typeof ALL_STAFF_PERMISSIONS)[number];

export const staffUserSchema = z.object({
  uid: z.string(),
  username: z.string(),
  email: z.string(),
  displayName: z.string(),
  roleId: z.string(),
  roleName: z.string(),
  status: z.enum(['Active', 'Disabled']),
  lastLoginAtUtc: z.string().nullable().optional(),
  lastLoginIp: z.string().nullable().optional(),
  createdAtUtc: z.string(),
  updatedAtUtc: z.string(),
});

export type StaffUser = z.infer<typeof staffUserSchema>;

export const staffRoleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  isSystem: z.boolean(),
  permissionCodes: z.array(z.string()),
  memberCount: z.number(),
  createdAtUtc: z.string(),
});

export type StaffRole = z.infer<typeof staffRoleSchema>;

export const permissionCatalogItemSchema = z.object({
  id: z.string(),
  code: z.string(),
  description: z.string().nullable().optional(),
});

export type PermissionCatalogItem = z.infer<typeof permissionCatalogItemSchema>;

export interface StaffListFilter {
  keyword: string;
  status: 'all' | 'Active' | 'Disabled';
  roleId: string;
}

export const defaultStaffListFilter = (): StaffListFilter => ({
  keyword: '',
  status: 'all',
  roleId: '',
});

/** 权限分组与中文标签（角色编辑页勾选）。 */
export interface PermissionGroup {
  key: string;
  title: string;
  items: Array<{ code: string; label: string }>;
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    key: 'platform',
    title: '平台',
    items: [
      { code: 'platform.read', label: '平台概览' },
      { code: 'platform.staff.read', label: '查看管理员' },
      { code: 'platform.staff.write', label: '管理管理员' },
      { code: 'platform.role.read', label: '查看角色' },
      { code: 'platform.role.write', label: '管理角色' },
      { code: 'platform.settings.read', label: '查看系统设置' },
      { code: 'platform.settings.write', label: '修改系统设置' },
    ],
  },
  {
    key: 'notice',
    title: '通知',
    items: [
      { code: 'notice.template.read', label: '查看邮件模板' },
      { code: 'notice.template.write', label: '编辑邮件模板' },
      { code: 'notice.channel.read', label: '查看通知渠道' },
      { code: 'notice.channel.write', label: '编辑通知渠道' },
    ],
  },
  {
    key: 'billing',
    title: '账单',
    items: [
      { code: 'billing.recharge.read', label: '查看充值记录' },
      { code: 'billing.recharge.write', label: '管理充值' },
      { code: 'billing.bill.read', label: '查看账单流水' },
      { code: 'billing.bill.write', label: '管理账单' },
      { code: 'billing.channel.read', label: '查看充值渠道' },
      { code: 'billing.channel.write', label: '管理充值渠道' },
    ],
  },
  {
    key: 'account',
    title: '账户',
    items: [
      { code: 'account.admin.read', label: '查看账户' },
      { code: 'account.admin.write', label: '管理账户' },
    ],
  },
];

export function permissionLabel(code: string): string {
  for (const g of PERMISSION_GROUPS) {
    const hit = g.items.find((i) => i.code === code);
    if (hit) return hit.label;
  }
  return code;
}

export function staffStatusLabel(status: StaffUser['status']): string {
  return status === 'Active' ? '正常' : '已停用';
}
