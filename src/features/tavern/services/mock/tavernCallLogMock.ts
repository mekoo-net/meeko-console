import type { ItemsEnvelope } from '@/features/tavern/api/http';
import { ok, type AppResult } from '@/shared/api/httpTypes';
import { delay } from '@/shared/lib/delay';

import type {
  CallLog,
  CallLogQuery,
  CallSummary,
  CallTally,
  PipelineRef,
  RangeQuery,
} from '../../model/metering.types';
import { roundTo } from '../../model/pricingPreview';
import type { TavernCallLogPort } from '../ports/tavernCallLogPort';
import { callCost, isBilled, mockCalls, pageOf, toCallLog } from './tavernMeteringMockData';

type MockCall = ReturnType<typeof mockCalls>[number];

function inRange(query: RangeQuery) {
  return (c: MockCall) =>
    c.createdAt >= query.fromUtc &&
    c.createdAt <= query.toUtc &&
    (query.accountUid == null || c.accountUid === query.accountUid);
}

/** 同服务端 `CallTally.Of`：折算金额拆成挂在扣费回合上的与平台承担的。 */
function tally(rows: readonly MockCall[]): CallTally {
  let billed = 0;
  let platformBorne = 0;
  for (const c of rows) {
    const { amount } = callCost(c);
    if (isBilled(c)) billed += amount;
    else platformBorne += amount;
  }
  return {
    calls: rows.length,
    failures: rows.filter((c) => c.status === 'failure').length,
    tokens: {
      input: rows.reduce((s, c) => s + c.usage.input.tokens, 0),
      output: rows.reduce((s, c) => s + c.usage.output.tokens, 0),
    },
    cost: {
      billed: roundTo(billed, 6),
      platformBorne: roundTo(platformBorne, 6),
      total: roundTo(billed + platformBorne, 6),
    },
  };
}

export class TavernCallLogMock implements TavernCallLogPort {
  async list(query: CallLogQuery): Promise<AppResult<ItemsEnvelope<CallLog>>> {
    await delay();
    const model = query.model?.trim().toLowerCase();
    const rows = mockCalls()
      .filter(inRange(query))
      .filter((c) => !query.pipeline || c.pipeline.id === query.pipeline)
      .filter((c) => !model || `${c.vendorKey}/${c.modelName}`.toLowerCase().includes(model))
      .filter((c) => !query.status || c.status === query.status)
      .filter((c) => query.billed == null || isBilled(c) === query.billed);
    const page = pageOf(rows, query.page, query.pageSize);
    return ok({ ...page, items: page.items.map(toCallLog) });
  }

  async summary(query: RangeQuery): Promise<AppResult<CallSummary>> {
    await delay();
    const rows = mockCalls().filter(inRange(query));
    const byPipeline = new Map<string, { pipeline: PipelineRef; rows: MockCall[] }>();
    for (const c of rows) {
      const group = byPipeline.get(c.pipeline.id) ?? { pipeline: c.pipeline, rows: [] };
      group.rows.push(c);
      byPipeline.set(c.pipeline.id, group);
    }
    const pipelines = [...byPipeline.values()]
      .map((g) => ({ pipeline: g.pipeline, tally: tally(g.rows) }))
      .sort((a, b) => b.tally.cost.platformBorne - a.tally.cost.platformBorne || b.tally.calls - a.tally.calls);
    return ok({ pipelines, total: tally(rows) });
  }
}
