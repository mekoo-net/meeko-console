import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { clientPaginate } from '@/shared/composables/usePagination';
import { delay } from '@/shared/lib/delay';

import { logStatusValues, type LogStatus } from '../../model/enums';
import {
  logEntrySchema,
  type ListLogsFilter,
  type LogEntry,
  type LogStats,
  type LogStatsBucket,
  type LogStatsErrorCode,
  type LogStatsStatus,
  type LogStatsTopModel,
  type LogStatsTopProvider,
} from '../../model/log.types';
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

/**
 * 选 bucket 宽度：
 *  - span ≤ 2h  → 5 min
 *  - span ≤ 6h  → 15 min
 *  - span ≤ 24h → 1 h
 *  - span ≤ 3d  → 3 h
 *  - 其余        → 1 d
 */
function pickBucketSizeSec(spanMs: number): number {
  const hour = 60 * 60 * 1000;
  if (spanMs <= 2 * hour) return 5 * 60;
  if (spanMs <= 6 * hour) return 15 * 60;
  if (spanMs <= 24 * hour) return 60 * 60;
  if (spanMs <= 3 * 24 * hour) return 3 * 60 * 60;
  return 24 * 60 * 60;
}

function buildBuckets(
  rows: LogEntry[],
  fromMs: number,
  toMs: number,
  bucketSizeSec: number,
): LogStatsBucket[] {
  const sizeMs = bucketSizeSec * 1000;
  const count = Math.max(1, Math.ceil((toMs - fromMs) / sizeMs));
  const buckets: LogStatsBucket[] = [];
  for (let i = 0; i < count; i += 1) {
    buckets.push({
      tsUtc: new Date(fromMs + i * sizeMs).toISOString(),
      calls: 0,
      errors: 0,
      cost: 0,
      tokens: 0,
    });
  }
  for (const r of rows) {
    const t = Date.parse(r.occurredAtUtc);
    if (!Number.isFinite(t)) continue;
    const idx = Math.min(count - 1, Math.max(0, Math.floor((t - fromMs) / sizeMs)));
    const b = buckets[idx];
    if (!b) continue;
    b.calls += 1;
    if (r.status !== 'ok') b.errors += 1;
    b.cost += r.totalCost;
    b.tokens += r.totalTokens;
  }
  for (const b of buckets) b.cost = Math.round(b.cost * 10000) / 10000;
  return buckets;
}

function buildStatusBreakdown(rows: LogEntry[]): LogStatsStatus[] {
  const counts = new Map<LogStatus, number>();
  for (const s of logStatusValues) counts.set(s, 0);
  for (const r of rows) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  return logStatusValues.map((status) => ({ status, count: counts.get(status) ?? 0 }));
}

function buildTopModels(rows: LogEntry[], limit = 5): LogStatsTopModel[] {
  type Agg = { calls: number; cost: number; errors: number };
  const m = new Map<string, Agg>();
  for (const r of rows) {
    const a = m.get(r.modelId) ?? { calls: 0, cost: 0, errors: 0 };
    a.calls += 1;
    a.cost += r.totalCost;
    if (r.status !== 'ok') a.errors += 1;
    m.set(r.modelId, a);
  }
  return [...m.entries()]
    .map<LogStatsTopModel>(([modelId, a]) => ({
      modelId,
      calls: a.calls,
      cost: Math.round(a.cost * 10000) / 10000,
      errorRate: a.calls === 0 ? 0 : a.errors / a.calls,
    }))
    .sort((x, y) => y.calls - x.calls)
    .slice(0, limit);
}

function buildTopProviders(rows: LogEntry[], limit = 5): LogStatsTopProvider[] {
  type Agg = { calls: number; errors: number; latencySum: number };
  const m = new Map<string, Agg>();
  for (const r of rows) {
    const a = m.get(r.providerUid) ?? { calls: 0, errors: 0, latencySum: 0 };
    a.calls += 1;
    if (r.status !== 'ok') a.errors += 1;
    a.latencySum += r.latencyMs;
    m.set(r.providerUid, a);
  }
  return [...m.entries()]
    .map<LogStatsTopProvider>(([providerUid, a]) => ({
      providerUid,
      calls: a.calls,
      errors: a.errors,
      avgLatencyMs: a.calls === 0 ? 0 : Math.round(a.latencySum / a.calls),
    }))
    .sort((x, y) => y.calls - x.calls)
    .slice(0, limit);
}

function buildErrorCodes(rows: LogEntry[], limit = 5): LogStatsErrorCode[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    if (r.status === 'ok') continue;
    const code = r.errorCode?.trim() || 'unknown';
    m.set(code, (m.get(code) ?? 0) + 1);
  }
  const all = [...m.entries()]
    .map<LogStatsErrorCode>(([code, count]) => ({ code, count }))
    .sort((x, y) => y.count - x.count);
  if (all.length <= limit) return all;
  const top = all.slice(0, limit - 1);
  const rest = all.slice(limit - 1);
  const otherCount = rest.reduce((s, e) => s + e.count, 0);
  if (otherCount > 0) top.push({ code: 'other', count: otherCount });
  return top;
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

    // 时间范围用于分桶 + RPM：filter 没传时回退到 logs 的覆盖区间或最近 24h
    const now = Date.now();
    const fromMs = filter.fromUtc ? Date.parse(filter.fromUtc) : now - 24 * 60 * 60 * 1000;
    const toMs = filter.toUtc ? Date.parse(filter.toUtc) : now;
    const spanMs = Math.max(toMs - fromMs, 60 * 1000);
    const bucketSizeSec = pickBucketSizeSec(spanMs);

    if (totalCalls === 0) {
      return ok({
        totalCalls: 0,
        successCalls: 0,
        errorCalls: 0,
        avgLatencyMs: 0,
        p95LatencyMs: 0,
        totalTokens: 0,
        totalCost: 0,
        rpm: 0,
        bucketSizeSec,
        buckets: buildBuckets([], fromMs, toMs, bucketSizeSec),
        statusBreakdown: buildStatusBreakdown([]),
        topModels: [],
        topProviders: [],
        errorCodes: [],
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

    const rpm = Math.round((totalCalls / (spanMs / 1000 / 60)) * 100) / 100;

    return ok({
      totalCalls,
      successCalls,
      errorCalls,
      avgLatencyMs: Math.round(latencySum / totalCalls),
      p95LatencyMs: percentile(latencies, 0.95),
      totalTokens,
      totalCost: Math.round(totalCost * 10000) / 10000,
      rpm,
      bucketSizeSec,
      buckets: buildBuckets(filtered, fromMs, toMs, bucketSizeSec),
      statusBreakdown: buildStatusBreakdown(filtered),
      topModels: buildTopModels(filtered),
      topProviders: buildTopProviders(filtered),
      errorCodes: buildErrorCodes(filtered),
    });
  }
}
