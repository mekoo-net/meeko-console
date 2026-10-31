import type { ItemsEnvelope } from '@/features/tavern/api/http';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { delay } from '@/shared/lib/delay';

import type {
  AccountSpend,
  RangeQuery,
  UsageLog,
  UsageLogDetail,
  UsageLogQuery,
  UsageSummary,
} from '../../model/metering.types';
import { roundTo } from '../../model/pricingPreview';
import type { TavernBillingPort } from '../ports/tavernBillingPort';
import { findTurn, mockTurns, pageOf, toUsageLogDetail } from './tavernMeteringMockData';

const TOP_ACCOUNTS = 10;

function turnsIn(query: RangeQuery): UsageLog[] {
  return mockTurns()
    .map((t) => t.log)
    .filter(
      (t) =>
        t.createdAt >= query.fromUtc &&
        t.createdAt <= query.toUtc &&
        (query.accountUid == null || t.accountUid === query.accountUid),
    );
}

export class TavernBillingMock implements TavernBillingPort {
  async list(query: UsageLogQuery): Promise<AppResult<ItemsEnvelope<UsageLog>>> {
    await delay();
    const rows = turnsIn(query).filter((t) => !query.status || t.status === query.status);
    return ok(pageOf(rows, query.page, query.pageSize));
  }

  /** 同服务端 `SummaryAsync`：付费账号与排行只看实扣过的回合。 */
  async summary(query: RangeQuery): Promise<AppResult<UsageSummary>> {
    await delay();
    const rows = turnsIn(query);
    const charged = rows.filter((t) => t.status === 'charged');
    const tokens = rows.flatMap((t) => t.usages).filter((u) => u.unit === 'token');

    const byAccount = new Map<number, AccountSpend>();
    for (const t of charged) {
      const spend = byAccount.get(t.accountUid) ?? { accountUid: t.accountUid, turns: 0, amount: 0 };
      spend.turns += 1;
      spend.amount = roundTo(spend.amount + t.amount, 6);
      byAccount.set(t.accountUid, spend);
    }

    return ok({
      turns: {
        total: rows.length,
        charged: charged.length,
        voided: rows.filter((t) => t.status === 'voided').length,
        failed: rows.filter((t) => t.status === 'failed').length,
      },
      chargedAmount: roundTo(charged.reduce((s, t) => s + t.amount, 0), 6),
      payingAccounts: byAccount.size,
      tokens: {
        input: tokens.reduce((s, u) => s + u.promptTokens, 0),
        output: tokens.reduce((s, u) => s + u.completionTokens, 0),
      },
      topAccounts: [...byAccount.values()].sort((a, b) => b.amount - a.amount).slice(0, TOP_ACCOUNTS),
    });
  }

  async get(id: number): Promise<AppResult<UsageLogDetail>> {
    await delay();
    const turn = findTurn(id);
    return turn ? ok(toUsageLogDetail(turn)) : fail({ code: 'not_found', message: `计费回合 ${id} 不存在` });
  }
}
