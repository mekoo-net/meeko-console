import type { AppResult } from '@/shared/api/httpTypes';

import type {
  CreateRedemptionCodesInput,
  CreateRedemptionCodesResult,
  ListRedemptionCodesFilter,
  RedemptionCode,
} from '../../model/redemption.types';

export interface ListRedemptionCodesPage {
  items: RedemptionCode[];
  total: number;
}

export interface DemuxaiRedemptionPort {
  list(input: {
    page: number;
    pageSize: number;
    filter: ListRedemptionCodesFilter;
  }): Promise<AppResult<ListRedemptionCodesPage>>;

  create(input: CreateRedemptionCodesInput): Promise<AppResult<CreateRedemptionCodesResult>>;

  remove(id: number): Promise<AppResult<void>>;
}
