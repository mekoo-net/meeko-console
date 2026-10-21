import type { LogStats } from '@yomi/common';

export interface TavernUsageStatsFilter {
  fromUtc?: number;
  toUtc?: number;
}

export type TavernUsageStats = LogStats;
