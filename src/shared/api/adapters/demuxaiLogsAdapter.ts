import type { AppResult } from '@/shared/api/httpTypes';
import { fail } from '@/shared/api/httpTypes';
import { requestDemuxAi, type ItemsEnvelope } from '@/shared/api/httpClient';

import { logEntrySchema } from '@/features/demuxai/model/log.types';
import type {
  ListLogsFilter,
  LogEntry,
  LogStats,
  ReverseLogInput,
  ReverseLogResult,
} from '@/features/demuxai/model/log.types';
import type {
  DemuxaiLogsPort,
  ListLogsPage,
} from '@/features/demuxai/services/ports/demuxaiLogsPort';

const BASE = '/demuxai/api/admin/logs';

/** 后端 AiLogStatDto（daily 聚合行）形状。 */
interface DailyRow {
  dateUtc: string;
  requestCount: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalQuota: number;
}

/**
 * 将后端原始日志行映射为前端 LogEntry 形状：
 *  - `account.iamUserUid` → `account.iamId`（后端字段名与前端 schema 不同）
 *  - 对 logEntrySchema 做 safeParse；解析失败时返回原始对象（兜底显示，不崩页面）
 */
function mapRawItem(raw: unknown): LogEntry {
  if (!raw || typeof raw !== 'object') return raw as LogEntry;
  const r = raw as Record<string, unknown>;
  const account = r['account'];
  const remapped = {
    ...r,
    account:
      account && typeof account === 'object'
        ? {
            uid: (account as Record<string, unknown>)['uid'],
            iamId: (account as Record<string, unknown>)['iamUserUid'] ?? null,
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

/** 将 AiLogStatDto[] 聚合成前端 LogStats（stats API 暂未提供完整 KPI）。 */
function aggregateDailyRows(rows: DailyRow[]): LogStats {
  const totalCalls    = rows.reduce((s, d) => s + d.requestCount, 0);
  const totalTokens   = rows.reduce((s, d) => s + d.totalPromptTokens + d.totalCompletionTokens, 0);
  const totalCost     = rows.reduce((s, d) => s + d.totalQuota, 0);

  return {
    totalCalls,
    successCalls:     totalCalls,   // stats 仅含 success 行
    errorCalls:       0,
    avgTokenLatency:  0,
    p95TokenLatency:  0,
    totalTokens,
    totalCost,
    rpm:              0,
    bucketSizeSec:    86400,
    buckets: rows.map((d) => ({
      tsUtc:   d.dateUtc,
      calls:   d.requestCount,
      errors:  0,
      cost:    d.totalQuota,
      tokens:  d.totalPromptTokens + d.totalCompletionTokens,
    })),
    topModels:     [],
    topProviders:  [],
    errorCodes:    [],
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
        iamUserUid: filter.iamId      || undefined,
        providerId: filter.providerId,
        apiType:    filter.apiType    || undefined,
        convId:     filter.convId     || undefined,
        modelName:  filter.modelName  || undefined,
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

  async stats(filter: ListLogsFilter): Promise<AppResult<LogStats>> {
    const result = await requestDemuxAi<ItemsEnvelope<DailyRow>>(`${BASE}/stats`, {
      query: {
        fromUtc:    filter.fromUtc,
        toUtc:      filter.toUtc,
        accountUid: filter.accountUid || undefined,
        iamUserUid: filter.iamId      || undefined,
        modelName:  filter.modelName  || undefined,
      },
    });
    if (!result.success) return result;
    return { success: true, data: aggregateDailyRows(result.data.items) };
  }

  async reverse(_input: ReverseLogInput): Promise<AppResult<ReverseLogResult>> {
    // POST /demuxai/api/admin/logs/{logId}/reverse 尚未在后端实现。
    return fail({ code: 'unknown', message: '驳回端点尚未实现（BFF 待补 logId → billId 解析）' });
  }
}
