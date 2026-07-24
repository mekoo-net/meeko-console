import { z } from 'zod';

import { iamUserRoleValues } from './iamUser.types';

/** 与 CreateIamUserHandler 校验一致：username/displayName/password 必填，email 可选。 */
export const createIamUserSchema = z.object({
  username: z
    .string()
    .min(2, '用户名至少 2 个字符')
    .max(64, '用户名最长 64 个字符')
    .regex(/^[A-Za-z0-9._-]+$/, '仅允许字母、数字、下划线、横线、点'),
  email: z.union([z.literal(''), z.string().email('邮箱格式不正确')]).optional(),
  displayName: z.string().min(1, '请输入显示名').max(64, '显示名最长 64 个字符'),
  password: z
    .string()
    .min(8, '密码至少 8 位')
    .max(128, '密码最长 128 位')
    .regex(/[A-Za-z]/, '密码需包含字母')
    .regex(/\d/, '密码需包含数字'),
  roleName: z.enum(iamUserRoleValues, '角色无效'),
});

export type CreateIamUserPayload = z.infer<typeof createIamUserSchema>;
