import type { InjectionKey, Ref } from 'vue';

import type { Account } from '../model/account.types';

export interface AccountDetailContext {
  account: Ref<Account | undefined>;
  loading: Ref<boolean>;
  refresh: () => void;
}

export const AccountDetailKey: InjectionKey<AccountDetailContext> = Symbol('accountDetail');
