import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { clientPaginate } from '@/shared/composables/usePagination';
import { delay } from '@/shared/lib/delay';

import {
  logEntrySchema,
  type VendorConsumptionRow,
  type ListLogsFilter,
  type LogEntry,
  type LogStats,
  type LogStatsBucket,
  type LogStatsErrorCode,
  type LogStatsTopModel,
  type LogStatsTopProvider,
  type ReverseLogInput,
  type ReverseLogResult,
} from '@demux/common';
import type { DemuxLogsPort, ListLogsPage } from '../ports/demuxLogsPort';

import { getDemuxStore } from './data';

/** Mock 环境约定的"当前 admin"。真接 BFF 时由后端 session 取代。 */
const MOCK_ADMIN_IAM_UID = '200000099';

function applyFilter(rows: LogEntry[], f: ListLogsFilter): LogEntry[] {
  return rows.filter((r) => {
    if (f.accountUid && r.account.uid !== f.accountUid) return false;
    if (f.iamUid && r.account.iamUid !== f.iamUid) return false;
    if (f.modelName && !r.modelName.toLowerCase().includes(f.modelName.toLowerCase())) return false;
    if (f.vendorKey && vendorOf(r).toLowerCase() !== f.vendorKey.toLowerCase()) return false;
    if (f.providerId != null && r.providerId !== f.providerId) return false;
    if (f.protocol && r.protocol !== f.protocol) return false;
    if (f.convId && r.convId !== f.convId) return false;
    if (f.logId && r.id !== f.logId.trim()) return false;
    if (f.traceId) {
      const trace = f.traceId.trim();
      if ((r.traceId ?? '') !== trace) return false;
    }
    if (f.billUid) {
      const uid = f.billUid.trim();
      if (!r.bill || r.bill.id !== uid) return false;
    }
    if (f.contactKeyword?.trim()) {
      const kw = f.contactKeyword.trim().toLowerCase();
      const email = (r.account.email ?? '').toLowerCase();
      const phone = r.account.phone ?? '';
      const name = (r.account.displayName ?? '').toLowerCase();
      if (!email.includes(kw) && !phone.includes(kw) && !name.includes(kw)) return false;
    }
    if (f.errorOnly && r.success) return false;
    if (f.errorCode) {
      if (r.success) return false;
      if (r.error?.code !== f.errorCode) return false;
    }
    const skipTime = Boolean(f.logId?.trim() || f.traceId?.trim() || f.billUid?.trim());
    if (!skipTime && f.fromUtc != null) {
      if (r.createAt < f.fromUtc) return false;
    }
    if (!skipTime && f.toUtc != null) {
      if (r.createAt > f.toUtc) return false;
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
 * 取日志所属渠道：优先用快照绑定的 `vendorKey`；
 * Mock 旧种子数据没有该字段时，退化为 `vendor/model` 形态的 vendor 前缀。
 */
function vendorOf(row: LogEntry): string {
  if (row.vendorKey && row.vendorKey.trim()) return row.vendorKey.trim();
  const i = row.modelName.indexOf('/');
  return i > 0 ? row.modelName.slice(0, i) : row.modelName;
}

/** per_token 输入 / 输出 token 拆分（非 token 类型记 0）。 */
function promptCompletionOf(row: LogEntry): { prompt: number; completion: number } {
  if (row.billingType !== 'per_token') return { prompt: 0, completion: 0 };
  return { prompt: row.usage.input.tokens, completion: row.usage.output.tokens };
}

/** 概览趋势固定按小时分桶（与后端 StatDailyAsync 口径一致）。 */
const HOUR_SEC = 60 * 60;
const HOUR_MS = HOUR_SEC * 1000;

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
      tsUtc: fromMs + i * sizeMs,
      calls: 0,
      errors: 0,
      cost: 0,
      tokens: 0,
    });
  }
  for (const r of rows) {
    const t = r.createAt;
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
    if (r.providerId == null) continue;
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
    .map<LogStatsTopProvider>(([providerId, a]) => {
      const provider = getDemuxStore().providers.find((p) => p.id === providerId);
      return {
        providerId,
        providerName: provider?.name,
        calls: a.calls,
        errors: a.errors,
        avgTokenLatency:
          a.ttftSamples === 0 ? 0 : Math.round(a.ttftSum / a.ttftSamples),
      };
    })
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

export class DemuxLogsMock implements DemuxLogsPort {
  private get store() {
    return getDemuxStore();
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

  async reverse(input: ReverseLogInput): Promise<AppResult<ReverseLogResult>> {
    await delay();
    const target = this.store.logs.find((l) => l.id === input.logId);
    if (!target) {
      return fail({ code: 'not_found', message: `日志 ${input.logId} 不存在` });
    }
    if (!target.bill) {
      return fail({
        code: 'validation',
        message: '该日志未关联账单，无法驳回（可能是历史数据 / BFF 尚未 join）',
      });
    }
    if (target.bill.status === 'reversed') {
      return fail({
        code: 'conflict',
        message: '该账单已被驳回，请勿重复操作',
      });
    }
    const reversedAtUtc = Date.now();
    target.bill = {
      id: target.bill.id,
      status: 'reversed',
      reversal: {
        atUtc: reversedAtUtc,
        by: MOCK_ADMIN_IAM_UID,
        code: input.reasonCode,
        remark: input.remark?.trim() || null,
      },
    };
    return ok({
      logId: target.id,
      billId: target.bill.id,
      reversedAtUtc,
      reversedBy: MOCK_ADMIN_IAM_UID,
      reversedCode: input.reasonCode,
    });
  }

  async stats(filter: ListLogsFilter): Promise<AppResult<LogStats>> {
    await delay();
    const filtered = applyFilter(this.store.logs, filter);
    const totalCalls = filtered.length;

    // 时间范围用于分桶 + RPM：filter 没传时回退到 logs 的覆盖区间或最近 24h。
    // 固定小时桶：起点向下取整到整点，保证桶落在 HH:00 且横轴连续。
    const now = Date.now();
    const rawFromMs = filter.fromUtc ?? now - 24 * HOUR_MS;
    const toMs = filter.toUtc ?? now;
    const fromMs = Math.floor(rawFromMs / HOUR_MS) * HOUR_MS;
    const spanMs = Math.max(toMs - fromMs, 60 * 1000);
    const bucketSizeSec = HOUR_SEC;

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

  async statByVendor(filter: ListLogsFilter): Promise<AppResult<VendorConsumptionRow[]>> {
    await delay();
    // 只统计成功调用，与后端 StatByVendorAsync 口径一致。
    const filtered = applyFilter(this.store.logs, filter).filter((r) => r.success);

    type Agg = {
      requestCount: number;
      prompt: number;
      completion: number;
      cost: number;
      upstreams: Set<string>;
    };
    const m = new Map<string, Agg>();
    for (const r of filtered) {
      const key = vendorOf(r);
      const a = m.get(key) ?? { requestCount: 0, prompt: 0, completion: 0, cost: 0, upstreams: new Set<string>() };
      const { prompt, completion } = promptCompletionOf(r);
      a.requestCount += 1;
      a.prompt += prompt;
      a.completion += completion;
      a.cost += r.cost.total;
      const upstream = r.vendorModel?.trim() || r.modelName;
      if (upstream) a.upstreams.add(upstream);
      m.set(key, a);
    }

    const rows = [...m.entries()]
      .map<VendorConsumptionRow>(([vendorKey, a]) => ({
        vendorKey,
        requestCount: a.requestCount,
        totalPromptTokens: a.prompt,
        totalCompletionTokens: a.completion,
        totalCost: Math.round(a.cost * 10000) / 10000,
        upstreamModelCount: a.upstreams.size,
      }))
      .sort((x, y) => y.totalCost - x.totalCost);

    return ok(rows);
  }
}
