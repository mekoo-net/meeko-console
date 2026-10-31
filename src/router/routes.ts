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
    component: () => import('@/features/platform/auth/views/LoginView.vue'),
    meta: { title: '登录', requiresAuth: false },
  },
  // 活动编辑器要整屏放代码与预览，不套 AppLayout 的侧边栏和顶栏。
  {
    path: '/yomi/activities/new',
    name: 'yomi-activity-new',
    component: () => import('@/features/yomi/views/ActivityEditorView.vue'),
    meta: { title: '新建活动', requiresAuth: true, roles: ['Admin'] },
  },
  {
    path: '/yomi/activities/:id/edit',
    name: 'yomi-activity-edit',
    component: () => import('@/features/yomi/views/ActivityEditorView.vue'),
    meta: { title: '编辑活动', requiresAuth: true, roles: ['Admin'] },
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
        component: () => import('@/features/platform/accounts/views/AccountListView.vue'),
        meta: { title: '账户列表', requiresAuth: true },
      },
      {
        path: 'accounts/:uid',
        component: () => import('@/features/platform/accounts/views/AccountLayout.vue'),
        props: true,
        redirect: (to) => `/accounts/${to.params.uid}/overview`,
        meta: { title: '账户详情', requiresAuth: true },
        children: [
          {
            path: 'overview',
            name: 'account-detail',
            component: () => import('@/features/platform/accounts/views/sections/OverviewSection.vue'),
            meta: { title: '账户概览', requiresAuth: true },
          },
          {
            path: 'billing',
            component: () => import('@/features/platform/accounts/views/sections/BillingSection.vue'),
            redirect: (to) => `/accounts/${to.params.uid}/billing/recharges`,
            meta: { title: '账户账单', requiresAuth: true },
            children: [
              {
                path: 'recharges',
                name: 'account-billing',
                component: () =>
                  import('@/features/platform/accounts/views/sections/billing/BillingRechargesSection.vue'),
                meta: { title: '充值记录', requiresAuth: true },
              },
              {
                path: 'bills',
                name: 'account-billing-bills',
                component: () =>
                  import('@/features/platform/accounts/views/sections/billing/BillingBillsSection.vue'),
                meta: { title: '账单流水', requiresAuth: true },
              },
              {
                path: 'vouchers',
                name: 'account-billing-vouchers',
                component: () =>
                  import('@/features/platform/accounts/views/sections/billing/BillingVouchersSection.vue'),
                meta: { title: '代金券', requiresAuth: true },
              },
            ],
          },
          {
            path: 'referral',
            component: () => import('@/features/platform/accounts/views/sections/ReferralSection.vue'),
            redirect: (to) => `/accounts/${to.params.uid}/referral/invitees`,
            meta: { title: '返利', requiresAuth: true },
            children: [
              {
                path: 'invitees',
                name: 'account-referral',
                component: () =>
                  import('@/features/platform/accounts/views/sections/referral/ReferralInviteesSection.vue'),
                meta: { title: '邀请列表', requiresAuth: true },
              },
              {
                path: 'rebates',
                name: 'account-referral-rebates',
                component: () =>
                  import('@/features/platform/accounts/views/sections/referral/ReferralRebatesSection.vue'),
                meta: { title: '返利流水', requiresAuth: true },
              },
              {
                path: 'withdrawals',
                name: 'account-referral-withdrawals',
                component: () =>
                  import('@/features/platform/accounts/views/sections/referral/ReferralWithdrawalsSection.vue'),
                meta: { title: '提现记录', requiresAuth: true },
              },
            ],
          },
          {
            path: 'achievements',
            name: 'account-achievements',
            component: () => import('@/features/platform/accounts/views/sections/AchievementsSection.vue'),
            meta: { title: '账户徽章', requiresAuth: true },
          },
          {
            path: 'iam',
            name: 'account-iam',
            component: () => import('@/features/platform/accounts/views/sections/IamSection.vue'),
            meta: { title: 'IAM 用户', requiresAuth: true },
          },
          {
            path: 'settings',
            name: 'account-settings',
            component: () => import('@/features/platform/accounts/views/sections/SettingsSection.vue'),
            meta: { title: '账户设置', requiresAuth: true },
          },
        ],
      },
      {
        path: 'referral/withdrawals',
        redirect: { name: 'billing-withdrawals' },
      },
      {
        path: 'billing',
        component: () => import('@/features/platform/billing/views/BillingLayout.vue'),
        redirect: { name: 'billing-recharges' },
        meta: { title: '财务管理', requiresAuth: true },
        children: [
          {
            path: 'recharges',
            name: 'billing-recharges',
            component: () => import('@/features/platform/billing/views/RechargeListView.vue'),
            meta: { title: '充值记录', requiresAuth: true },
          },
          {
            path: 'bills',
            name: 'billing-bills',
            component: () => import('@/features/platform/billing/views/BillListView.vue'),
            meta: { title: '账单流水', requiresAuth: true },
          },
          {
            path: 'withdrawals',
            name: 'billing-withdrawals',
            component: () => import('@/features/platform/referral/views/ReferralWithdrawalListView.vue'),
            meta: { title: '提现审核', requiresAuth: true },
          },
          {
            path: 'channels',
            name: 'billing-channels',
            component: () => import('@/features/platform/billing/views/PaymentChannelsView.vue'),
            meta: { title: '充值渠道', requiresAuth: true, roles: ['Admin'] },
          },
          {
            path: 'products',
            name: 'billing-products',
            component: () => import('@/features/platform/products/views/ProductListView.vue'),
            meta: { title: '计费产品', requiresAuth: true, roles: ['Admin'] },
          },
          {
            path: 'vouchers',
            name: 'billing-vouchers',
            component: () => import('@/features/platform/vouchers/views/VoucherTemplateListView.vue'),
            meta: { title: '券务生成', requiresAuth: true, roles: ['Admin'] },
          },
          {
            path: 'voucher-activities',
            name: 'billing-voucher-activities',
            component: () => import('@/features/platform/vouchers/views/VoucherActivityListView.vue'),
            meta: { title: '领券活动', requiresAuth: true, roles: ['Admin'] },
          },
          {
            path: 'voucher-grants',
            name: 'billing-voucher-grants',
            component: () => import('@/features/platform/vouchers/views/VoucherGrantRuleListView.vue'),
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
            // 兑换码 = 充值渠道「兑换码」的卡密管理，像券务一样拆成独立页面；旧链接都指向这个名字。
            path: 'redemption',
            name: 'billing-redemption',
            redirect: { name: 'billing-redemption-batches' },
          },
          {
            path: 'redemption/batches',
            name: 'billing-redemption-batches',
            component: () => import('@/features/platform/redemption/views/RedemptionBatchesView.vue'),
            meta: { title: '兑换码批次', requiresAuth: true, roles: ['Admin'] },
          },
          {
            path: 'redemption/codes',
            name: 'billing-redemption-codes',
            component: () => import('@/features/platform/redemption/views/RedemptionCodesView.vue'),
            meta: { title: '兑换记录', requiresAuth: true, roles: ['Admin'] },
          },
          {
            path: 'redemption/attempts',
            name: 'billing-redemption-attempts',
            component: () => import('@/features/platform/redemption/views/RedemptionAttemptsView.vue'),
            meta: { title: '兑换日志', requiresAuth: true, roles: ['Admin'] },
          },
        ],
      },
      {
        path: 'yomi',
        component: () => import('@/features/yomi/views/YomiLayout.vue'),
        redirect: { name: 'yomi-overview' },
        meta: { title: 'Yomi 管理', requiresAuth: true, roles: ['Admin'] },
        children: [
          {
            path: 'overview',
            name: 'yomi-overview',
            component: () => import('@/features/yomi/views/OverviewView.vue'),
            meta: { title: '概览', requiresAuth: true, roles: ['Admin'] },
          },
          {
            path: 'report',
            name: 'yomi-report',
            component: () => import('@/features/yomi/views/ConsumptionReportView.vue'),
            meta: { title: '报表', requiresAuth: true, roles: ['Admin'] },
          },
          {
            path: 'vendors',
            name: 'yomi-vendors',
            component: () => import('@/features/yomi/views/ProviderGroupListView.vue'),
            meta: { title: '供应商组', requiresAuth: true, roles: ['Admin'] },
          },
          {
            path: 'providers',
            redirect: { name: 'yomi-vendors' },
          },
          {
            path: 'catalog/import',
            redirect: { name: 'yomi-vendors' },
          },
          {
            path: 'model-routes',
            redirect: { name: 'yomi-vendors' },
          },
          {
            path: 'channels',
            redirect: { name: 'yomi-vendors' },
          },
          {
            path: 'models',
            redirect: { name: 'yomi-vendors' },
          },
          {
            path: 'pricing',
            name: 'yomi-pricing',
            component: () => import('@/features/yomi/views/ModelPriceView.vue'),
            meta: { title: '价格表', requiresAuth: true, roles: ['Admin'] },
          },
          {
            path: 'rate',
            name: 'yomi-rate',
            component: () => import('@/features/yomi/views/RateView.vue'),
            meta: { title: '模型定价', requiresAuth: true, roles: ['Admin'] },
          },
          {
            path: 'logs',
            name: 'yomi-logs',
            component: () => import('@/features/yomi/views/LogQueryView.vue'),
            meta: { title: '调用日志', requiresAuth: true, roles: ['Admin'] },
          },
          {
            path: 'activities',
            name: 'yomi-activities',
            component: () => import('@/features/yomi/views/ActivityListView.vue'),
            meta: { title: '活动中心', requiresAuth: true, roles: ['Admin'] },
          },
          {
            path: 'activities/:id/claims',
            name: 'yomi-activity-claims',
            component: () => import('@/features/yomi/views/ActivityClaimsView.vue'),
            meta: { title: '领取记录', requiresAuth: true, roles: ['Admin'] },
          },
          {
            path: 'backends',
            redirect: { name: 'settings-gateway-issue' },
          },
          {
            path: 'redemption',
            redirect: { name: 'billing-redemption' },
          },
          {
            path: 'settings',
            redirect: { name: 'yomi-settings-rate' },
          },
          {
            path: 'settings/issue',
            redirect: { name: 'settings-gateway-issue' },
          },
          {
            path: 'settings/credentials',
            redirect: { name: 'settings-gateway-credentials' },
          },
          {
            path: 'settings/rate',
            component: () => import('@/features/yomi/views/RateSettingsLayout.vue'),
            meta: { title: '速率设置', requiresAuth: true, roles: ['Admin'] },
            children: [
              {
                path: '',
                name: 'yomi-settings-rate',
                component: () => import('@/features/yomi/views/RateSwitchesView.vue'),
                meta: { title: '速率设置', requiresAuth: true, roles: ['Admin'] },
              },
              {
                path: 'accounts',
                name: 'yomi-settings-rate-accounts',
                component: () => import('@/features/yomi/views/RateAccountSettingsView.vue'),
                meta: { title: '账户限速', requiresAuth: true, roles: ['Admin'] },
              },
              {
                path: 'ip',
                name: 'yomi-settings-rate-ip',
                component: () => import('@/features/yomi/views/RateIpSettingsView.vue'),
                meta: { title: 'IP 限速', requiresAuth: true, roles: ['Admin'] },
              },
            ],
          },
        ],
      },
      // 改名前的地址（Demux、更早的 DemuxAI），留着让旧书签和外部链接还能打开。
      {
        path: 'demux',
        redirect: { name: 'yomi-overview' },
      },
      {
        path: 'demux/:pathMatch(.*)+',
        redirect: (to) => `/yomi/${String(to.params.pathMatch)}`,
      },
      {
        path: 'demuxai',
        redirect: { name: 'yomi-overview' },
      },
      {
        path: 'demuxai/:pathMatch(.*)+',
        redirect: (to) => `/yomi/${String(to.params.pathMatch)}`,
      },
      {
        path: 'tavern',
        component: () => import('@/features/tavern/views/TavernLayout.vue'),
        redirect: { name: 'tavern-overview' },
        meta: { title: 'Tavern 管理', requiresAuth: true, roles: ['Admin'] },
        children: [
          {
            path: 'overview',
            name: 'tavern-overview',
            component: () => import('@/features/tavern/views/OverviewView.vue'),
            meta: { title: '概览', requiresAuth: true, roles: ['Admin'] },
          },
          {
            path: 'worlds',
            name: 'tavern-worlds',
            component: () => import('@/features/tavern/views/TavernWorldsView.vue'),
            meta: { title: '世界', requiresAuth: true, roles: ['Admin'] },
          },
          {
            // 挂在 /tavern/worlds 下面，侧边菜单按前缀高亮「世界」。UID 只认数字，页面拿到的就是数。
            path: 'worlds/:accountUid(\\d+)/:worldId',
            name: 'tavern-world-detail',
            component: () => import('@/features/tavern/views/TavernWorldDetailView.vue'),
            props: (route) => ({ accountUid: Number(route.params.accountUid), worldId: route.params.worldId }),
            meta: { title: '世界详情', requiresAuth: true, roles: ['Admin'] },
          },
          {
            path: 'personas',
            name: 'tavern-personas',
            component: () => import('@/features/tavern/views/TavernPersonasView.vue'),
            meta: { title: '角色卡', requiresAuth: true, roles: ['Admin'] },
          },
          {
            path: 'pipeline',
            name: 'tavern-pipeline',
            component: () => import('@/features/tavern/views/LlmSettingsView.vue'),
            meta: { title: '管线设置', requiresAuth: true, roles: ['Admin'] },
          },
          {
            path: 'logs',
            name: 'tavern-logs',
            component: () => import('@/features/tavern/views/TavernCallLogsView.vue'),
            meta: { title: '调用日志', requiresAuth: true, roles: ['Admin'] },
          },
          {
            path: 'credit-rates',
            name: 'tavern-credit-rates',
            component: () => import('@/features/tavern/views/TavernCreditRatesView.vue'),
            meta: { title: '积分价目', requiresAuth: true, roles: ['Admin'] },
          },
          {
            path: 'credit-packs',
            name: 'tavern-credit-packs',
            component: () => import('@/features/tavern/views/TavernCreditPacksView.vue'),
            meta: { title: '积分包', requiresAuth: true, roles: ['Admin'] },
          },
          {
            path: 'credit-accounts',
            name: 'tavern-credit-accounts',
            component: () => import('@/features/tavern/views/TavernCreditAccountsView.vue'),
            meta: { title: '积分账户', requiresAuth: true, roles: ['Admin'] },
          },
          {
            path: 'backends',
            redirect: { name: 'settings-gateway-issue' },
          },
        ],
      },
      {
        path: 'toapi',
        component: () => import('@/features/toapi/views/ToApiLayout.vue'),
        redirect: { name: 'toapi-groups' },
        meta: { title: 'ToApi 管理', requiresAuth: true, roles: ['Admin'] },
        children: [
          {
            path: 'groups',
            name: 'toapi-groups',
            component: () => import('@/features/toapi/views/SupplyGroupsView.vue'),
            meta: { title: '渠道分组', requiresAuth: true, roles: ['Admin'] },
          },
          {
            path: 'rates',
            name: 'toapi-rates',
            component: () => import('@/features/toapi/views/ModelRatesView.vue'),
            meta: { title: '模型定价', requiresAuth: true, roles: ['Admin'] },
          },
          {
            path: 'logs',
            name: 'toapi-logs',
            component: () => import('@/features/toapi/views/UsageLogsView.vue'),
            meta: { title: '调用日志', requiresAuth: true, roles: ['Admin'] },
          },
          {
            path: 'redemption',
            redirect: { name: 'billing-redemption' },
          },
        ],
      },
      {
        path: 'storage',
        component: () => import('@/features/platform/storage/views/StorageLayout.vue'),
        redirect: { name: 'storage-overview' },
        meta: { title: '存储管理', requiresAuth: true, permissions: ['storage.backend.read'] },
        children: [
          {
            path: 'overview',
            name: 'storage-overview',
            component: () => import('@/features/platform/storage/views/StorageOverviewView.vue'),
            meta: { title: '存储概览', requiresAuth: true, permissions: ['storage.backend.read'] },
          },
          {
            path: 'browser',
            name: 'storage-browser',
            component: () => import('@/features/platform/storage/views/StorageBrowserView.vue'),
            meta: { title: '文件浏览', requiresAuth: true, permissions: ['storage.backend.read'] },
          },
          {
            path: 'contents',
            name: 'storage-contents',
            component: () => import('@/features/platform/storage/views/StorageContentsView.vue'),
            meta: { title: '对象检索', requiresAuth: true, permissions: ['storage.backend.read'] },
          },
          {
            path: 'backends',
            name: 'storage-backends',
            component: () => import('@/features/platform/storage/views/StorageBackendsView.vue'),
            meta: { title: '存储后端', requiresAuth: true, permissions: ['storage.backend.read'] },
          },
        ],
      },
      {
        path: 'settings',
        component: () => import('@/features/platform/settings/views/SettingsLayout.vue'),
        redirect: { name: 'settings-auth' },
        meta: { title: '系统设置', requiresAuth: true },
        children: [
          {
            path: 'auth',
            name: 'settings-auth',
            component: () => import('@/features/platform/settings/views/AuthSettingsView.vue'),
            meta: { title: '注册与登录', requiresAuth: true, permissions: ['platform.settings.read'] },
          },
          {
            path: 'email',
            name: 'settings-email',
            component: () => import('@/features/platform/settings/views/EmailSettingsView.vue'),
            meta: { title: '邮箱策略', requiresAuth: true, permissions: ['platform.settings.read'] },
          },
          {
            path: 'referral',
            name: 'settings-referral',
            component: () => import('@/features/platform/settings/views/ReferralSettingsView.vue'),
            meta: { title: '返利设置', requiresAuth: true, permissions: ['platform.settings.read'] },
          },
          {
            path: 'notifications',
            name: 'settings-notifications',
            component: () => import('@/features/platform/settings/views/SettingsPlaceholderView.vue'),
            props: {
              title: '通知渠道设置即将上线',
              description: 'SMTP / 短信等渠道仍在「通知中心」维护；此处将来用于选择平台默认通知渠道。',
            },
            meta: { title: '通知渠道', requiresAuth: true, permissions: ['platform.settings.read'] },
          },
          {
            path: 'ai',
            name: 'settings-ai',
            component: () => import('@/features/platform/settings/views/SettingsPlaceholderView.vue'),
            props: {
              title: 'AI 平台设置即将上线',
              description: 'Yomi 等平台级策略将在此统一配置，与渠道、定价等运营功能分离。',
            },
            meta: { title: 'AI 平台', requiresAuth: true, permissions: ['platform.settings.read'] },
          },
          {
            path: 'storage',
            redirect: { name: 'storage-overview' },
          },
          {
            path: 'storage/overview',
            redirect: { name: 'storage-overview' },
          },
          {
            path: 'storage/contents',
            redirect: { name: 'storage-contents' },
          },
          {
            path: 'storage/backends',
            redirect: { name: 'storage-backends' },
          },
          {
            path: 'staff',
            name: 'settings-staff',
            component: () => import('@/features/platform/staff/views/StaffListView.vue'),
            meta: {
              title: '管理账户',
              requiresAuth: true,
              permissions: ['platform.staff.read'],
            },
          },
          {
            path: 'roles',
            name: 'settings-roles',
            component: () => import('@/features/platform/staff/views/RoleListView.vue'),
            meta: {
              title: '角色权限',
              requiresAuth: true,
              permissions: ['platform.role.read'],
            },
          },
          {
            path: 'apikeys',
            name: 'settings-apikeys',
            component: () => import('@/features/platform/apikeys/views/ApiKeyListView.vue'),
            meta: {
              title: '平台令牌',
              requiresAuth: true,
              permissions: ['platform.apikey.read'],
            },
          },
          {
            path: 'gateway',
            redirect: { name: 'settings-gateway-issue' },
          },
          {
            path: 'gateway/issue',
            name: 'settings-gateway-issue',
            component: () => import('@/features/platform/gateway/views/GatewayCredentialIssueView.vue'),
            meta: { title: '签发凭据', requiresAuth: true, roles: ['Admin'] },
          },
          {
            path: 'gateway/credentials',
            name: 'settings-gateway-credentials',
            component: () => import('@/features/platform/gateway/views/GatewayCredentialListView.vue'),
            meta: { title: '凭据列表', requiresAuth: true, roles: ['Admin'] },
          },
        ],
      },
      {
        path: 'notices',
        component: () => import('@/features/platform/notices/views/NoticesLayout.vue'),
        redirect: { name: 'notice-email-channels' },
        meta: { title: '通知中心', requiresAuth: true, roles: ['Admin'] },
        children: [
          {
            path: 'email/channels',
            name: 'notice-email-channels',
            component: () => import('@/features/platform/notices/views/ChannelsView.vue'),
            meta: { title: '邮件渠道', requiresAuth: true, roles: ['Admin'] },
          },
          {
            path: 'email/templates',
            name: 'notice-templates',
            component: () => import('@/features/platform/notices/views/EmailTemplateListView.vue'),
            meta: { title: '邮件模板', requiresAuth: true, roles: ['Admin'] },
          },
          {
            path: 'email/templates/:code/:locale',
            name: 'notice-template-edit',
            component: () => import('@/features/platform/notices/views/EmailTemplateEditView.vue'),
            props: true,
            meta: { title: '编辑模板', requiresAuth: true, roles: ['Admin'] },
          },
          {
            path: 'debug',
            name: 'notice-debug',
            component: () => import('@/features/platform/notices/views/NotificationsDebugView.vue'),
            meta: { title: '通知调试', requiresAuth: true, roles: ['Admin'] },
          },
        ],
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
