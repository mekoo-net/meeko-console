import { parseTavern, requestTavern, type ItemsEnvelope } from '@/features/tavern/api/http';
import type { TavernBillingPort } from '@/features/tavern/services/ports/tavernBillingPort';
import type { AppResult } from '@/shared/api/httpTypes';

import { z } from 'zod';

import {
  pageSchema,
  turnReversalOutcomeSchema,
  usageLogDetailSchema,
  usageLogSchema,
  usageSummarySchema,
  type RangeQuery,
  type ReverseTurnsInput,
  type TurnReversalOutcome,
  type UsageLog,
  type UsageLogDetail,
  type UsageLogQuery,
  type UsageSummary,
} from '../../model/metering.types';

const BASE = '/tavern/api/admin/billing/usage';

const usageLogPageSchema = pageSchema(usageLogSchema);
const reversalOutcomesSchema = z.array(turnReversalOutcomeSchema);

export class TavernBillingHttpAdapter implements TavernBillingPort {
  async list(query: UsageLogQuery): Promise<AppResult<ItemsEnvelope<UsageLog>>> {
    const res = await requestTavern<unknown>(BASE, {
      query: {
        p: query.page,
        pageSize: query.pageSize,
        fromUtc: query.fromUtc,
        toUtc: query.toUtc,
        accountUid: query.accountUid,
        status: query.status,
      },
    });
    return parseTavern(usageLogPageSchema, res, '计费明细');
  }

  async summary(query: RangeQuery): Promise<AppResult<UsageSummary>> {
    const res = await requestTavern<unknown>(`${BASE}/summary`, {
      query: { fromUtc: query.fromUtc, toUtc: query.toUtc, accountUid: query.accountUid },
    });
    return parseTavern(usageSummarySchema, res, '计费汇总');
  }

  async get(id: number): Promise<AppResult<UsageLogDetail>> {
    const res = await requestTavern<unknown>(`${BASE}/${id}`);
    return parseTavern(usageLogDetailSchema, res, '计费回合');
  }

  async reverse(input: ReverseTurnsInput): Promise<AppResult<TurnReversalOutcome[]>> {
    const res = await requestTavern<unknown>(`${BASE}/reverse`, { method: 'POST', body: input });
    return parseTavern(reversalOutcomesSchema, res, '驳回');
  }
}
