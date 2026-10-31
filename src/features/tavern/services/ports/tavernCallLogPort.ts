import type { ItemsEnvelope } from '@/features/tavern/api/http';
import type { AppResult } from '@/shared/api/httpTypes';

import type { CallLogQuery, LogRow } from '../../model/metering.types';

export interface TavernCallLogPort {
  list(query: CallLogQuery): Promise<AppResult<ItemsEnvelope<LogRow>>>;
}
