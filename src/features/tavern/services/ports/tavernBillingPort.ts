import type { ItemsEnvelope } from '@/features/tavern/api/http';
import type { AppResult } from '@/shared/api/httpTypes';

import type {
  RangeQuery,
  UsageLog,
  UsageLogDetail,
  UsageLogQuery,
  UsageSummary,
} from '../../model/metering.types';

export interface TavernBillingPort {
  list(query: UsageLogQuery): Promise<AppResult<ItemsEnvelope<UsageLog>>>;
  summary(query: RangeQuery): Promise<AppResult<UsageSummary>>;
  get(id: number): Promise<AppResult<UsageLogDetail>>;
}
