import type { AppResult } from '@/shared/api/httpTypes';
import { fail } from '@/shared/api/httpTypes';
import { requestDemuxAi, type ItemsEnvelope } from '@/shared/api/httpClient';

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

export class DemuxaiLogsHttpAdapter implements DemuxaiLogsPort {
  async list(input: {
    page: number;
    pageSize: number;
    filter: ListLogsFilter;
  }): Promise<AppResult<ListLogsPage>> {
    const { page, pageSize, filter } = input;
    const result = await requestDemuxAi<ItemsEnvelope<LogEntry>>(BASE, {
      query: {
        p: page,
        pageSize,
        accountUid: filter.accountUid,
        tokenUid: filter.iamId,
        modelName: filter.modelName,
        fromUtc: filter.fromUtc,
        toUtc: filter.toUtc,
      },
    });
    if (!result.success) return result;
    return { success: true, data: { items: result.data.items, total: result.data.total } };
  }

  async stats(filter: ListLogsFilter): Promise<AppResult<LogStats>> {
    const result = await requestDemuxAi<ItemsEnvelope<unknown>>(`${BASE}/stats`, {
      query: {
        fromUtc: filter.fromUtc,
        toUtc: filter.toUtc,
        accountUid: filter.accountUid,
        tokenUid: filter.iamId,
        modelName: filter.modelName,
      },
    });
    if (!result.success) return result;
    // BFF 当前只返回 daily rows；前端 LogStats 还有 KPI 聚合字段，暂用 daily 容器透传。
    return { success: true, data: { dailyRows: result.data.items } as unknown as LogStats };
  }

  async reverse(_input: ReverseLogInput): Promise<AppResult<ReverseLogResult>> {
    // BFF 尚未暴露 `POST /demuxai/api/admin/logs/{logId}/reverse`（需在网关侧 join bill 表）。
    return fail({ code: 'unknown', message: '驳回端点尚未实现（BFF 待补 logId → billId 解析）' });
  }
}
