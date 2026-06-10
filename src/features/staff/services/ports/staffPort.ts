import type { AppResult } from '@/shared/api/httpTypes';

import type {
  PermissionCatalogItem,
  StaffListFilter,
  StaffRole,
  StaffRoleListItem,
  StaffUser,
} from '../../model/staff.types';

export interface ListStaffPage {
  items: StaffUser[];
  total: number;
}

export interface ListRolePage {
  items: StaffRoleListItem[];
  total: number;
}

export interface ListRolesInput {
  page?: number;
  pageSize?: number;
  keyword?: string;
}

export interface CreateStaffInput {
  username: string;
  email: string;
  displayName: string;
  password: string;
  roleId: string;
}

export interface UpdateStaffInput {
  displayName: string;
  email: string;
}

export interface CreateRoleInput {
  name: string;
  description?: string;
  permissionCodes: string[];
}

export interface UpdateRoleInput {
  name: string;
  description?: string;
  permissionCodes: string[];
}

export interface StaffPort {
  listStaff(input: {
    page: number;
    pageSize: number;
    filter: StaffListFilter;
  }): Promise<AppResult<ListStaffPage>>;

  createStaff(input: CreateStaffInput): Promise<AppResult<StaffUser>>;
  updateStaff(uid: string, input: UpdateStaffInput): Promise<AppResult<StaffUser>>;
  setStaffStatus(uid: string, active: boolean): Promise<AppResult<StaffUser>>;
  resetStaffPassword(uid: string, newPassword: string): Promise<AppResult<StaffUser>>;
  changeStaffRole(uid: string, roleId: string): Promise<AppResult<StaffUser>>;

  listRoles(input?: ListRolesInput): Promise<AppResult<ListRolePage>>;
  getRole(id: string): Promise<AppResult<StaffRole>>;
  createRole(input: CreateRoleInput): Promise<AppResult<StaffRole>>;
  updateRole(id: string, input: UpdateRoleInput): Promise<AppResult<StaffRole>>;
  deleteRole(id: string): Promise<AppResult<void>>;

  listPermissionCatalog(): Promise<AppResult<PermissionCatalogItem[]>>;
}
