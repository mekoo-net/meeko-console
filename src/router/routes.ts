import type { RouteRecordRaw } from 'vue-router';

import type { AppRole } from '@/stores/auth';

declare module 'vue-router' {
  interface RouteMeta {
    title: string;
    requiresAuth?: boolean;
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
        path: 'accounts/:uid',
        name: 'account-detail',
        component: () => import('@/features/accounts/views/AccountDetailView.vue'),
        props: true,
        meta: { title: '账户详情', requiresAuth: true },
      },
      {
        path: 'billing',
        component: () => import('@/features/billing/views/BillingLayout.vue'),
        redirect: { name: 'billing-recharges' },
        meta: { title: '账单管理', requiresAuth: true },
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
            path: 'channels',
            name: 'billing-channels',
            component: () => import('@/features/billing/views/PaymentChannelsView.vue'),
            meta: { title: '充值渠道', requiresAuth: true, roles: ['Admin'] },
          },
        ],
      },
      {
        path: 'demuxai',
        component: () => import('@/features/demuxai/views/DemuxaiLayout.vue'),
        redirect: { name: 'demuxai-models' },
        meta: { title: 'DemuxAI 管理', requiresAuth: true, roles: ['Admin'] },
        children: [
          {
            path: 'providers',
            name: 'demuxai-providers',
            component: () => import('@/features/demuxai/views/ProviderListView.vue'),
            meta: { title: '供应商', requiresAuth: true, roles: ['Admin'] },
          },
          {
            path: 'models',
            name: 'demuxai-models',
            component: () => import('@/features/demuxai/views/ModelListView.vue'),
            meta: { title: '模型列表', requiresAuth: true, roles: ['Admin'] },
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
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/shared/ui/NotFoundView.vue'),
    meta: { title: '页面不存在', requiresAuth: false },
  },
];
