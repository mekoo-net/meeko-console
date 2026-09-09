import { z } from 'zod';

import { requestToApi, type ItemsEnvelope } from '@/features/toapi/api/http';
import { toapiPaths } from '@/features/toapi/api/routes';
import {
  usageLogSchema,
  usageLogStatsSchema,
  type ListUsageLogsFilter,
  type UsageLogStats,
} from '@/features/toapi/model/usage.types';
import type { ListUsageLogsPage, ToApiUsagePort } from '@/features/toapi/services/ports/toapiUsagePort';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';

const MAX_RANGE_MS = 7 * 24 * 60 * 60 * 1000;

function buildQuery(filter: ListUsageLogsFilter): AppResult<Record<string, string | number | undefined>> {
  const traceId = filter.traceId?.trim();
  if (!traceId) {
    if (filter.fromUtc == null || filter.toUtc == null) {
      return fail({ code: 'validation', message: '请选择时间范围，或输入 TraceId' });
    }
    if (filter.toUtc - filter.fromUtc > MAX_RANGE_MS) {
      return fail({ code: 'validation', message: '时间范围最长 7 天' });
    }
  }
  return ok({
    accountUid: filter.accountUid?.trim() || undefined,
    contactKeyword: filter.contactKeyword?.trim() || undefined,
    fromUtc: traceId ? undefined : filter.fromUtc,
    toUtc: traceId ? undefined : filter.toUtc,
    vendorKey: filter.vendorKey?.trim() || undefined,
    modelName: filter.modelName?.trim() || undefined,
    traceId: traceId || undefined,
    status: filter.status && filter.status !== 'all' ? filter.status : undefined,
    tokenKind: filter.tokenKind && filter.tokenKind !== 'all' ? filter.tokenKind : undefined,
  });
}

export class ToApiUsageHttpAdapter implements ToApiUsagePort {
  async list(input: { page: number; pageSize: number; filter: ListUsageLogsFilter }): Promise<AppResult<ListUsageLogsPage>> {
    const q = buildQuery(input.filter);
    if (!q.success) return q;
    const res = await requestToApi<ItemsEnvelope<unknown>>(toapiPaths.usageLogs, {
      query: { ...q.data, page: input.page, pageSize: Math.min(input.pageSize, 100) },
    });
    if (!res.success) return res;
    const parsed = z.array(usageLogSchema).safeParse(res.data.items ?? []);
    if (!parsed.success) return fail({ code: 'validation', message: '调用日志响应格式错误' });
    return ok({ items: parsed.data, total: res.data.total ?? parsed.data.length });
  }

  async stats(filter: ListUsageLogsFilter): Promise<AppResult<UsageLogStats>> {
    const q = buildQuery(filter);
    if (!q.success) return q;
    const res = await requestToApi<unknown>(toapiPaths.usageStats, { query: q.data });
    if (!res.success) return res;
    const parsed = usageLogStatsSchema.safeParse(res.data);
    return parsed.success ? ok(parsed.data) : fail({ code: 'validation', message: '调用统计响应格式错误' });
  }
}
