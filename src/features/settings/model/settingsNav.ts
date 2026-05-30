export interface SettingsSection {
  path: string;
  name: string;
  title: string;
  description: string;
  disabled?: boolean;
  badge?: string;
  /** 可见所需权限码（任一即可）；缺省表示已登录即可见。 */
  permission?: string;
}

/** 系统设置页内左侧导航；新增分组在此扩展即可。 */
export const settingsSections: readonly SettingsSection[] = [
  {
    path: 'auth',
    name: 'settings-auth',
    title: '注册与登录',
    description: '控制用户注册入口与登录方式',
    permission: 'platform.settings.read',
  },
  {
    path: 'email',
    name: 'settings-email',
    title: '邮箱策略',
    description: '邮箱后缀白名单与验证码',
    permission: 'platform.settings.read',
  },
  {
    path: 'staff',
    name: 'settings-staff',
    title: '管理员',
    description: '平台 Staff 账号与角色分配',
    permission: 'platform.staff.read',
  },
  {
    path: 'roles',
    name: 'settings-roles',
    title: '角色权限',
    description: '自定义角色与权限配置',
    permission: 'platform.role.read',
  },
  {
    path: 'notifications',
    name: 'settings-notifications',
    title: '通知渠道',
    description: '选择平台默认通知渠道',
    disabled: true,
    badge: '即将支持',
    permission: 'platform.settings.read',
  },
  {
    path: 'ai',
    name: 'settings-ai',
    title: 'AI 平台',
    description: 'DemuxAI 等平台级策略',
    disabled: true,
    badge: '即将支持',
    permission: 'platform.settings.read',
  },
];
