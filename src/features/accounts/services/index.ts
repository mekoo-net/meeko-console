import { isMockMode } from '@/shared/runtime';

import { AccountAdminMock } from './mock/accountAdminMock';
import { AccountAdminHttpAdapter } from '@/shared/api/adapters/accountAdminAdapter';
import type { AccountAdminPort } from './ports/accountAdminPort';

const accountAdmin: AccountAdminPort = isMockMode
  ? new AccountAdminMock()
  : new AccountAdminHttpAdapter();

export function getAccountAdminPort(): AccountAdminPort {
  return accountAdmin;
}
