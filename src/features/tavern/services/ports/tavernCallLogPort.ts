import type { ItemsEnvelope } from '@/features/tavern/api/http';
import type { AppResult } from '@/shared/api/httpTypes';

import type { CallLog, CallLogQuery, CallSummary, RangeQuery } from '../../model/metering.types';

export interface TavernCallLogPort {
  list(query: CallLogQuery): Promise<AppResult<ItemsEnvelope<CallLog>>>;
  /** 只按时间与账号汇总，不受管线 / 模型 / 状态筛选影响。 */
  summary(query: RangeQuery): Promise<AppResult<CallSummary>>;
}
