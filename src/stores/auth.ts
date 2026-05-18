import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

import type { Uid } from '@/shared/lib/id';

/**
 * Mock 鉴权。真接 BFF 时只需替换 login()/refresh() 内部实现：
 * - login(): POST /auth/login 或 /auth/login-iam（Keystone），把返回的 access/refresh + Account/IamUser 存入。
 * - logout(): POST /auth/logout 撤销 jti，再清本地。
 *
 * 角色定义对齐 Meeko-Keystone.md：
 *   - `Owner`：Personal Owner / Org Owner
 *   - `Admin`：Org 子账号 admin（管理通知/SMTP 模板）
 *   - `Member`：普通子账号
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
}

const STORAGE_KEY = 'meeko.admin.session.v1';

function readPersisted(): AuthSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthSession> | null;
    // 兼容旧版本残留：缺关键字段视为无效会话，避免 computed 解引用 undefined
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
    return parsed as AuthSession;
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

  /**
   * Mock 登录：根据 username/role 选择 fixture。
   * - admin/admin → Admin 角色（可见通知模块）
   * - owner/owner → Owner（个人/组织主账号）
   * - 其他 → Member
   */
  function login(username: string, _password: string): void {
    const lower = username.trim().toLowerCase();
    const detectedRole: AppRole = lower === 'admin' ? 'Admin' : lower === 'owner' ? 'Owner' : 'Member';

    const next: AuthSession = {
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
    };
    persist(next);
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
    displayName,
    displayInitial,
    hasRole,
    login,
    logout,
  };
});
