import type { AppResult } from '@/shared/api/httpTypes';
import type { LogStats } from '@demux/common';

import type { TavernUsageStatsFilter } from '../../model/usageStats.types';

export interface TavernUsageStatsPort {
  stats(filter: TavernUsageStatsFilter): Promise<AppResult<LogStats>>;
}
