import { isMockMode } from '@/shared/runtime';

import { AccountAdminMock } from './mock/accountAdminMock';
import { ReferralAdminMock } from './mock/referralAdminMock';
import { AccountAdminHttpAdapter } from '@/shared/api/adapters/accountAdminAdapter';
import { ReferralAdminHttpAdapter } from '@/shared/api/adapters/referralAdminAdapter';
import type { AccountAdminPort } from './ports/accountAdminPort';
import type { ReferralAdminPort } from './ports/referralAdminPort';

const accountAdmin: AccountAdminPort = isMockMode
  ? new AccountAdminMock()
  : new AccountAdminHttpAdapter();

const referralAdmin: ReferralAdminPort = isMockMode
  ? new ReferralAdminMock()
  : new ReferralAdminHttpAdapter();

export function getAccountAdminPort(): AccountAdminPort {
  return accountAdmin;
}

export function getReferralAdminPort(): ReferralAdminPort {
  return referralAdmin;
}
