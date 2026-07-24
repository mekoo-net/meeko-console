import { fail, ok, type AppResult } from '@/shared/api/httpTypes';

import {
  staffRoleListItemSchema,
  staffRoleSchema,
  staffUserSchema,
  type PermissionCatalogItem,
  type StaffListFilter,
  type StaffRole,
  type StaffUser,
} from '../../model/staff.types';
import {
  MOCK_ALL_STAFF_PERMISSIONS,
  MOCK_READ_ONLY_STAFF_PERMISSIONS,
} from './mockPermissions';
import type {
  CreateRoleInput,
  CreateStaffInput,
  ListRolePage,
  ListRolesInput,
  ListStaffPage,
  StaffPort,
  UpdateRoleInput,
  UpdateStaffInput,
} from '../ports/staffPort';

const now = () => Date.now();

let nextStaffUid = 300000010;
let nextRoleId = 1003;

const roles: StaffRole[] = [
  {
    id: '1001',
    name: 'SuperAdmin',
    description: '系统内置超级管理员',
    isSystem: true,
    permissionCodes: [...MOCK_ALL_STAFF_PERMISSIONS],
    memberCount: 1,
    createdAtUtc: Date.parse('2024-01-01T00:00:00.000Z'),
  },
  {
    id: '1002',
    name: 'ReadOnly',
    description: '系统内置只读角色',
    isSystem: true,
    permissionCodes: [...MOCK_READ_ONLY_STAFF_PERMISSIONS],
    memberCount: 0,
    createdAtUtc: Date.parse('2024-01-01T00:00:00.000Z'),
  },
];

const staffUsers: StaffUser[] = [
  {
    uid: '300000001',
    username: 'admin',
    email: 'admin@meeko.io',
    displayName: '系统管理员',
    roleId: '1001',
    roleName: 'SuperAdmin',
    status: 'Active',
    lastLoginAtUtc: now(),
    lastLoginIp: '127.0.0.1',
    createdAtUtc: Date.parse('2024-01-01T00:00:00.000Z'),
    updatedAtUtc: now(),
  },
  {
    uid: '300000002',
    username: 'viewer',
    email: 'viewer@meeko.io',
    displayName: '只读用户',
    roleId: '1002',
    roleName: 'ReadOnly',
    status: 'Active',
    lastLoginAtUtc: null,
    lastLoginIp: null,
    createdAtUtc: Date.parse('2024-06-01T00:00:00.000Z'),
    updatedAtUtc: now(),
  },
];

const permissionCatalog: PermissionCatalogItem[] = MOCK_ALL_STAFF_PERMISSIONS.map((code, i) => ({
  id: String(i + 1),
  code,
  description: null,
}));

function syncRoleMemberCounts(): void {
  for (const role of roles) {
    role.memberCount = staffUsers.filter((u) => u.roleId === role.id).length;
  }
}

function findRole(id: string): StaffRole | undefined {
  return roles.find((r) => r.id === id);
}

function filterStaff(filter: StaffListFilter): StaffUser[] {
  let rows = [...staffUsers];
  const kw = filter.keyword.trim().toLowerCase();
  if (kw) {
    rows = rows.filter(
      (u) =>
        u.username.toLowerCase().includes(kw)
        || u.displayName.toLowerCase().includes(kw)
        || u.email.toLowerCase().includes(kw),
    );
  }
  if (filter.status !== 'all') {
    rows = rows.filter((u) => u.status === filter.status);
  }
  if (filter.roleId) {
    rows = rows.filter((u) => u.roleId === filter.roleId);
  }
  return rows;
}

export class StaffMock implements StaffPort {
  async listStaff(input: {
    page: number;
    pageSize: number;
    filter: StaffListFilter;
  }): Promise<AppResult<ListStaffPage>> {
    const filtered = filterStaff(input.filter);
    const start = (input.page - 1) * input.pageSize;
    const items = filtered.slice(start, start + input.pageSize).map((u) => staffUserSchema.parse(u));
    return ok({ items, total: filtered.length });
  }

  async createStaff(input: CreateStaffInput): Promise<AppResult<StaffUser>> {
    if (staffUsers.some((u) => u.username === input.username.trim())) {
      return fail({ code: 'conflict', message: '用户名已存在' });
    }
    if (staffUsers.some((u) => u.email.toLowerCase() === input.email.trim().toLowerCase())) {
      return fail({ code: 'conflict', message: '邮箱已存在' });
    }
    const role = findRole(input.roleId);
    if (!role) return fail({ code: 'validation', message: '角色不存在' });

    const user: StaffUser = {
      uid: String(nextStaffUid++),
      username: input.username.trim(),
      email: input.email.trim(),
      displayName: input.displayName.trim(),
      roleId: role.id,
      roleName: role.name,
      status: 'Active',
      lastLoginAtUtc: null,
      lastLoginIp: null,
      createdAtUtc: now(),
      updatedAtUtc: now(),
    };
    staffUsers.push(user);
    syncRoleMemberCounts();
    return ok(staffUserSchema.parse(user));
  }

