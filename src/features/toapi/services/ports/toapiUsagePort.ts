import type { AppResult } from '@/shared/api/httpTypes';

import type { ListUsageLogsFilter, UsageLog, UsageLogStats } from '../../model/usage.types';

export interface ListUsageLogsPage {
  items: UsageLog[];
  total: number;
}

/**
 * ToApi 调用日志（占用单读模型）。
 *
 * - 必须带 `fromUtc / toUtc`（最长 7 天），精确 traceId 检索时例外；缺省时 HttpAdapter 拒绝，避免全表扫
 * - 默认 createdAtUtc DESC，pageSize ≤ 100
 * - stats 与 list 同 filter
 */
export interface ToApiUsagePort {
  list(input: { page: number; pageSize: number; filter: ListUsageLogsFilter }): Promise<AppResult<ListUsageLogsPage>>;
  stats(filter: ListUsageLogsFilter): Promise<AppResult<UsageLogStats>>;
}
