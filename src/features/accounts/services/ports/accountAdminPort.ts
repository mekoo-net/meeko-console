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
 * 对应 Keystone REST：
 * - `GET /accounts/current` → getCurrentAccount
 * - 平台/管理后台视图（Mock 扩展）→ listAccounts/getAccount
 * - `GET /iam/users`、`POST /iam/users` → listIamUsers / createIamUser
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
}