  async updateStaff(uid: string, input: UpdateStaffInput): Promise<AppResult<StaffUser>> {
    const user = staffUsers.find((u) => u.uid === uid);
    if (!user) return fail({ code: 'not_found', message: '管理员不存在' });
    if (
      staffUsers.some(
        (u) => u.uid !== uid && u.email.toLowerCase() === input.email.trim().toLowerCase(),
      )
    ) {
      return fail({ code: 'conflict', message: '邮箱已存在' });
    }
    user.displayName = input.displayName.trim();
    user.email = input.email.trim();
    user.updatedAtUtc = now();
    return ok(staffUserSchema.parse(user));
  }

  async setStaffStatus(uid: string, active: boolean): Promise<AppResult<StaffUser>> {
    const user = staffUsers.find((u) => u.uid === uid);
    if (!user) return fail({ code: 'not_found', message: '管理员不存在' });
    user.status = active ? 'Active' : 'Disabled';
    user.updatedAtUtc = now();
    return ok(staffUserSchema.parse(user));
  }

  async resetStaffPassword(_uid: string, _newPassword: string): Promise<AppResult<StaffUser>> {
    const user = staffUsers.find((u) => u.uid === _uid);
    if (!user) return fail({ code: 'not_found', message: '管理员不存在' });
    user.updatedAtUtc = now();
    return ok(staffUserSchema.parse(user));
  }

  async changeStaffRole(uid: string, roleId: string): Promise<AppResult<StaffUser>> {
    const user = staffUsers.find((u) => u.uid === uid);
    if (!user) return fail({ code: 'not_found', message: '管理员不存在' });
    const role = findRole(roleId);
    if (!role) return fail({ code: 'validation', message: '角色不存在' });
    user.roleId = role.id;
    user.roleName = role.name;
    user.updatedAtUtc = now();
    syncRoleMemberCounts();
    return ok(staffUserSchema.parse(user));
  }

  async listRoles(input?: ListRolesInput): Promise<AppResult<ListRolePage>> {
    syncRoleMemberCounts();
    const page = input?.page ?? 1;
    const pageSize = input?.pageSize ?? 20;
    const kw = input?.keyword?.trim().toLowerCase() ?? '';
    let rows = [...roles];
    if (kw) {
      rows = rows.filter(
        (r) => r.name.toLowerCase().includes(kw) || (r.description ?? '').toLowerCase().includes(kw),
      );
    }
    const start = (page - 1) * pageSize;
    const items = rows.slice(start, start + pageSize).map((r) =>
      staffRoleListItemSchema.parse({
        id: r.id,
        name: r.name,
        description: r.description ?? null,
        isSystem: r.isSystem,
        permissionCount: r.permissionCodes.length,
        memberCount: r.memberCount,
        createdAtUtc: r.createdAtUtc,
      }),
    );
    return ok({ items, total: rows.length });
  }

  async getRole(id: string): Promise<AppResult<StaffRole>> {
    const role = roles.find((r) => r.id === id);
    if (!role) return fail({ code: 'not_found', message: '角色不存在' });
    return ok(staffRoleSchema.parse(role));
  }

  async createRole(input: CreateRoleInput): Promise<AppResult<StaffRole>> {
    if (roles.some((r) => r.name === input.name.trim())) {
      return fail({ code: 'conflict', message: '角色名已存在' });
    }
    const role: StaffRole = {
      id: String(nextRoleId++),
      name: input.name.trim(),
      description: input.description?.trim() ?? null,
      isSystem: false,
      permissionCodes: [...input.permissionCodes],
      memberCount: 0,
      createdAtUtc: now(),
    };
    roles.push(role);
    return ok(staffRoleSchema.parse(role));
  }

  async updateRole(id: string, input: UpdateRoleInput): Promise<AppResult<StaffRole>> {
    const role = roles.find((r) => r.id === id);
    if (!role) return fail({ code: 'not_found', message: '角色不存在' });
    if (role.isSystem && input.permissionCodes.join() !== role.permissionCodes.join()) {
      return fail({ code: 'forbidden', message: '系统内置角色不可修改权限' });
    }
    if (roles.some((r) => r.id !== id && r.name === input.name.trim())) {
      return fail({ code: 'conflict', message: '角色名已存在' });
    }
    role.name = input.name.trim();
    role.description = input.description?.trim() ?? null;
    if (!role.isSystem) {
      role.permissionCodes = [...input.permissionCodes];
    }
    for (const u of staffUsers) {
      if (u.roleId === role.id) u.roleName = role.name;
    }
    return ok(staffRoleSchema.parse(role));
  }

  async deleteRole(id: string): Promise<AppResult<void>> {
    const role = roles.find((r) => r.id === id);
    if (!role) return fail({ code: 'not_found', message: '角色不存在' });
    if (role.isSystem) return fail({ code: 'forbidden', message: '系统内置角色不可删除' });
    if (role.memberCount > 0) {
      return fail({ code: 'conflict', message: '仍有管理员使用该角色' });
    }
    const idx = roles.findIndex((r) => r.id === id);
    roles.splice(idx, 1);
    return ok(undefined);
  }

  async listPermissionCatalog(): Promise<AppResult<PermissionCatalogItem[]>> {
    return ok(permissionCatalog);
  }
}
