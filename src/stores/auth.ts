import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

import {
  ALL_STAFF_PERMISSIONS,
  READ_ONLY_STAFF_PERMISSIONS,
} from '@/features/staff/model/staff.types';
import { apiUrl } from '@/shared/api/apiBase';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { isMockMode } from '@/shared/runtime';

import type { Uid } from '@/shared/lib/id';

/**
 * meeko-console = 平台管理后台，登录主体是 Keystone **Staff 员工**（用户名），不是终端 IAM 邮箱用户。
 *
 * - login(): POST /staff/auth/login
 * - logout(): 清 localStorage（Staff 无 refresh token）
 *
 * AppRole 仅用于本前端路由守卫；真连后端时由 Staff 角色映射：
 *   SuperAdmin → Admin，ReadOnly → Member
 *
 * 菜单/路由优先按 `permissions[]` 权限码驱动；`AppRole` 保留兼容旧页面。
 */
export type AppRole = 'Admin' | 'Owner' | 'Member';
export type AccountType = 'personal' | 'organization';

export interface AuthAccount {
  uid: Uid;
  type: AccountType;
  name: string;
  slug: string;
}

export interface AuthIamUser {
  uid: Uid;
  username: string;
  displayName: string;
  role: AppRole;
  isAccountOwner: boolean;
}

interface AuthSession {
  accessToken: string;
  refreshToken: string;
  account: AuthAccount;
  iamUser: AuthIamUser;
  staffUid: string;
  staffRole: string;
  permissions: string[];
}

const STORAGE_KEY = 'meeko.admin.session.v1';

function readPersisted(): AuthSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthSession> | null;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !parsed.accessToken ||
      !parsed.account ||
      !parsed.iamUser
    ) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return {
      ...(parsed as AuthSession),
      staffUid: parsed.staffUid ?? parsed.iamUser.uid ?? '',
      staffRole: parsed.staffRole ?? 'ReadOnly',
      permissions: Array.isArray(parsed.permissions) ? parsed.permissions : [],
    };
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export const useAuthStore = defineStore('auth', () => {
  const session = ref<AuthSession | null>(readPersisted());

  const isAuthenticated = computed(() => session.value !== null);
  const role = computed<AppRole | null>(() => session.value?.iamUser?.role ?? null);
  const accountUid = computed<Uid | null>(() => session.value?.account?.uid ?? null);
  const staffUid = computed(() => session.value?.staffUid ?? null);
  const staffRole = computed(() => session.value?.staffRole ?? null);
  const permissions = computed(() => session.value?.permissions ?? []);
  const displayName = computed(() => session.value?.iamUser?.displayName ?? '未登录');
  const displayInitial = computed(() => {
    const name = session.value?.iamUser?.displayName ?? '?';
    return name.charAt(0).toUpperCase();
  });

  function persist(next: AuthSession | null): void {
    if (next === null) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
    session.value = next;
  }

  function hasRole(...allowed: AppRole[]): boolean {
    if (allowed.length === 0) return isAuthenticated.value;
    const r = role.value;
    return r !== null && allowed.includes(r);
  }

  /** 任一权限码命中即通过；未传参时仅校验已登录。 */
  function hasPermission(...codes: string[]): boolean {
    if (codes.length === 0) return isAuthenticated.value;
    const set = new Set(permissions.value);
    return codes.some((c) => set.has(c));
  }

  function mapStaffRole(staffRoleName: string): AppRole {
    if (staffRoleName === 'SuperAdmin') return 'Admin';
    if (staffRoleName === 'ReadOnly') return 'Member';
    return 'Member';
  }

  /**
   * Mock 模式：用户名决定角色 (admin/owner/其他)。
   * 真实模式：POST /staff/auth/login（Staff 用户名 + 密码）。
   */
  async function login(username: string, password: string): Promise<AppResult<void>> {
    if (isMockMode) {
      const lower = username.trim().toLowerCase();
      const detectedRole: AppRole = lower === 'admin' ? 'Admin' : lower === 'owner' ? 'Owner' : 'Member';
      const mockStaffRole = lower === 'admin' ? 'SuperAdmin' : 'ReadOnly';
      const mockPermissions =
        lower === 'admin'
          ? [...ALL_STAFF_PERMISSIONS]
          : [...READ_ONLY_STAFF_PERMISSIONS];
      persist({
        accessToken: `mock-access-${Date.now()}`,
        refreshToken: `mock-refresh-${Date.now()}`,
        account: {
          uid: '100000001',
          type: detectedRole === 'Owner' ? 'personal' : 'organization',
          name: detectedRole === 'Owner' ? '个人工作台' : 'Meeko Demo Org',
          slug: detectedRole === 'Owner' ? 'personal' : 'meeko-demo',
        },
        iamUser: {
          uid: '200000001',
          username: lower || 'demo',
          displayName: lower === 'admin' ? '系统管理员' : lower === 'owner' ? '组织主' : '演示用户',
          role: detectedRole,
          isAccountOwner: detectedRole !== 'Member',
        },
        staffUid: '300000001',
        staffRole: mockStaffRole,
        permissions: mockPermissions,
      });
      return ok(undefined);
    }

    try {
      const res = await fetch(apiUrl('/staff/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const body = await res.json() as { detail?: string; title?: string };
          msg = body.detail ?? body.title ?? msg;
        } catch { /* ignore */ }
        return fail({ code: res.status === 401 ? 'unauthorized' : 'unknown', message: msg });
      }

      const data = await res.json() as {
        accessToken?: string;
        access_token?: string;
        staff?: {
          uid?: string;
          displayName?: string;
          display_name?: string;
          role?: string;
          permissions?: string[];
        };
      };

      const accessToken = data.accessToken ?? data.access_token;
      const staff = data.staff;
      if (!accessToken || !staff?.uid) {
        return fail({ code: 'unknown', message: '登录响应格式无效' });
      }

      const staffRoleName = staff.role ?? 'ReadOnly';
      persist({
        accessToken,
        refreshToken: '',
        account: {
          uid: '0',
          type: 'organization',
          name: 'Meeko Platform',
          slug: 'platform',
        },
        iamUser: {
          uid: String(staff.uid),
          username: username.trim(),
          displayName: staff.displayName ?? staff.display_name ?? username.trim(),
          role: mapStaffRole(staffRoleName),
          isAccountOwner: true,
        },
        staffUid: String(staff.uid),
        staffRole: staffRoleName,
        permissions: staff.permissions ?? [],
      });
      return ok(undefined);
    } catch (err) {
      return fail({ code: 'unknown', message: err instanceof Error ? err.message : '网络错误' });
    }
  }

  function logout(): void {
    persist(null);
    void import('vue-router').then(() => {
      window.location.assign('/login');
    });
  }

  return {
    session,
    isAuthenticated,
    role,
    accountUid,
    staffUid,
    staffRole,
    permissions,
    displayName,
    displayInitial,
    hasRole,
    hasPermission,
    login,
    logout,
  };
});
