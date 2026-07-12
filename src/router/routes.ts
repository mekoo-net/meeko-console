import type { RouteRecordRaw } from 'vue-router';

import type { AppRole } from '@/stores/auth';

declare module 'vue-router' {
  interface RouteMeta {
    title: string;
    requiresAuth?: boolean;
    /** 命中的权限码（任一即可）；优先于 roles。 */
    permissions?: ReadonlyArray<string>;
    /** 命中的角色集合（任一即可）；缺省表示已登录任意角色都行。 */
    roles?: ReadonlyArray<AppRole>;
  }
}

export const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/features/auth/views/LoginView.vue'),
    meta: { title: '登录', requiresAuth: false },
  },
  {
    path: '/',
    component: () => import('@/shared/ui/AppLayout.vue'),
    redirect: '/accounts',
    meta: { title: 'Meeko 管理后台', requiresAuth: true },
    children: [
      {
        path: 'accounts',
        name: 'accounts',
        component: () => import('@/features/accounts/views/AccountListView.vue'),
        meta: { title: '账户列表', requiresAuth: true },
      },
      {
        path: 'referral/withdrawals',
        redirect: { name: 'billing-withdrawals' },
      },
      {
        path: 'billing',
        component: () => import('@/features/billing/views/BillingLayout.vue'),
        redirect: { name: 'billing-recharges' },
        meta: { title: '财务管理', requiresAuth: true },
        children: [
          {
            path: 'recharges',
            name: 'billing-recharges',
            component: () => import('@/features/billing/views/RechargeListView.vue'),
            meta: { title: '充值记录', requiresAuth: true },
          },
          {
            path: 'bills',
            name: 'billing-bills',
            component: () => import('@/features/billing/views/BillListView.vue'),
            meta: { title: '账单流水', requiresAuth: true },
          },
          {
            path: 'withdrawals',
            name: 'billing-withdrawals',
            component: () => import('@/features/referral/views/ReferralWithdrawalListView.vue'),
            meta: { title: '提现审核', requiresAuth: true },
          },
          {
            path: 'channels',
            name: 'billing-channels',
            component: () => import('@/features/billing/views/PaymentChannelsView.vue'),
            meta: { title: '充值渠道', requiresAuth: true, roles: ['Admin'] },
          },
          {
            path: 'products',
            name: 'billing-products',
            component: () => import('@/features/products/views/ProductListView.vue'),
            meta: { title: '计费产品', requiresAuth: true, roles: ['Admin'] },
          },
          {
            path: 'vouchers',
            name: 'billing-vouchers',
            component: () => import('@/features/vouchers/views/VoucherTemplateListView.vue'),
            meta: { title: '券务生成', requiresAuth: true, roles: ['Admin'] },
          },
          {
            path: 'voucher-activities',
            name: 'billing-voucher-activities',
            component: () => import('@/features/vouchers/views/VoucherActivityListView.vue'),
            meta: { title: '领券活动', requiresAuth: true, roles: ['Admin'] },
          },
          {
            path: 'voucher-grants',
            name: 'billing-voucher-grants',
            component: () => import('@/features/vouchers/views/VoucherGrantRuleListView.vue'),
            meta: { title: '自动发券', requiresAuth: true, roles: ['Admin'] },
          },
          {
            path: 'voucher-codes',
            redirect: { name: 'billing-voucher-activities' },
          },
          {
            path: 'user-vouchers',
            redirect: { name: 'billing-vouchers' },
          },
          {
            path: 'redemption',
            redirect: { name: 'demuxai-redemption' },
          },
        ],
      },
      {
        path: 'demuxai',
        component: () => import('@/features/demuxai/views/DemuxaiLayout.vue'),
        redirect: { name: 'demuxai-overview' },
        meta: { title: 'DemuxAI 管理', requiresAuth: true, roles: ['Admin'] },
        children: [
          {
            path: 'overview',
            name: 'demuxai-overview',
            component: () => import('@/features/demuxai/views/OverviewView.vue'),
            meta: { title: '概览', requiresAuth: true, roles: ['Admin'] },
          },
          {
            path: 'providers',
            name: 'demuxai-providers',
            component: () => import('@/features/demuxai/views/ProviderGroupListView.vue'),
            meta: { title: '供应商组', requiresAuth: true, roles: ['Admin'] },
          },
          {
            path: 'catalog/import',
            redirect: { name: 'demuxai-providers' },
          },
          {
            path: 'model-routes',
            redirect: { name: 'demuxai-providers' },
          },
          {
            path: 'channels',
            redirect: { name: 'demuxai-providers' },
          },
          {
            path: 'models',
            redirect: { name: 'demuxai-providers' },
          },
          {
            path: 'pricing',
            name: 'demuxai-pricing',
            component: () => import('@/features/demuxai/views/PricingView.vue'),
            meta: { title: '模型定价', requiresAuth: true, roles: ['Admin'] },
          },
          {
            path: 'logs',
            name: 'demuxai-logs',
            component: () => import('@/features/demuxai/views/LogQueryView.vue'),
            meta: { title: '调用日志', requiresAuth: true, roles: ['Admin'] },
          },
          {
            path: 'redemption',
            name: 'demuxai-redemption',
            component: () => import('@/features/demuxai/views/RedemptionCodesView.vue'),
            meta: { title: '激活码', requiresAuth: true, roles: ['Admin'] },
          },
          {
            path: 'settings',
            redirect: { name: 'demuxai-settings-rate' },
          },
          {
            path: 'settings/rate',
            component: () => import('@/features/demuxai/views/RateSettingsLayout.vue'),
            meta: { title: '速率设置', requiresAuth: true, roles: ['Admin'] },
            children: [
              {
                path: '',
                name: 'demuxai-settings-rate',
                component: () => import('@/features/demuxai/views/RateSwitchesView.vue'),
                meta: { title: '速率设置', requiresAuth: true, roles: ['Admin'] },
              },
              {
                path: 'accounts',
                name: 'demuxai-settings-rate-accounts',
                component: () => import('@/features/demuxai/views/RateAccountSettingsView.vue'),
                meta: { title: '账户限速', requiresAuth: true, roles: ['Admin'] },
              },
              {
                path: 'ip',
                name: 'demuxai-settings-rate-ip',
                component: () => import('@/features/demuxai/views/RateIpSettingsView.vue'),
                meta: { title: 'IP 限速', requiresAuth: true, roles: ['Admin'] },
              },
            ],
          },
        ],
      },
      {
        path: 'settings',
        component: () => import('@/features/settings/views/SettingsLayout.vue'),
        redirect: { name: 'settings-auth' },
        meta: { title: '系统设置', requiresAuth: true },
        children: [
          {
            path: 'auth',
            name: 'settings-auth',
            component: () => import('@/features/settings/views/AuthSettingsView.vue'),
            meta: { title: '注册与登录', requiresAuth: true, permissions: ['platform.settings.read'] },
          },
          {
            path: 'email',
            name: 'settings-email',
            component: () => import('@/features/settings/views/EmailSettingsView.vue'),
            meta: { title: '邮箱策略', requiresAuth: true, permissions: ['platform.settings.read'] },
          },
          {
            path: 'referral',
            name: 'settings-referral',
            component: () => import('@/features/settings/views/ReferralSettingsView.vue'),
            meta: { title: '返利设置', requiresAuth: true, permissions: ['platform.settings.read'] },
          },
          {
            path: 'notifications',
            name: 'settings-notifications',
            component: () => import('@/features/settings/views/SettingsPlaceholderView.vue'),
            props: {
              title: '通知渠道设置即将上线',
              description: 'SMTP / 短信等渠道仍在「通知中心」维护；此处将来用于选择平台默认通知渠道。',
            },
            meta: { title: '通知渠道', requiresAuth: true, permissions: ['platform.settings.read'] },
          },
          {
            path: 'ai',
            name: 'settings-ai',
            component: () => import('@/features/settings/views/SettingsPlaceholderView.vue'),
            props: {
              title: 'AI 平台设置即将上线',
              description: 'DemuxAI 等平台级策略将在此统一配置，与渠道、定价等运营功能分离。',
            },
            meta: { title: 'AI 平台', requiresAuth: true, permissions: ['platform.settings.read'] },
          },
          {
            path: 'storage',
            name: 'settings-storage',
            component: () => import('@/features/storage/views/StorageBackendsView.vue'),
            meta: { title: '存储设置', requiresAuth: true, permissions: ['storage.backend.read'] },
          },
          {
            path: 'staff',
            name: 'settings-staff',
            component: () => import('@/features/staff/views/StaffListView.vue'),
            meta: {
              title: '管理账户',
              requiresAuth: true,
              permissions: ['platform.staff.read'],
            },
          },
          {
            path: 'roles',
            name: 'settings-roles',
            component: () => import('@/features/staff/views/RoleListView.vue'),
            meta: {
              title: '角色权限',
              requiresAuth: true,
              permissions: ['platform.role.read'],
            },
          },
        ],
      },
      {
        path: 'notices',
        component: () => import('@/features/notices/views/NoticesLayout.vue'),
        redirect: { name: 'notice-email-channels' },
        meta: { title: '通知中心', requiresAuth: true, roles: ['Admin'] },
        children: [
          {
            path: 'email/channels',
            name: 'notice-email-channels',
            component: () => import('@/features/notices/views/ChannelsView.vue'),
            meta: { title: '邮件渠道', requiresAuth: true, roles: ['Admin'] },
          },
          {
            path: 'email/templates',
            name: 'notice-templates',
            component: () => import('@/features/notices/views/EmailTemplateListView.vue'),
            meta: { title: '邮件模板', requiresAuth: true, roles: ['Admin'] },
          },
          {
            path: 'email/templates/:code/:locale',
            name: 'notice-template-edit',
            component: () => import('@/features/notices/views/EmailTemplateEditView.vue'),
            props: true,
            meta: { title: '编辑模板', requiresAuth: true, roles: ['Admin'] },
          },
          {
            path: 'debug',
            name: 'notice-debug',
            component: () => import('@/features/notices/views/NotificationsDebugView.vue'),
            meta: { title: '通知调试', requiresAuth: true, roles: ['Admin'] },
          },
        ],
      },
    ],
  },
  {
    path: '/accounts/:uid',
    component: () => import('@/features/accounts/views/AccountLayout.vue'),
    props: true,
    redirect: (to) => `/accounts/${to.params.uid}/overview`,
    meta: { title: '账户详情', requiresAuth: true },
    children: [
      {
        path: 'overview',
        name: 'account-detail',
        component: () => import('@/features/accounts/views/sections/OverviewSection.vue'),
        meta: { title: '账户概览', requiresAuth: true },
      },
      {
        path: 'business',
        name: 'account-business',
        component: () => import('@/features/accounts/views/sections/BusinessSection.vue'),
        meta: { title: '账户业务', requiresAuth: true },
      },
      {
        path: 'billing',
        component: () => import('@/features/accounts/views/sections/BillingSection.vue'),
        redirect: (to) => `/accounts/${to.params.uid}/billing/recharges`,
        meta: { title: '账户账单', requiresAuth: true },
        children: [
          {
            path: 'recharges',
            name: 'account-billing',
            component: () =>
              import('@/features/accounts/views/sections/billing/BillingRechargesSection.vue'),
            meta: { title: '充值记录', requiresAuth: true },
          },
          {
            path: 'bills',
            name: 'account-billing-bills',
            component: () =>
              import('@/features/accounts/views/sections/billing/BillingBillsSection.vue'),
            meta: { title: '账单流水', requiresAuth: true },
          },
          {
            path: 'vouchers',
            name: 'account-billing-vouchers',
            component: () =>
              import('@/features/accounts/views/sections/billing/BillingVouchersSection.vue'),
            meta: { title: '代金券', requiresAuth: true },
          },
        ],
      },
      {
        path: 'referral',
        component: () => import('@/features/accounts/views/sections/ReferralSection.vue'),
        redirect: (to) => `/accounts/${to.params.uid}/referral/invitees`,
        meta: { title: '返利', requiresAuth: true },
        children: [
          {
            path: 'invitees',
            name: 'account-referral',
            component: () =>
              import('@/features/accounts/views/sections/referral/ReferralInviteesSection.vue'),
            meta: { title: '邀请列表', requiresAuth: true },
          },
          {
            path: 'rebates',
            name: 'account-referral-rebates',
            component: () =>
              import('@/features/accounts/views/sections/referral/ReferralRebatesSection.vue'),
            meta: { title: '返利流水', requiresAuth: true },
          },
          {
            path: 'withdrawals',
            name: 'account-referral-withdrawals',
            component: () =>
              import('@/features/accounts/views/sections/referral/ReferralWithdrawalsSection.vue'),
            meta: { title: '提现记录', requiresAuth: true },
          },
        ],
      },
      {
        path: 'achievements',
        name: 'account-achievements',
        component: () => import('@/features/accounts/views/sections/AchievementsSection.vue'),
        meta: { title: '账户徽章', requiresAuth: true },
      },
      {
        path: 'iam',
        name: 'account-iam',
        component: () => import('@/features/accounts/views/sections/IamSection.vue'),
        meta: { title: 'IAM 用户', requiresAuth: true },
      },
      {
        path: 'settings',
        name: 'account-settings',
        component: () => import('@/features/accounts/views/sections/SettingsSection.vue'),
        meta: { title: '账户设置', requiresAuth: true },
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/shared/ui/NotFoundView.vue'),
    meta: { title: '页面不存在', requiresAuth: false },
  },
];
