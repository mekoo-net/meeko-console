export interface SettingsSection {
  path: string;
  name: string;
  title: string;
  description: string;
  disabled?: boolean;
  badge?: string;
}

/** 系统设置页内左侧导航；新增分组在此扩展即可。 */
export const settingsSections: readonly SettingsSection[] = [
  {
    path: 'auth',
    name: 'settings-auth',
    title: '注册与登录',
    description: '控制用户注册入口与登录方式',
  },
  {
    path: 'email',
    name: 'settings-email',
    title: '邮箱策略',
    description: '邮箱后缀白名单与验证码',
  },
  {
    path: 'notifications',
    name: 'settings-notifications',
    title: '通知渠道',
    description: '选择平台默认通知渠道',
    disabled: true,
    badge: '即将支持',
  },
  {
    path: 'ai',
    name: 'settings-ai',
    title: 'AI 平台',
    description: 'DemuxAI 等平台级策略',
    disabled: true,
    badge: '即将支持',
  },
];
