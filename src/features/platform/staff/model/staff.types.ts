import { z } from 'zod';

import {
  epochMillisNullableSchema,
  epochMillisSchema,
} from '@/shared/lib/epoch';

// 注意：本模块不维护权限码全集。权限目录的唯一来源是
// GET /api/admin/staff/permissions（Keystone staff_permissions 表）；
// 各产品（Demux 等）启动时经 RegisterPermissionCatalogAsync 自注册自己的码与描述。
// mock 模式的样例全集在 services/mock/mockPermissions.ts。

export const staffUserSchema = z.object({
  uid: z.string(),
  username: z.string(),
  email: z.string(),
  displayName: z.string(),
  roleId: z.string(),
  roleName: z.string(),
  status: z.enum(['Active', 'Disabled']),
  lastLoginAtUtc: epochMillisNullableSchema.optional(),
  lastLoginIp: z.string().nullable().optional(),
  createdAtUtc: epochMillisSchema,
  updatedAtUtc: epochMillisSchema,
});

export type StaffUser = z.infer<typeof staffUserSchema>;

/** 角色明细（含完整权限码集合）：编辑抽屉/命令结果使用。 */
export const staffRoleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  isSystem: z.boolean(),
  permissionCodes: z.array(z.string()),
  memberCount: z.number(),
  createdAtUtc: epochMillisSchema,
});

export type StaffRole = z.infer<typeof staffRoleSchema>;

/** 角色列表项（只含权限数量，不下发完整权限码）：列表表格与下拉选项使用。 */
export const staffRoleListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  isSystem: z.boolean(),
  permissionCount: z.number(),
  memberCount: z.number(),
  createdAtUtc: epochMillisSchema,
});

export type StaffRoleListItem = z.infer<typeof staffRoleListItemSchema>;

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

// ---------------------------------------------------------------------------
// 权限树模型（角色编辑页）：目录来自 GET /api/admin/staff/permissions，
// 前端按码结构解析成 域 → 资源 → 操作 三级树；下面的 label 映射只负责翻译，
// 出现未知码时自动降级为按码渲染，不会丢权限。
// ---------------------------------------------------------------------------

/** 权限域（顶层节点）中文名。 */
export const PERMISSION_DOMAIN_LABELS: Record<string, string> = {
  platform: '平台管理',
  notice: '通知中心',
  billing: '计费账务',
  account: '账户管理',
  storage: '对象存储',
  demux: 'Demux AI 网关',
};

/** 权限资源（二级节点）中文名，key = `${domain}.${resource}`。 */
export const PERMISSION_RESOURCE_LABELS: Record<string, string> = {
  'platform.staff': '管理员',
  'platform.role': '角色权限',
  'platform.settings': '系统设置',
  'notice.template': '邮件模板',
  'notice.channel': '通知渠道',
  'billing.recharge': '充值记录',
  'billing.bill': '账单流水',
  'billing.channel': '充值渠道',
  'billing.voucher': '代金券',
  'account.admin': '平台账户',
  'storage.backend': '存储后端',
  'demux.redemption': '兑换码',
  'demux.models': '模型目录',
  'demux.providers': '模型通道',
  'demux.rate': '定价',
  'demux.routes': '路由',
  'demux.backends': '接入后端',
  'demux.usage': '用量日志',
  'demux.users': '用户',
  'demux.tasks': '异步任务',
  'demux.ratelimit': '限流',
};

/** 特殊码的完整中文名（无法按 资源+操作 组合出来的）。 */
export const PERMISSION_CODE_LABELS: Record<string, string> = {
  'platform.read': '平台概览',
};

const PERMISSION_ACTION_LABELS: Record<string, string> = {
  read: '查看',
  write: '管理',
};

export interface ParsedPermissionCode {
  domain: string;
  /** 资源段；域级码（如 platform.read）为 null。 */
  resource: string | null;
  action: string;
}

