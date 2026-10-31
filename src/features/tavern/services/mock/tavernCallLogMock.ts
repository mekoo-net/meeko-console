import type { ItemsEnvelope } from '@/features/tavern/api/http';
import { ok, type AppResult } from '@/shared/api/httpTypes';
import { delay } from '@/shared/lib/delay';

import type { CallLog, CallLogQuery } from '../../model/metering.types';
import type { TavernCallLogPort } from '../ports/tavernCallLogPort';
import { isBilled, mockCalls, pageOf, toCallLog } from './tavernMeteringMockData';

export class TavernCallLogMock implements TavernCallLogPort {
  async list(query: CallLogQuery): Promise<AppResult<ItemsEnvelope<CallLog>>> {
    await delay();
    const model = query.model?.trim().toLowerCase();
    const rows = mockCalls()
      .filter((c) => c.createdAt >= query.fromUtc && c.createdAt <= query.toUtc)
      .filter((c) => query.accountUid == null || c.accountUid === query.accountUid)
      .filter((c) => !query.traceId || c.traceId === query.traceId)
      .filter((c) => !query.pipeline || c.pipeline.id === query.pipeline)
      .filter((c) => !model || `${c.vendorKey}/${c.modelName}`.toLowerCase().includes(model))
      .filter((c) => !query.status || c.status === query.status)
      .filter((c) => query.billed == null || isBilled(c) === query.billed);
    const page = pageOf(rows, query.page, query.pageSize);
    return ok({ ...page, items: page.items.map(toCallLog) });
  }
}
