import type { AppResult, ErrorCode } from '@/shared/api/httpTypes';
import { fail } from '@/shared/api/httpTypes';
import { requestDemuxAi, type ItemsEnvelope } from '@/shared/api/httpClient';
import { asEpochMillis } from '@/shared/lib/epoch';

import { logEntrySchema } from '@demux/common';
import type {
  VendorConsumptionRow,
  ListLogsFilter,
  LogEntry,
  LogStats,
  LogStatsErrorCode,
  LogStatsTopModel,
  LogStatsTopProvider,
  ReverseLogInput,
  ReverseLogResult,
} from '@demux/common';
import type {
  DemuxaiLogsPort,
  ListLogsPage,
} from '@/features/demuxai/services/ports/demuxaiLogsPort';

const BASE = '/demuxai/api/admin/logs';

function mapFailureCode(code: string | null | undefined): ErrorCode {
  switch (code) {
    case 'validation':
    case 'not_found':
    case 'conflict':
    case 'upstream':
    case 'forbidden':
    case 'unauthorized':
      return code;
    default:
      return 'unknown';
  }
}

/**
 * 后端 AiLogStatDto（时间序列分桶聚合行）形状。桶宽自适应：3600=按小时 / 86400=按天。
 *
 * 字段全部可选并保留旧字段 `dateUtc`：新后端发 `bucketStartUtc`/`errorCount`/`bucketSeconds`，
 * 旧后端（未重启）只发 `dateUtc`/`requestCount`。适配层统一兜底，避免版本不一致时出 NaN / 空轴。
 */
interface BucketRow {
  bucketStartUtc?: number;
  /** 旧后端字段名（按天聚合）；新后端已改为 bucketStartUtc。 */
  dateUtc?: number;
  bucketSeconds?: number;
  requestCount?: number;
  errorCount?: number;
  totalPromptTokens?: number;
  totalCompletionTokens?: number;
  totalQuota?: number;
}

/** 安全数值：非有限数（undefined / null / NaN）一律归 0，杜绝 NaN 透传到 UI。 */
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** 桶起点（毫秒）；兼容新旧字段名。 */
function bucketTs(d: BucketRow): number {
  return num(d.bucketStartUtc ?? d.dateUtc);
}

/** 后端未给桶宽时，按相邻桶时间差推断；推不出则按天兜底。 */
function inferBucketSizeSec(rows: BucketRow[]): number {
  for (let i = 1; i < rows.length; i += 1) {
    const diff = Math.round((bucketTs(rows[i]!) - bucketTs(rows[i - 1]!)) / 1000);
    if (diff > 0) return diff;
  }
  return 86400;
}

/** 后端 AiVendorStatDto（按渠道聚合行）形状。 */
interface VendorRow {
  vendorKey: string;
  requestCount: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalQuota: number;
  upstreamModelCount: number;
}

interface ModelRankRow {
  modelName?: string;
  requestCount?: number;
  totalQuota?: number;
  errorCount?: number;
}

interface ProviderRankRow {
  providerId?: number;
  providerName?: string;
  requestCount?: number;
  errorCount?: number;
  avgTokenLatencyMs?: number;
}

interface ErrorCodeRow {
  code?: string;
  count?: number;
}

interface LatencyStat {
  avgTokenLatencyMs?: number;
  p95TokenLatencyMs?: number;
}

/**
 * 将后端原始日志行映射为前端 LogEntry 形状：
 *  - account.iamUid 由后端 wire `iamUserUid` 映射改名；仅做防御性归一
 *  - 对 logEntrySchema 做 safeParse；解析失败时返回原始对象（兜底显示，不崩页面）
 */
function mapRawItem(raw: unknown): LogEntry {
  if (!raw || typeof raw !== 'object') return raw as LogEntry;
  const r = raw as Record<string, unknown>;
  const account = r['account'];
  const remapped: Record<string, unknown> = {
    ...r,
    account:
      account && typeof account === 'object'
        ? {
            uid: (account as Record<string, unknown>)['uid'],
            iamUid: (account as Record<string, unknown>)['iamUserUid'] ?? null,
            displayName: (account as Record<string, unknown>)['displayName'] ?? undefined,
            email: (account as Record<string, unknown>)['email'] ?? undefined,
            phone: (account as Record<string, unknown>)['phone'] ?? undefined,
          }
        : account,
  };

  const parsed = logEntrySchema.safeParse(remapped);
  if (!parsed.success) {
    // 只打第一条错误，避免日志污染；实际数据仍返回（让列表能显示其他字段）
    console.warn('[DemuxaiLogsAdapter] parse error', parsed.error.issues[0], remapped);
    return remapped as unknown as LogEntry;
  }
  return parsed.data;
}

