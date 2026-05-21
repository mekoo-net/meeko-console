import { accountSchema, type Account, type AccountStatus } from '@/features/accounts/model/account.types';
import { iamUserSchema, type IamUser } from '@/features/accounts/model/iamUser.types';
import type {
  AccountAdminPort,
  ListAccountsInput,
  ListAccountsOutput,
} from '@/features/accounts/services/ports/accountAdminPort';
import type { CreateIamUserPayload } from '@/features/accounts/model/validators';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { apiFetch } from '@/shared/api/httpClient';

interface AccountAdminListWire {
  items: unknown[];
  total: number;
}

function mapListItem(raw: Record<string, unknown>): Record<string, unknown> {
  const owner = raw.owner as Record<string, unknown> | undefined;
  return {
    uid: String(raw.uid ?? ''),
    type: raw.type,
    name: raw.name,
    slug: raw.slug,
    status: raw.status,
    ownerDisplayName: owner?.displayName ?? owner?.display_name,
    ownerEmail: owner?.email,
    iamUserCount: raw.iamUserCount ?? raw.iam_user_count ?? 0,
    createdAtUtc: raw.createdAtUtc ?? raw.created_at_utc,
    lastActiveAtUtc: raw.lastActiveAtUtc ?? raw.last_active_at_utc,
    tier: typeof raw.tier === 'number' ? raw.tier : 1,
    totalRechargedAmount:
      typeof raw.totalRechargedAmount === 'number'
        ? raw.totalRechargedAmount
        : typeof raw.total_recharged_amount === 'number'
          ? raw.total_recharged_amount
          : 0,
  };
}

function parseAccount(value: unknown): AppResult<Account> {
  const mapped =
    value && typeof value === 'object'
      ? mapListItem(value as Record<string, unknown>)
      : value;
  const r = accountSchema.safeParse(mapped);
  return r.success
    ? ok(r.data)
    : fail({
        code: 'validation',
        message: 'Account 数据格式错误',
        details: r.error.flatten().fieldErrors as Record<string, string[]>,
      });
}

function parseIamUser(value: unknown): AppResult<IamUser> {
  const r = iamUserSchema.safeParse(value);
  return r.success
    ? ok(r.data)
    : fail({
        code: 'validation',
        message: 'IamUser 数据格式错误',
        details: r.error.flatten().fieldErrors as Record<string, string[]>,
      });
}

function buildListQuery(input: ListAccountsInput): string {
  const params = new URLSearchParams({
    page: String(input.page),
    pageSize: String(input.pageSize),
  });
  const { filter } = input;
  if (filter.accountUid.trim()) params.set('accountUid', filter.accountUid.trim());
  if (filter.contactKeyword.trim()) params.set('contactKeyword', filter.contactKeyword.trim());
  if (filter.type !== 'all') params.set('type', filter.type);
  if (filter.status !== 'all') params.set('status', filter.status);
  return params.toString();
}

export class AccountAdminHttpAdapter implements AccountAdminPort {
  async getCurrentAccount(): Promise<AppResult<Account>> {
    const res = await apiFetch<unknown>('/accounts/current');
    if (!res.success) return res;
    return parseAccount(res.data);
  }

  async listAccounts(input: ListAccountsInput): Promise<AppResult<ListAccountsOutput>> {
    const res = await apiFetch<AccountAdminListWire>(`/accounts?${buildListQuery(input)}`);
    if (!res.success) return res;

    const items: Account[] = [];
    for (const row of res.data.items) {
      const parsed = parseAccount(
        row && typeof row === 'object' ? mapListItem(row as Record<string, unknown>) : row,
      );
      if (!parsed.success) return parsed;
      items.push(parsed.data);
    }
    return ok({ items, total: res.data.total });
  }

  async getAccount(uid: string): Promise<AppResult<Account>> {
    const res = await apiFetch<unknown>(`/accounts/${encodeURIComponent(uid)}`);
    if (!res.success) return res;
    return parseAccount(res.data);
  }

  async listIamUsers(accountUid: string): Promise<AppResult<IamUser[]>> {
    const res = await apiFetch<unknown[]>(
      `/iam/users?accountUid=${encodeURIComponent(accountUid)}`,
    );
    if (!res.success) return res;
    const parsed: IamUser[] = [];
    for (const row of res.data) {
      const r = parseIamUser(row);
      if (!r.success) return r;
      parsed.push(r.data);
    }
    return ok(parsed);
  }

  async createIamUser(
    accountUid: string,
    payload: CreateIamUserPayload,
  ): Promise<AppResult<IamUser>> {
    const res = await apiFetch<unknown>(`/iam/users`, {
      method: 'POST',
      body: JSON.stringify({ accountUid, ...payload }),
    });
    if (!res.success) return res;
    return parseIamUser(res.data);
  }

  async setAccountStatus(uid: string, status: AccountStatus): Promise<AppResult<Account>> {
    const res = await apiFetch<unknown>(`/accounts/${encodeURIComponent(uid)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    if (!res.success) return res;
    return parseAccount(res.data);
  }

  async grantAchievement(accountUid: string, code: string): Promise<AppResult<Account>> {
    const res = await apiFetch<unknown>(
      `/accounts/${encodeURIComponent(accountUid)}/achievements`,
      { method: 'POST', body: JSON.stringify({ code }) },
    );
    if (!res.success) return res;
    return parseAccount(res.data);
  }

  async revokeAchievement(accountUid: string, code: string): Promise<AppResult<Account>> {
    const res = await apiFetch<unknown>(
      `/accounts/${encodeURIComponent(accountUid)}/achievements/${encodeURIComponent(code)}`,
      { method: 'DELETE' },
    );
    if (!res.success) return res;
    return parseAccount(res.data);
  }
}
