import type { ItemsEnvelope } from '@/features/tavern/api/http';
import type { AppResult } from '@/shared/api/httpTypes';

import type { CallLog, CallLogQuery } from '../../model/metering.types';

export interface TavernCallLogPort {
  list(query: CallLogQuery): Promise<AppResult<ItemsEnvelope<CallLog>>>;
}
