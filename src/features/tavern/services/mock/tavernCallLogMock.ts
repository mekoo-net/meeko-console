import type { ItemsEnvelope } from '@/features/tavern/api/http';
import { ok, type AppResult } from '@/shared/api/httpTypes';
import { delay } from '@/shared/lib/delay';

import type { CallLogQuery, LogRow } from '../../model/metering.types';
import type { TavernCallLogPort } from '../ports/tavernCallLogPort';
import { isBilled, mockCalls, mockTurnsWithoutCalls, pageOf, toCallLog } from './tavernMeteringMockData';

export class TavernCallLogMock implements TavernCallLogPort {
  /** 同服务端 `ListAsync`：调用与没有调用明细的回合按时间合成一列；管线 / 模型 / 状态 / 只看平台承担时回合行不列。 */
  async list(query: CallLogQuery): Promise<AppResult<ItemsEnvelope<LogRow>>> {
    await delay();
    const model = query.model?.trim().toLowerCase();
    const inScope = (r: { createdAt: number; accountUid: number; traceId: string | null }) =>
      r.createdAt >= query.fromUtc &&
      r.createdAt <= query.toUtc &&
      (query.accountUid == null || r.accountUid === query.accountUid) &&
      (!query.traceId || r.traceId === query.traceId);

    const calls: LogRow[] = mockCalls()
      .filter(inScope)
      .filter((c) => !query.pipeline || c.pipeline.id === query.pipeline)
      .filter((c) => !model || `${c.vendorKey}/${c.modelName}`.toLowerCase().includes(model))
      .filter((c) => !query.status || c.status === query.status)
      .filter((c) => query.billed == null || isBilled(c) === query.billed)
      .map(toCallLog);
    const turnsListed = !query.pipeline && !model && !query.status && query.billed !== false;
    const turns: LogRow[] = turnsListed ? mockTurnsWithoutCalls().filter(inScope) : [];

    const rows = [...calls, ...turns].sort((a, b) => b.createdAt - a.createdAt);
    return ok(pageOf(rows, query.page, query.pageSize));
  }
}
