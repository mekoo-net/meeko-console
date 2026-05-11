import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { delay } from '@/shared/lib/delay';
import { clientPaginate } from '@/shared/composables/usePagination';

import {
  accountSchema,
  type Account,
  type AccountListFilter,
  type AccountStatus,
} from '../../model/account.types';
import { iamUserSchema, type IamUser } from '../../model/iamUser.types';
import { createIamUserSchema, type CreateIamUserPayload } from '../../model/validators';
import type {
  AccountAdminPort,
  ListAccountsInput,
  ListAccountsOutput,
} from '../ports/accountAdminPort';
import { getStore, nextIamUid } from './data';

function listFiltered(filter: AccountListFilter): Account[] {
  const all = Array.from(getStore().accounts.values());
  const keyword = filter.keyword.trim().toLowerCase();
  return all.filter((a) => {
    if (filter.type !== 'all' && a.type !== filter.type) return false;
    if (filter.status !== 'all' && a.status !== filter.status) return false;
    if (keyword.length === 0) return true;
    return (
      a.name.toLowerCase().includes(keyword) ||
      a.slug.toLowerCase().includes(keyword) ||
      a.uid.includes(keyword)
    );
  });
}

/** Mock 也走 schema 校验，便于将来直接替换为 HttpAdapter 而不改 view。 */
function parseAccount(value: unknown): AppResult<Account> {
  const r = accountSchema.safeParse(value);
  return r.success
    ? ok(r.data)
    : fail({ code: 'validation', message: 'Account 数据格式错误', details: r.error.flatten().fieldErrors as Record<string, string[]> });
}

function parseIamUser(value: unknown): AppResult<IamUser> {
  const r = iamUserSchema.safeParse(value);
  return r.success
    ? ok(r.data)
    : fail({ code: 'validation', message: 'IamUser 数据格式错误', details: r.error.flatten().fieldErrors as Record<string, string[]> });
}

export class AccountAdminMock implements AccountAdminPort {
  async getCurrentAccount(): Promise<AppResult<Account>> {
    await delay();
    const first = Array.from(getStore().accounts.values())[0];
    if (!first) return fail({ code: 'not_found', message: '当前账户不存在' });
    return parseAccount(first);
  }

  async listAccounts(input: ListAccountsInput): Promise<AppResult<ListAccountsOutput>> {
    await delay();
    const filtered = listFiltered(input.filter);
    const items = clientPaginate(filtered, input.page, input.pageSize);
    return ok({ items, total: filtered.length });
  }

  async getAccount(uid: string): Promise<AppResult<Account>> {
    await delay();
    const a = getStore().accounts.get(uid);
    return a ? parseAccount(a) : fail({ code: 'not_found', message: `账户 ${uid} 不存在` });
  }

  async listIamUsers(accountUid: string): Promise<AppResult<IamUser[]>> {
    await delay();
    const users = getStore().iamUsers.get(accountUid);
    if (!users) return fail({ code: 'not_found', message: `账户 ${accountUid} 不存在` });
    const parsed: IamUser[] = [];
    for (const u of users) {
      const r = parseIamUser(u);
      if (!r.success) return r;
      parsed.push(r.data);
    }
    return ok(parsed);
  }

  async createIamUser(accountUid: string, payload: CreateIamUserPayload): Promise<AppResult<IamUser>> {
    await delay();
    const validation = createIamUserSchema.safeParse(payload);
    if (!validation.success) {
      return fail({
        code: 'validation',
        message: '输入有误',
        details: validation.error.flatten().fieldErrors as Record<string, string[]>,
      });
    }

    const store = getStore();
    const account = store.accounts.get(accountUid);
    if (!account) return fail({ code: 'not_found', message: `账户 ${accountUid} 不存在` });

    const users = store.iamUsers.get(accountUid) ?? [];
    if (users.some((u) => u.username.toLowerCase() === payload.username.toLowerCase())) {
      return fail({ code: 'conflict', message: `子账号 ${payload.username} 已存在` });
    }

    const created: IamUser = {
      uid: nextIamUid(),
      accountUid,
      username: payload.username,
      displayName: payload.displayName,
      email: payload.email && payload.email.length > 0 ? payload.email : null,
      role: payload.roleName,
      isAccountOwner: false,
      status: 'active',
    };
    users.push(created);
    store.iamUsers.set(accountUid, users);

    store.accounts.set(accountUid, {
      ...account,
      iamUserCount: users.length,
      updatedAtUtc: new Date().toISOString(),
    });
    return parseIamUser(created);
  }

  async setAccountStatus(uid: string, status: AccountStatus): Promise<AppResult<Account>> {
    await delay();
    const store = getStore();
    const a = store.accounts.get(uid);
    if (!a) return fail({ code: 'not_found', message: `账户 ${uid} 不存在` });
    if (a.status === status) {
      return ok(a);
    }
    const next: Account = { ...a, status, updatedAtUtc: new Date().toISOString() };
    store.accounts.set(uid, next);
    return parseAccount(next);
  }
}
