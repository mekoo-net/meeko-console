import type { AppResult } from '@/shared/api/httpTypes';

import type {
  CreateRedemptionsInput,
  ListRedemptionsFilter,
  Redemption,
} from '../../model/redemption.types';

export interface ListRedemptionsPage {
  items: Redemption[];
  total: number;
}

export interface RedemptionPort {
  list(input: {
    page: number;
    pageSize: number;
    filter: ListRedemptionsFilter;
  }): Promise<AppResult<ListRedemptionsPage>>;

  /** 返回明文 key，仅此一次；列表里只给脱敏值。 */
  create(input: CreateRedemptionsInput): Promise<AppResult<{ keys: string[] }>>;

  disable(id: string): Promise<AppResult<void>>;
}
