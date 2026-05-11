import { z } from 'zod';

/**
 * 与 IamUserEndpoints / IamUserInfo 对齐：
 * - 角色字段是字符串（Owner / Admin / Member 等）；
 * - status："active" / "disabled" / "locked"。
 */
export const iamUserStatusValues = ['active', 'disabled', 'locked'] as const;
export type IamUserStatus = (typeof iamUserStatusValues)[number];

export const iamUserRoleValues = ['Owner', 'Admin', 'Member'] as const;
export type IamUserRole = (typeof iamUserRoleValues)[number];

export const iamUserSchema = z.object({
  uid: z.string().min(1),
  accountUid: z.string().min(1),
  username: z.string(),
  email: z.string().email().nullable().optional(),
  displayName: z.string(),
  role: z.string(),
  isAccountOwner: z.boolean(),
  status: z.enum(iamUserStatusValues),
});

export type IamUser = z.infer<typeof iamUserSchema>;

export interface CreateIamUserInput {
  username: string;
  email?: string;
  displayName: string;
  password: string;
  roleName: IamUserRole;
}

export const iamUserStatusLabel: Readonly<Record<IamUserStatus, string>> = {
  active: '正常',
  disabled: '已停用',
  locked: '已锁定',
};

export const iamUserStatusTone: Readonly<Record<IamUserStatus, 'success' | 'info' | 'danger'>> = {
  active: 'success',
  disabled: 'info',
  locked: 'danger',
};
