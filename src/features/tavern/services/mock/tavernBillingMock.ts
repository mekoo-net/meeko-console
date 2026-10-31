import type { ItemsEnvelope } from '@/features/tavern/api/http';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { delay } from '@/shared/lib/delay';

import type {
  AccountSpend,
  RangeQuery,
  ReverseTurnsInput,
  TurnReversalOutcome,
  UsageLog,
  UsageLogDetail,
  UsageLogQuery,
  UsageSummary,
} from '../../model/metering.types';
import { roundTo } from '../../model/pricingPreview';
import type { TavernBillingPort } from '../ports/tavernBillingPort';
import { findTurn, markReversed, mockTurns, MOCK_STAFF_UID, pageOf, toUsageLogDetail } from './tavernMeteringMockData';

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

  /** 同服务端 `SummaryAsync`：付费账号与排行只看仍扣着的回合，驳回的单算。 */
  async summary(query: RangeQuery): Promise<AppResult<UsageSummary>> {
    await delay();
    const rows = turnsIn(query);
    const charged = rows.filter((t) => t.status === 'charged');
    const reversed = rows.filter((t) => t.status === 'reversed');
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
        reversed: reversed.length,
      },
      chargedAmount: roundTo(charged.reduce((s, t) => s + t.amount, 0), 6),
      reversedAmount: roundTo(reversed.reduce((s, t) => s + t.amount, 0), 6),
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

  /** 同服务端 `ReverseAsync`：逐个过关、逐个回结果，一个没成不牵连其它。 */
  async reverse(input: ReverseTurnsInput): Promise<AppResult<TurnReversalOutcome[]>> {
    await delay();
    if (input.ids.length === 0) return fail({ code: 'validation', message: '没有选中回合。' });
    const remark = input.remark?.trim() || null;
    return ok(
      [...new Set(input.ids)].map((id): TurnReversalOutcome => {
        const turn = findTurn(id);
        if (!turn) return { outcome: 'rejected', id, reason: '计费记录不存在。' };
        if (turn.log.status === 'reversed') return { outcome: 'rejected', id, reason: '已经驳回过了。' };
        if (!turn.log.reversible) return { outcome: 'rejected', id, reason: '只有已扣费、有账单的回合能驳回。' };
        markReversed(turn, { atUtc: Date.now(), by: MOCK_STAFF_UID, code: input.reasonCode, remark });
        return { outcome: 'reversed', id, turn: turn.log };
      }),
    );
  }
}
