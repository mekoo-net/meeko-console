import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { clientPaginate } from '@/shared/composables/usePagination';
import { delay } from '@/shared/lib/delay';

import {
  logEntrySchema,
  type ListLogsFilter,
  type LogEntry,
  type LogStats,
  type LogStatsBucket,
  type LogStatsErrorCode,
  type LogStatsTopModel,
  type LogStatsTopProvider,
} from '../../model/log.types';
import type { DemuxaiLogsPort, ListLogsPage } from '../ports/demuxaiLogsPort';

import { getDemuxaiStore } from './data';

function applyFilter(rows: LogEntry[], f: ListLogsFilter): LogEntry[] {
  return rows.filter((r) => {
    if (f.accountUid && r.account.uid !== f.accountUid) return false;
    if (f.iamId && r.account.iamId !== f.iamId) return false;
    if (f.modelName && !r.modelName.toLowerCase().includes(f.modelName.toLowerCase())) return false;
    if (f.providerId != null && r.providerId !== f.providerId) return false;
    if (f.apiType && r.apiType !== f.apiType) return false;
    if (f.convId && r.convId !== f.convId) return false;
    if (f.errorOnly && r.success) return false;
    if (f.errorCode) {
      if (r.success) return false;
      if (r.error?.code !== f.errorCode) return false;
    }
    if (f.fromUtc) {
      if (Date.parse(r.createAt) < Date.parse(f.fromUtc)) return false;
    }
    if (f.toUtc) {
      if (Date.parse(r.createAt) > Date.parse(f.toUtc)) return false;
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

/** 只有 per_token 才有"token 数"概念；非 token 类型返回 0（不计入 token 聚合）。 */
function tokenCountOf(row: LogEntry): number {
  return row.billingType === 'per_token' ? row.usage.totalTokens : 0;
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
    const t = Date.parse(r.createAt);
    if (!Number.isFinite(t)) continue;
    const idx = Math.min(count - 1, Math.max(0, Math.floor((t - fromMs) / sizeMs)));
    const b = buckets[idx];
    if (!b) continue;
    b.calls += 1;
    if (!r.success) b.errors += 1;
    b.cost += r.cost.total;
    b.tokens += tokenCountOf(r);
  }
  for (const b of buckets) b.cost = Math.round(b.cost * 10000) / 10000;
  return buckets;
}

function buildTopModels(rows: LogEntry[], limit = 5): LogStatsTopModel[] {
  type Agg = { calls: number; cost: number; errors: number };
  const m = new Map<string, Agg>();
  for (const r of rows) {
    const a = m.get(r.modelName) ?? { calls: 0, cost: 0, errors: 0 };
    a.calls += 1;
    a.cost += r.cost.total;
    if (!r.success) a.errors += 1;
    m.set(r.modelName, a);
  }
  return [...m.entries()]
    .map<LogStatsTopModel>(([modelName, a]) => ({
      modelName,
      calls: a.calls,
      cost: Math.round(a.cost * 10000) / 10000,
      errorRate: a.calls === 0 ? 0 : a.errors / a.calls,
    }))
    .sort((x, y) => y.calls - x.calls)
    .slice(0, limit);
}

function buildTopProviders(rows: LogEntry[], limit = 5): LogStatsTopProvider[] {
  type Agg = { calls: number; errors: number; ttftSum: number; ttftSamples: number };
  const m = new Map<number, Agg>();
  for (const r of rows) {
    const a = m.get(r.providerId) ?? { calls: 0, errors: 0, ttftSum: 0, ttftSamples: 0 };
    a.calls += 1;
    if (!r.success) a.errors += 1;
    // 仅 streamed && success 的样本进入 TTFT 聚合（与 LogStats 口径一致）
    if (r.success && r.streamed && r.tokenLatency != null) {
      a.ttftSum += r.tokenLatency;
      a.ttftSamples += 1;
    }
    m.set(r.providerId, a);
  }
  return [...m.entries()]
    .map<LogStatsTopProvider>(([providerId, a]) => ({
      providerId,
      calls: a.calls,
      errors: a.errors,
      avgTokenLatency:
        a.ttftSamples === 0 ? 0 : Math.round(a.ttftSum / a.ttftSamples),
    }))
    .sort((x, y) => y.calls - x.calls)
    .slice(0, limit);
}

function buildErrorCodes(rows: LogEntry[], limit = 5): LogStatsErrorCode[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    if (r.success) continue;
    const code = r.error?.code.trim() || 'unknown';
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
        avgTokenLatency: 0,
        p95TokenLatency: 0,
        totalTokens: 0,
        totalCost: 0,
        rpm: 0,
        bucketSizeSec,
        buckets: buildBuckets([], fromMs, toMs, bucketSizeSec),
        topModels: [],
        topProviders: [],
        errorCodes: [],
      });
    }

    let successCalls = 0;
    let errorCalls = 0;
    let totalTokens = 0;
    let totalCost = 0;
    let ttftSum = 0;
    const ttftSamples: number[] = [];
    for (const r of filtered) {
      if (r.success) successCalls += 1;
      else errorCalls += 1;
      totalTokens += tokenCountOf(r);
      totalCost += r.cost.total;
      // 仅 streamed && success 的 tokenLatency 是 TTFT 语义；非流式 / 失败不入聚合
      if (r.success && r.streamed && r.tokenLatency != null) {
        ttftSum += r.tokenLatency;
        ttftSamples.push(r.tokenLatency);
      }
    }

    const rpm = Math.round((totalCalls / (spanMs / 1000 / 60)) * 100) / 100;

    return ok({
      totalCalls,
      successCalls,
      errorCalls,
      avgTokenLatency:
        ttftSamples.length === 0 ? 0 : Math.round(ttftSum / ttftSamples.length),
      p95TokenLatency: percentile(ttftSamples, 0.95),
      totalTokens,
      totalCost: Math.round(totalCost * 10000) / 10000,
      rpm,
      bucketSizeSec,
      buckets: buildBuckets(filtered, fromMs, toMs, bucketSizeSec),
      topModels: buildTopModels(filtered),
      topProviders: buildTopProviders(filtered),
      errorCodes: buildErrorCodes(filtered),
    });
  }
}
