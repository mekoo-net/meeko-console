import { parseTavern, requestTavern, type ItemsEnvelope } from '@/features/tavern/api/http';
import type { TavernCallLogPort } from '@/features/tavern/services/ports/tavernCallLogPort';
import type { AppResult } from '@/shared/api/httpTypes';

import {
  callLogSchema,
  callSummarySchema,
  pageSchema,
  type CallLog,
  type CallLogQuery,
  type CallSummary,
  type RangeQuery,
} from '../../model/metering.types';

const BASE = '/tavern/api/admin/calls';

const callLogPageSchema = pageSchema(callLogSchema);

export class TavernCallLogHttpAdapter implements TavernCallLogPort {
  async list(query: CallLogQuery): Promise<AppResult<ItemsEnvelope<CallLog>>> {
    const res = await requestTavern<unknown>(BASE, {
      query: {
        p: query.page,
        pageSize: query.pageSize,
        fromUtc: query.fromUtc,
        toUtc: query.toUtc,
        accountUid: query.accountUid,
        pipeline: query.pipeline,
        model: query.model,
        status: query.status,
        billed: query.billed,
      },
    });
    return parseTavern(callLogPageSchema, res, '调用日志');
  }

  async summary(query: RangeQuery): Promise<AppResult<CallSummary>> {
    const res = await requestTavern<unknown>(`${BASE}/summary`, {
      query: { fromUtc: query.fromUtc, toUtc: query.toUtc, accountUid: query.accountUid },
    });
    return parseTavern(callSummarySchema, res, '管线汇总');
  }
}