/** 兼容两种命名：`domain.resource.action`（平台通用）与 `domain:resource:action`（产品域）。 */
export function parsePermissionCode(code: string): ParsedPermissionCode {
  const parts = code.includes(':') ? code.split(':') : code.split('.');
  if (parts.length >= 3) {
    return {
      domain: parts[0] ?? code,
      resource: parts.slice(1, -1).join('.'),
      action: parts[parts.length - 1] ?? '',
    };
  }
  if (parts.length === 2) {
    return { domain: parts[0] ?? code, resource: null, action: parts[1] ?? '' };
  }
  return { domain: code, resource: null, action: '' };
}

export function permissionDomainLabel(domain: string): string {
  return PERMISSION_DOMAIN_LABELS[domain] ?? domain;
}

export function permissionResourceLabel(domain: string, resource: string): string {
  return PERMISSION_RESOURCE_LABELS[`${domain}.${resource}`] ?? resource;
}

/** 叶子节点标签：优先整码映射，其次 操作动词（查看/管理），兜底原始码。 */
export function permissionLabel(code: string): string {
  const exact = PERMISSION_CODE_LABELS[code];
  if (exact) return exact;
  const { domain, resource, action } = parsePermissionCode(code);
  const actionLabel = PERMISSION_ACTION_LABELS[action];
  if (!actionLabel) return code;
  if (resource === null) return `${actionLabel}${permissionDomainLabel(domain)}`;
  return `${actionLabel}${permissionResourceLabel(domain, resource)}`;
}

export interface PermissionTreeNode {
  /** 树节点唯一 key；叶子节点即权限码本身。 */
  key: string;
  label: string;
  /** 仅叶子节点有 code。 */
  code?: string;
  children?: PermissionTreeNode[];
}

const DOMAIN_ORDER = ['platform', 'account', 'billing', 'notice', 'storage', 'demux'];

function domainRank(domain: string): number {
  const idx = DOMAIN_ORDER.indexOf(domain);
  return idx === -1 ? DOMAIN_ORDER.length : idx;
}

/** buildPermissionTree 的输入：纯码，或目录接口返回的 码+描述。 */
export type PermissionTreeInput = string | { code: string; description?: string | null };

/**
 * 把权限目录组装成 域 → 资源 → 操作 三级树（JumpServer 风格授权树的数据源）。
 * 叶子标签优先用目录里产品自注册的 description，缺失时降级为本地映射/原始码；
 * 域级码（platform.read）作为域节点下的直接叶子。
 */
export function buildPermissionTree(items: readonly PermissionTreeInput[]): PermissionTreeNode[] {
  const domains = new Map<string, { direct: PermissionTreeNode[]; resources: Map<string, PermissionTreeNode[]> }>();

  for (const item of items) {
    const code = typeof item === 'string' ? item : item.code;
    const description = typeof item === 'string' ? null : item.description;
    const { domain, resource } = parsePermissionCode(code);
    let entry = domains.get(domain);
    if (!entry) {
      entry = { direct: [], resources: new Map() };
      domains.set(domain, entry);
    }
    const label = description && description !== code ? description : permissionLabel(code);
    const leaf: PermissionTreeNode = { key: code, code, label };
    if (resource === null) {
      entry.direct.push(leaf);
    } else {
      const list = entry.resources.get(resource) ?? [];
      list.push(leaf);
      entry.resources.set(resource, list);
    }
  }

  return [...domains.entries()]
    .sort((a, b) => domainRank(a[0]) - domainRank(b[0]) || a[0].localeCompare(b[0]))
    .map(([domain, entry]) => ({
      key: `domain:${domain}`,
      label: permissionDomainLabel(domain),
      children: [
        ...entry.direct,
        ...[...entry.resources.entries()].map(([resource, leaves]) => ({
          key: `resource:${domain}.${resource}`,
          label: permissionResourceLabel(domain, resource),
          children: leaves,
        })),
      ],
    }));
}

export function staffStatusLabel(status: StaffUser['status']): string {
  return status === 'Active' ? '正常' : '已停用';
}
