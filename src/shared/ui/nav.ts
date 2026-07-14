import {
  Bell,
  ChatLineRound,
  CreditCard,
  Coin,
  DataAnalysis,
  DataLine,
  Document,
  Folder,
  Link,
  MagicStick,
  Message,
  Money,
  Operation,
  PriceTag,
  Lock,
  Discount,
  Setting,
  Ticket,
  Tickets,
  User,
} from '@element-plus/icons-vue';

import type { AppRole } from '@/stores/auth';

export interface LeafItem {
  type: 'leaf';
  index: string;
  title: string;
  icon?: unknown;
  disabled?: boolean;
  badge?: string;
  roles?: ReadonlyArray<AppRole>;
  /** 可见所需权限码（任一即可）；优先于 roles。 */
  perm?: string;
}

export interface GroupItem {
  type: 'group';
  index: string;
  title: string;
  icon?: unknown;
  roles?: ReadonlyArray<AppRole>;
  perm?: string;
  children: Array<LeafItem | GroupItem>;
}

export type MenuNode = LeafItem | GroupItem;

/** 业务视图：顶部切换器的每一项，对应一套独立的左侧菜单。 */
export interface NavView {
  id: string;
  title: string;
  icon?: unknown;
  roles?: ReadonlyArray<AppRole>;
  perm?: string;
  menu: readonly MenuNode[];
}

export const navViews: readonly NavView[] = [
  {
    id: 'account',
    title: '账户管理',
    icon: User,
    menu: [{ type: 'leaf', index: '/accounts', title: '账户列表', icon: User }],
  },
  {
    id: 'billing',
    title: '财务管理',
    icon: CreditCard,
    menu: [
      { type: 'leaf', index: '/billing/recharges', title: '充值记录', icon: Document },
      { type: 'leaf', index: '/billing/bills', title: '账单流水', icon: Money },
      { type: 'leaf', index: '/billing/withdrawals', title: '提现审核', icon: Coin },
      {
        type: 'group',
        index: '/billing/voucher',
        title: '券务管理',
        icon: Discount,
        roles: ['Admin'],
        children: [
          { type: 'leaf', index: '/billing/vouchers', title: '券务生成', icon: Discount },
          { type: 'leaf', index: '/billing/voucher-activities', title: '领券活动', icon: Ticket },
          { type: 'leaf', index: '/billing/voucher-grants', title: '自动发券', icon: MagicStick },
        ],
      },
    ],
  },
  {
    id: 'demuxai',
    title: 'DemuxAI',
    icon: MagicStick,
    roles: ['Admin'],
    menu: [
      { type: 'leaf', index: '/demuxai/overview', title: '概览', icon: DataAnalysis },
      { type: 'leaf', index: '/demuxai/redemption', title: '激活码', icon: Tickets },
      { type: 'leaf', index: '/demuxai/providers', title: '供应商组', icon: Link },
      { type: 'leaf', index: '/demuxai/pricing', title: '模型定价', icon: PriceTag },
      { type: 'leaf', index: '/demuxai/logs', title: '调用日志', icon: DataLine },
      {
        type: 'group',
        index: '/demuxai/settings',
        title: '系统设置',
        icon: Setting,
        children: [{ type: 'leaf', index: '/demuxai/settings/rate', title: '速率设置', icon: Operation }],
      },
    ],
  },
  {
    id: 'settings',
    title: '系统设置',
    icon: Setting,
    menu: [
      {
        type: 'group',
        index: '/settings/account',
        title: '账户设置',
        icon: User,
        children: [
          { type: 'leaf', index: '/settings/auth', title: '注册与登录', icon: Setting, perm: 'platform.settings.read' },
          { type: 'leaf', index: '/settings/email', title: '邮箱策略', icon: Message, perm: 'platform.settings.read' },
        ],
      },
      {
        type: 'group',
        index: '/settings/finance',
        title: '财务设置',
        icon: CreditCard,
        children: [
          { type: 'leaf', index: '/billing/products', title: '计费产品', icon: PriceTag, roles: ['Admin'] },
          { type: 'leaf', index: '/billing/channels', title: '充值渠道', icon: Link, roles: ['Admin'] },
          { type: 'leaf', index: '/settings/referral', title: '返利设置', icon: Coin, perm: 'platform.settings.read' },
        ],
      },
      {
        type: 'group',
        index: '/settings/storage',
        title: '存储设置',
        icon: Folder,
        perm: 'storage.backend.read',
        children: [
          {
            type: 'leaf',
            index: '/settings/storage/overview',
            title: '概览',
            icon: DataAnalysis,
            perm: 'storage.backend.read',
          },
          {
            type: 'leaf',
            index: '/settings/storage/backends',
            title: '存储后端',
            icon: Folder,
            perm: 'storage.backend.read',
          },
        ],
      },
      {
        type: 'group',
        index: '/settings/platform',
        title: '平台设置',
        icon: Operation,
        children: [
          { type: 'leaf', index: '/settings/staff', title: '管理账户', icon: User, perm: 'platform.staff.read' },
          { type: 'leaf', index: '/settings/roles', title: '角色权限', icon: Lock, perm: 'platform.role.read' },
        ],
      },
    ],
  },
  {
    id: 'notices',
    title: '通知中心',
    icon: Bell,
    roles: ['Admin'],
    menu: [
      {
        type: 'group',
        index: '/notices/email',
        title: '邮件通知',
        icon: Message,
        children: [
          { type: 'leaf', index: '/notices/email/channels', title: '渠道', icon: Link },
          { type: 'leaf', index: '/notices/email/templates', title: '模板', icon: Tickets },
        ],
      },
      {
        type: 'group',
        index: '/notices/sms',
        title: '短信通知',
        icon: ChatLineRound,
        children: [
          {
            type: 'leaf',
            index: '/notices/sms/channels',
            title: '渠道',
            icon: Link,
            disabled: true,
            badge: '即将支持',
          },
          {
            type: 'leaf',
            index: '/notices/sms/templates',
            title: '模板',
            icon: Tickets,
            disabled: true,
            badge: '即将支持',
          },
        ],
      },
      { type: 'leaf', index: '/notices/debug', title: '通知调试', icon: Operation },
    ],
  },
];