const TOP_RANK_LIMIT = 5;

function mapTopModels(rows: ModelRankRow[]): LogStatsTopModel[] {
  return rows.slice(0, TOP_RANK_LIMIT).map((r) => {
    const calls = num(r.requestCount);
    const errors = num(r.errorCount);
    return {
      modelName: typeof r.modelName === 'string' ? r.modelName : '',
      calls,
      cost: num(r.totalQuota),
      errorRate: calls === 0 ? 0 : errors / calls,
    };
  });
}

function mapTopProviders(rows: ProviderRankRow[]): LogStatsTopProvider[] {
  return rows.slice(0, TOP_RANK_LIMIT).map((r) => ({
    providerId: num(r.providerId),
    providerName: typeof r.providerName === 'string' ? r.providerName : undefined,
    calls: num(r.requestCount),
    errors: num(r.errorCount),
    avgTokenLatency: num(r.avgTokenLatencyMs),
  }));
}

/** 错误码分布：后端已按次数降序返回；超出 Top5 的合并为 `other`（与状态环形图口径一致）。 */
function mapErrorCodes(rows: ErrorCodeRow[]): LogStatsErrorCode[] {
  const all = rows
    .map<LogStatsErrorCode>((r) => ({
      code: typeof r.code === 'string' && r.code.trim() ? r.code.trim() : 'unknown',
      count: num(r.count),
    }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
  if (all.length <= TOP_RANK_LIMIT) return all;
  const top = all.slice(0, TOP_RANK_LIMIT - 1);
  const otherCount = all.slice(TOP_RANK_LIMIT - 1).reduce((s, e) => s + e.count, 0);
  if (otherCount > 0) top.push({ code: 'other', count: otherCount });
  return top;
}

/**
 * 区间平均 RPM：区间总调用数 ÷ 区间分钟数。
 * 跨度优先用 filter 的 from/to；缺失时退化为分桶覆盖的跨度（桶数 × 桶宽）。
 */
function computeRpm(totalCalls: number, filter: ListLogsFilter, buckets: BucketRow[]): number {
  let spanMs = 0;
  if (typeof filter.fromUtc === 'number' && typeof filter.toUtc === 'number') {
    spanMs = filter.toUtc - filter.fromUtc;
  }
  if (spanMs <= 0 && buckets.length > 0) {
    spanMs = buckets.length * (num(buckets[0]?.bucketSeconds) || inferBucketSizeSec(buckets)) * 1000;
  }
  const spanMin = Math.max(spanMs, 60_000) / 60_000;
  return Math.round((totalCalls / spanMin) * 100) / 100;
}

/** 将 AiLogStatDto[]（分桶序列）聚合成前端 LogStats（KPI / Top 排行 / 延迟由并行接口补齐）。 */
function aggregateBucketRows(
  rows: BucketRow[],
  filter: ListLogsFilter,
  topModels: LogStatsTopModel[],
  topProviders: LogStatsTopProvider[],
  errorCodes: LogStatsErrorCode[],
  latency: LatencyStat,
): LogStats {
  const totalCalls    = rows.reduce((s, d) => s + num(d.requestCount), 0);
  const errorCalls    = rows.reduce((s, d) => s + num(d.errorCount), 0);
  const totalTokens   = rows.reduce((s, d) => s + num(d.totalPromptTokens) + num(d.totalCompletionTokens), 0);
  const totalCost     = rows.reduce((s, d) => s + num(d.totalQuota), 0);
  const bucketSizeSec = num(rows[0]?.bucketSeconds) || inferBucketSizeSec(rows);

  return {
    totalCalls,
    successCalls:     Math.max(0, totalCalls - errorCalls),
    errorCalls,
    avgTokenLatency:  num(latency.avgTokenLatencyMs),
    p95TokenLatency:  num(latency.p95TokenLatencyMs),
    totalTokens,
    totalCost,
    rpm:              computeRpm(totalCalls, filter, rows),
    bucketSizeSec,
    buckets: rows.map((d) => ({
      tsUtc:   bucketTs(d),
      calls:   num(d.requestCount),
      errors:  num(d.errorCount),
      cost:    num(d.totalQuota),
      tokens:  num(d.totalPromptTokens) + num(d.totalCompletionTokens),
    })),
    topModels,
    topProviders,
    errorCodes,
  };
}

export class DemuxaiLogsHttpAdapter implements DemuxaiLogsPort {
  async list(input: {
    page: number;
    pageSize: number;
    filter: ListLogsFilter;
  }): Promise<AppResult<ListLogsPage>> {
    const { page, pageSize, filter } = input;
    const result = await requestDemuxAi<ItemsEnvelope<unknown>>(BASE, {
      query: {
        p:          page,
        pageSize,
        accountUid: filter.accountUid || undefined,
        iamUserUid: filter.iamUid || undefined,
        providerId: filter.providerId,
        apiType:    filter.apiType    || undefined,
        convId:     filter.convId     || undefined,
        modelName:  filter.modelName  || undefined,
        vendorKey: filter.vendorKey || undefined,
        errorOnly:  filter.errorOnly  || undefined,
        errorCode:  filter.errorCode  || undefined,
        fromUtc:    filter.fromUtc,
        toUtc:      filter.toUtc,
      },
    });
    if (!result.success) return result;
    const items = (result.data.items as unknown[]).map(mapRawItem);
    return { success: true, data: { items, total: result.data.total } };
  }

  async statByVendor(filter: ListLogsFilter): Promise<AppResult<VendorConsumptionRow[]>> {
    const result = await requestDemuxAi<ItemsEnvelope<VendorRow>>(`${BASE}/stats/by/vendor`, {
      query: {
        fromUtc:    filter.fromUtc,
        toUtc:      filter.toUtc,
        accountUid: filter.accountUid || undefined,
        vendorKey: filter.vendorKey || undefined,
      },
    });
    if (!result.success) return result;
    const rows = result.data.items.map((r): VendorConsumptionRow => ({
      vendorKey:            r.vendorKey,
      requestCount:          r.requestCount,
      totalPromptTokens:     r.totalPromptTokens,
      totalCompletionTokens: r.totalCompletionTokens,
      totalCost:             r.totalQuota,
      upstreamModelCount:    r.upstreamModelCount,
    }));
    return { success: true, data: rows };
  }

  async stats(filter: ListLogsFilter): Promise<AppResult<LogStats>> {
    const query = {
      fromUtc:    filter.fromUtc,
      toUtc:      filter.toUtc,
      accountUid: filter.accountUid || undefined,
      iamUserUid: filter.iamUid || undefined,
      modelName:  filter.modelName  || undefined,
    };

    const [bucketResult, modelResult, providerResult, errorCodeResult, latencyResult] = await Promise.all([
      requestDemuxAi<ItemsEnvelope<BucketRow>>(`${BASE}/stats`, { query }),
      requestDemuxAi<ItemsEnvelope<ModelRankRow>>(`${BASE}/stats/by/model`, { query }),
      requestDemuxAi<ItemsEnvelope<ProviderRankRow>>(`${BASE}/stats/by/provider`, { query }),
      requestDemuxAi<ItemsEnvelope<ErrorCodeRow>>(`${BASE}/stats/by/errorcode`, { query }),
      requestDemuxAi<LatencyStat>(`${BASE}/stats/latency`, { query }),
    ]);

    if (!bucketResult.success) return bucketResult;
    if (!modelResult.success) return modelResult;
    if (!providerResult.success) return providerResult;
    if (!errorCodeResult.success) return errorCodeResult;
    if (!latencyResult.success) return latencyResult;

    return {
      success: true,
      data: aggregateBucketRows(
        bucketResult.data.items,
        filter,
        mapTopModels(modelResult.data.items),
        mapTopProviders(providerResult.data.items),
        mapErrorCodes(errorCodeResult.data.items),
        latencyResult.data,
      ),
    };
  }

  async reverse(input: ReverseLogInput): Promise<AppResult<ReverseLogResult>> {
    const result = await requestDemuxAi<{
      success: boolean;
      billId?: string | null;
      reversedAtUtc?: number | null;
      reversedBy?: string | null;
      reversedCode?: string | null;
      failureCode?: string | null;
      failureMessage?: string | null;
    }>(`${BASE}/${input.logId}/reverse`, {
      method: 'POST',
      body: {
        reasonCode: input.reasonCode,
        remark: input.remark?.trim() || undefined,
      },
    });
    if (!result.success) return result;

    const row = result.data;
    if (!row.success) {
      return fail({
        code: mapFailureCode(row.failureCode),
        message: row.failureMessage ?? '驳回失败',
      });
    }

    return {
      success: true,
      data: {
        logId: input.logId,
        billId: row.billId ?? '',
        reversedAtUtc: asEpochMillis(row.reversedAtUtc) ?? Date.now(),
        reversedBy: row.reversedBy ?? '',
        reversedCode: (row.reversedCode ?? input.reasonCode) as ReverseLogResult['reversedCode'],
      },
    };
  }
}
