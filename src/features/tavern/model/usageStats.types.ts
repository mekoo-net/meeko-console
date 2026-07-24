import type { LogStats } from '@demux/common';

export interface TavernUsageStatsFilter {
  fromUtc?: number;
  toUtc?: number;
}

export type TavernUsageStats = LogStats;
