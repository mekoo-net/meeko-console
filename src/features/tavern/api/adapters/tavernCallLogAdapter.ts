import { parseTavern, requestTavern, type ItemsEnvelope } from '@/features/tavern/api/http';
import type { TavernCallLogPort } from '@/features/tavern/services/ports/tavernCallLogPort';
import type { AppResult } from '@/shared/api/httpTypes';

import { logRowSchema, pageSchema, type CallLogQuery, type LogRow } from '../../model/metering.types';

const BASE = '/tavern/api/admin/calls';

const logRowPageSchema = pageSchema(logRowSchema);

export class TavernCallLogHttpAdapter implements TavernCallLogPort {
  async list(query: CallLogQuery): Promise<AppResult<ItemsEnvelope<LogRow>>> {
    const res = await requestTavern<unknown>(BASE, {
      query: {
        p: query.page,
        pageSize: query.pageSize,
        fromUtc: query.fromUtc,
        toUtc: query.toUtc,
        accountUid: query.accountUid,
        traceId: query.traceId,
        pipeline: query.pipeline,
        model: query.model,
        status: query.status,
        billed: query.billed,
      },
    });
    return parseTavern(logRowPageSchema, res, '调用日志');
  }
}
