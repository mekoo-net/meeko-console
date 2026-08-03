import { requestTavern } from '@/features/tavern/api/http';
import type { TavernUsageStatsPort } from '@/features/tavern/services/ports/tavernUsageStatsPort';
import { ok, type AppResult } from '@/shared/api/httpTypes';

import type { TavernUsageStats, TavernUsageStatsFilter } from '../../model/usageStats.types';

const BASE = '/tavern/api/admin/usage/stats';

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function mapOverviewWire(raw: unknown): TavernUsageStats {
  if (!raw || typeof raw !== 'object') {
    return {
      totalCalls: 0,
      successCalls: 0,
      errorCalls: 0,
      avgTokenLatency: 0,
      p95TokenLatency: 0,
      totalTokens: 0,
      totalCost: 0,
      rpm: 0,
      bucketSizeSec: 3600,
      buckets: [],
      topModels: [],
      topProviders: [],
      errorCodes: [],
    };
  }
  const w = raw as Record<string, unknown>;

  const bucketsRaw = w.buckets ?? w.Buckets;
  const topModelsRaw = w.topModels ?? w.TopModels;
  const topVendorsRaw = w.topVendors ?? w.TopVendors;
  const errorCodesRaw = w.errorCodes ?? w.ErrorCodes;

  return {
    totalCalls: num(w.totalCalls ?? w.TotalCalls),
    successCalls: num(w.successCalls ?? w.SuccessCalls),
    errorCalls: num(w.errorCalls ?? w.ErrorCalls),
    avgTokenLatency: num(w.avgTokenLatency ?? w.AvgTokenLatency),
    p95TokenLatency: num(w.p95TokenLatency ?? w.P95TokenLatency),
    totalTokens: num(w.totalTokens ?? w.TotalTokens),
    totalCost: num(w.totalCost ?? w.TotalCost),
    rpm: num(w.rpm ?? w.Rpm),
    bucketSizeSec: num(w.bucketSizeSec ?? w.BucketSizeSec) || 3600,
    buckets: Array.isArray(bucketsRaw)
      ? bucketsRaw.map((row) => {
          const b = row as Record<string, unknown>;
          return {
            tsUtc: num(b.tsUtc ?? b.TsUtc),
            calls: num(b.calls ?? b.Calls),
            errors: num(b.errors ?? b.Errors),
            cost: num(b.cost ?? b.Cost),
            tokens: num(b.tokens ?? b.Tokens),
          };
        })
      : [],
    topModels: Array.isArray(topModelsRaw)
      ? topModelsRaw.map((row) => {
          const m = row as Record<string, unknown>;
          return {
            modelName: String(m.modelName ?? m.ModelName ?? ''),
            calls: num(m.calls ?? m.Calls),
            cost: num(m.cost ?? m.Cost),
            errorRate: num(m.errorRate ?? m.ErrorRate),
          };
        })
      : [],
    topProviders: Array.isArray(topVendorsRaw)
      ? topVendorsRaw.map((row) => {
          const v = row as Record<string, unknown>;
          const vendorKey = String(v.vendorKey ?? v.VendorKey ?? '');
          return {
            vendorKey,
            providerName: vendorKey,
            calls: num(v.calls ?? v.Calls),
            errors: num(v.errors ?? v.Errors),
            avgTokenLatency: 0,
          };
        })
      : [],
    errorCodes: Array.isArray(errorCodesRaw)
      ? errorCodesRaw.map((row) => {
          const e = row as Record<string, unknown>;
          return {
            code: String(e.code ?? e.Code ?? 'unknown'),
            count: num(e.count ?? e.Count),
          };
        })
      : [],
  };
}

export class TavernUsageStatsHttpAdapter implements TavernUsageStatsPort {
  async stats(filter: TavernUsageStatsFilter): Promise<AppResult<TavernUsageStats>> {
    const res = await requestTavern<unknown>(BASE, {
      query: {
        fromUtc: filter.fromUtc,
        toUtc: filter.toUtc,
      },
    });
    if (!res.success) return res;
    return ok(mapOverviewWire(res.data));
  }
}
