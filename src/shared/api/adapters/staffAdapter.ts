import {
  permissionCatalogItemSchema,
  staffRoleSchema,
  staffUserSchema,
  type PermissionCatalogItem,
  type StaffListFilter,
  type StaffRole,
  type StaffUser,
} from '@/features/staff/model/staff.types';
import type {
  CreateRoleInput,
  CreateStaffInput,
  ListStaffPage,
  StaffPort,
  UpdateRoleInput,
  UpdateStaffInput,
} from '@/features/staff/services/ports/staffPort';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { request } from '@/shared/api/httpClient';

interface StaffListWire {
  items: unknown[];
  total: number;
}

function mapStaffUser(raw: Record<string, unknown>): StaffUser {
  return staffUserSchema.parse({
    uid: String(raw.uid ?? ''),
    username: raw.username,
    email: raw.email,
    displayName: raw.displayName ?? raw.display_name,
    roleId: String(raw.roleId ?? raw.role_id ?? ''),
    roleName: raw.roleName ?? raw.role_name,
    status: raw.status,
    lastLoginAtUtc: raw.lastLoginAtUtc ?? raw.last_login_at_utc ?? null,
    lastLoginIp: raw.lastLoginIp ?? raw.last_login_ip ?? null,
    createdAtUtc: raw.createdAtUtc ?? raw.created_at_utc,
    updatedAtUtc: raw.updatedAtUtc ?? raw.updated_at_utc,
  });
}

function mapStaffRole(raw: Record<string, unknown>): StaffRole {
  return staffRoleSchema.parse({
    id: String(raw.id ?? ''),
    name: raw.name,
    description: raw.description ?? null,
    isSystem: raw.isSystem ?? raw.is_system ?? false,
    permissionCodes: raw.permissionCodes ?? raw.permission_codes ?? [],
    memberCount: raw.memberCount ?? raw.member_count ?? 0,
    createdAtUtc: raw.createdAtUtc ?? raw.created_at_utc,
  });
}

function mapPermission(raw: Record<string, unknown>): PermissionCatalogItem {
  return permissionCatalogItemSchema.parse({
    id: String(raw.id ?? ''),
    code: raw.code,
    description: raw.description ?? null,
  });
}

function buildStaffQuery(filter: StaffListFilter, page: number, pageSize: number): Record<string, string | number> {
  const q: Record<string, string | number> = { page, pageSize };
  if (filter.keyword.trim()) q.keyword = filter.keyword.trim();
  if (filter.status !== 'all') q.status = filter.status;
  if (filter.roleId) q.roleId = filter.roleId;
  return q;
}

export class StaffHttpAdapter implements StaffPort {
  async listStaff(input: {
    page: number;
    pageSize: number;
    filter: StaffListFilter;
  }): Promise<AppResult<ListStaffPage>> {
    const res = await request<StaffListWire>('/api/admin/staff', {
      query: buildStaffQuery(input.filter, input.page, input.pageSize),
    });
    if (!res.success) return res;
    const items = res.data.items.map((row) => mapStaffUser(row as Record<string, unknown>));
    return ok({ items, total: res.data.total });
  }

  async createStaff(input: CreateStaffInput): Promise<AppResult<StaffUser>> {
    const res = await request<Record<string, unknown>>('/api/admin/staff', {
      method: 'POST',
      body: {
        username: input.username,
        email: input.email,
        displayName: input.displayName,
        password: input.password,
        roleId: input.roleId,
      },
    });
    if (!res.success) return res;
    return ok(mapStaffUser(res.data));
  }

  async updateStaff(uid: string, input: UpdateStaffInput): Promise<AppResult<StaffUser>> {
    const res = await request<Record<string, unknown>>(`/api/admin/staff/${uid}`, {
      method: 'PATCH',
      body: input,
    });
    if (!res.success) return res;
    return ok(mapStaffUser(res.data));
  }

  async setStaffStatus(uid: string, active: boolean): Promise<AppResult<StaffUser>> {
    const res = await request<Record<string, unknown>>(`/api/admin/staff/${uid}/status`, {
      method: 'PATCH',
      body: { active },
    });
    if (!res.success) return res;
    return ok(mapStaffUser(res.data));
  }

  async resetStaffPassword(uid: string, newPassword: string): Promise<AppResult<StaffUser>> {
    const res = await request<Record<string, unknown>>(`/api/admin/staff/${uid}/reset-password`, {
      method: 'POST',
      body: { newPassword },
    });
    if (!res.success) return res;
    return ok(mapStaffUser(res.data));
  }

  async changeStaffRole(uid: string, roleId: string): Promise<AppResult<StaffUser>> {
    const res = await request<Record<string, unknown>>(`/api/admin/staff/${uid}/role`, {
      method: 'PATCH',
      body: { roleId },
    });
    if (!res.success) return res;
    return ok(mapStaffUser(res.data));
  }

  async listRoles(): Promise<AppResult<StaffRole[]>> {
    const res = await request<unknown[]>('/api/admin/staff/roles');
    if (!res.success) return res;
    return ok(res.data.map((row) => mapStaffRole(row as Record<string, unknown>)));
  }

  async createRole(input: CreateRoleInput): Promise<AppResult<StaffRole>> {
    const res = await request<Record<string, unknown>>('/api/admin/staff/roles', {
      method: 'POST',
      body: input,
    });
    if (!res.success) return res;
    return ok(mapStaffRole(res.data));
  }

  async updateRole(id: string, input: UpdateRoleInput): Promise<AppResult<StaffRole>> {
    const res = await request<Record<string, unknown>>(`/api/admin/staff/roles/${id}`, {
      method: 'PUT',
      body: input,
    });
    if (!res.success) return res;
    return ok(mapStaffRole(res.data));
  }

  async deleteRole(id: string): Promise<AppResult<void>> {
    const res = await request<void>(`/api/admin/staff/roles/${id}`, { method: 'DELETE' });
    if (!res.success) return fail(res.error);
    return ok(undefined);
  }

  async listPermissionCatalog(): Promise<AppResult<PermissionCatalogItem[]>> {
    const res = await request<unknown[]>('/api/admin/staff/permissions');
    if (!res.success) return res;
    return ok(res.data.map((row) => mapPermission(row as Record<string, unknown>)));
  }
}
