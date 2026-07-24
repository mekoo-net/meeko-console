import type { TavernUsageStatsPort } from '../ports/tavernUsageStatsPort';
import { ok, type AppResult } from '@/shared/api/httpTypes';
import { delay } from '@/shared/lib/delay';

import type { TavernUsageStats, TavernUsageStatsFilter } from '../../model/usageStats.types';

const now = Date.now();
const hour = 3600_000;

const mockStats: TavernUsageStats = {
  totalCalls: 128,
  successCalls: 121,
  errorCalls: 7,
  avgTokenLatency: 0,
  p95TokenLatency: 0,
  totalTokens: 842_000,
  totalCost: 12.46,
  rpm: 0.89,
  bucketSizeSec: 3600,
  buckets: Array.from({ length: 24 }, (_, i) => ({
    tsUtc: now - (23 - i) * hour,
    calls: 3 + (i % 5),
    errors: i % 7 === 0 ? 1 : 0,
    cost: 0.4 + i * 0.03,
    tokens: 20_000 + i * 1500,
  })),
  topModels: [
    { modelName: 'google/gemini-2.5-flash', calls: 64, cost: 6.2, errorRate: 0.03 },
    { modelName: 'anthropic/claude-sonnet-4', calls: 41, cost: 4.8, errorRate: 0.05 },
    { modelName: 'openai/gpt-4o', calls: 23, cost: 1.46, errorRate: 0.04 },
  ],
  topProviders: [
    { providerId: 1, providerName: 'google', calls: 64, errors: 2, avgTokenLatency: 0 },
    { providerId: 2, providerName: 'anthropic', calls: 41, errors: 2, avgTokenLatency: 0 },
    { providerId: 3, providerName: 'openai', calls: 23, errors: 3, avgTokenLatency: 0 },
  ],
  errorCodes: [
    { code: 'failed', count: 5 },
    { code: 'voided', count: 2 },
  ],
};

export class TavernUsageStatsMock implements TavernUsageStatsPort {
  async stats(_filter: TavernUsageStatsFilter): Promise<AppResult<TavernUsageStats>> {
    await delay();
    return ok({ ...mockStats, buckets: mockStats.buckets.map((b) => ({ ...b })) });
  }
}
