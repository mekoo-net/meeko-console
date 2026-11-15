import type { AppResult } from '@/shared/api/httpTypes';

import type { Account, AccountListFilter, AccountStatus } from '../../model/account.types';
import type { CreateIamUserPayload } from '../../model/validators';
import type { IamUser } from '../../model/iamUser.types';

export interface ListAccountsInput {
  page: number;
  pageSize: number;
  filter: AccountListFilter;
}

export interface ListAccountsOutput {
  items: Account[];
  total: number;
}

/**
 * 账户域服务端口。View → Composable → Port → MockAdapter | HttpAdapter（日后）。
 *
 * 对应的后台接口（都是 StaffOnly）：
 * - `GET /views/admin/accounts`        → listAccounts（Bff 的只读视图）
 * - `GET /views/admin/accounts/{uid}`  → getAccount（同上）
 * - `GET /admin/iam/users`、`POST /admin/iam/users` → listIamUsers / createIamUser（Keystone）
 *
 * 真接 BFF 时只需实现同名方法的 HttpAdapter，并对结果 zod 校验后返回 ok/fail。
 */
export interface AccountAdminPort {
  getCurrentAccount(): Promise<AppResult<Account>>;
  listAccounts(input: ListAccountsInput): Promise<AppResult<ListAccountsOutput>>;
  getAccount(uid: string): Promise<AppResult<Account>>;

  listIamUsers(accountUid: string): Promise<AppResult<IamUser[]>>;
  createIamUser(accountUid: string, payload: CreateIamUserPayload): Promise<AppResult<IamUser>>;

  setAccountStatus(uid: string, status: AccountStatus): Promise<AppResult<Account>>;

  /**
   * 授予勋章。`code` 已存在则视为幂等成功。
   * 返回更新后的 Account。
   */
  grantAchievement(accountUid: string, code: string): Promise<AppResult<Account>>;
  /**
   * 撤销勋章。`code` 不存在则视为幂等成功。
   * 返回更新后的 Account。
   */
  revokeAchievement(accountUid: string, code: string): Promise<AppResult<Account>>;

  unlinkInviter(accountUid: string): Promise<AppResult<Account>>;
  setReferralRate(accountUid: string, rebateRatePercent: number | null): Promise<AppResult<Account>>;
}
