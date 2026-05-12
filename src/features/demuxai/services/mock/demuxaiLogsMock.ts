import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { clientPaginate } from '@/shared/composables/usePagination';
import { delay } from '@/shared/lib/delay';

import { logEntrySchema, type ListLogsFilter, type LogEntry, type LogStats } from '../../model/log.types';
import type { DemuxaiLogsPort, ListLogsPage } from '../ports/demuxaiLogsPort';

import { getDemuxaiStore } from './data';

function applyFilter(rows: LogEntry[], f: ListLogsFilter): LogEntry[] {
  return rows.filter((r) => {
    if (f.accountUid && r.accountUid !== f.accountUid) return false;
    if (f.iamUserUid && r.iamUserUid !== f.iamUserUid) return false;
    if (f.modelId && !r.modelId.toLowerCase().includes(f.modelId.toLowerCase())) return false;
    if (f.providerUid && r.providerUid !== f.providerUid) return false;
    if (f.apiType && r.apiType !== f.apiType) return false;
    if (f.status !== 'all' && r.status !== f.status) return false;
    if (f.errorOnly && r.status === 'ok') return false;
    if (f.fromUtc) {
      if (Date.parse(r.occurredAtUtc) < Date.parse(f.fromUtc)) return false;
    }
    if (f.toUtc) {
      if (Date.parse(r.occurredAtUtc) > Date.parse(f.toUtc)) return false;
    }
    return true;
  });
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[idx] ?? 0;
}

export class DemuxaiLogsMock implements DemuxaiLogsPort {
  private get store() {
    return getDemuxaiStore();
  }

  async list(input: {
    page: number;
    pageSize: number;
    filter: ListLogsFilter;
  }): Promise<AppResult<ListLogsPage>> {
    await delay();
    if (input.pageSize > 100) {
      return fail({ code: 'validation', message: '每页最多 100 条' });
    }
    const filtered = applyFilter(this.store.logs, input.filter);
    const slice = clientPaginate(filtered, input.page, input.pageSize);
    const parsed: LogEntry[] = [];
    for (const it of slice) {
      const r = logEntrySchema.safeParse(it);
      if (!r.success) continue;
      parsed.push(r.data);
    }
    return ok({ items: parsed, total: filtered.length });
  }

  async stats(filter: ListLogsFilter): Promise<AppResult<LogStats>> {
    await delay();
    const filtered = applyFilter(this.store.logs, filter);
    const totalCalls = filtered.length;
    if (totalCalls === 0) {
      return ok({
        totalCalls: 0,
        successCalls: 0,
        errorCalls: 0,
        avgLatencyMs: 0,
        p95LatencyMs: 0,
        totalTokens: 0,
        totalCost: 0,
      });
    }
    let successCalls = 0;
    let errorCalls = 0;
    let totalTokens = 0;
    let totalCost = 0;
    let latencySum = 0;
    const latencies: number[] = [];
    for (const r of filtered) {
      if (r.status === 'ok') successCalls += 1;
      else errorCalls += 1;
      totalTokens += r.totalTokens;
      totalCost += r.totalCost;
      latencySum += r.latencyMs;
      latencies.push(r.latencyMs);
    }
    return ok({
      totalCalls,
      successCalls,
      errorCalls,
      avgLatencyMs: Math.round(latencySum / totalCalls),
      p95LatencyMs: percentile(latencies, 0.95),
      totalTokens,
      totalCost: Math.round(totalCost * 10000) / 10000,
    });
  }
}