export type VisibilityFn = (node: { roles?: ReadonlyArray<AppRole>; perm?: string }) => boolean;

/** 递归过滤菜单树：隐藏无权限节点，并丢弃过滤后变空的分组。 */
export function filterTree(nodes: readonly MenuNode[], isVisible: VisibilityFn): MenuNode[] {
  return nodes
    .map((n) =>
      n.type === 'group' ? ({ ...n, children: filterTree(n.children, isVisible) } satisfies GroupItem) : n,
    )
    .filter((n) => (n.type === 'group' ? isVisible(n) && n.children.length > 0 : isVisible(n)));
}

/** 收集所有可点击的叶子节点（用于路由 → active 匹配）。 */
export function collectLeaves(nodes: readonly MenuNode[]): LeafItem[] {
  const out: LeafItem[] = [];
  for (const n of nodes) {
    if (n.type === 'leaf') out.push(n);
    else out.push(...collectLeaves(n.children));
  }
  return out;
}

/** 根据目标叶子 index 反推需要展开的父级 sub-menu index 列表。 */
export function collectAncestors(
  nodes: readonly MenuNode[],
  targetIndex: string,
  trail: string[] = [],
): string[] | null {
  for (const n of nodes) {
    if (n.type === 'leaf') {
      if (n.index === targetIndex) return trail;
    } else {
      const found = collectAncestors(n.children, targetIndex, [...trail, n.index]);
      if (found) return found;
    }
  }
  return null;
}

/** 在所有视图里找到与当前路径最匹配（index 最长）的视图。 */
export function matchView(path: string): NavView | null {
  let best: { view: NavView; len: number } | null = null;
  for (const view of navViews) {
    for (const leaf of collectLeaves(view.menu)) {
      if (path === leaf.index || path.startsWith(leaf.index + '/')) {
        if (!best || leaf.index.length > best.len) best = { view, len: leaf.index.length };
      }
    }
  }
  return best?.view ?? null;
}

/** 取某视图下第一个可见且可点击的叶子 index（用于切换视图时的落地页）。 */
export function firstLeafIndex(view: NavView, isVisible: VisibilityFn): string | null {
  const leaves = collectLeaves(filterTree(view.menu, isVisible));
  return leaves.find((l) => !l.disabled)?.index ?? leaves[0]?.index ?? null;
}
