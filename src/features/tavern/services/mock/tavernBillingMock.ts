import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { delay } from '@/shared/lib/delay';

import type { ReverseTurnsInput, TurnReversal, TurnReversalOutcome } from '../../model/metering.types';
import type { TavernBillingPort } from '../ports/tavernBillingPort';
import { findTurn, markReversed, MOCK_STAFF_UID } from './tavernMeteringMockData';

export class TavernBillingMock implements TavernBillingPort {
  /** 同服务端 `ReverseAsync`：逐个过关、逐个回结果，一个没成不牵连其它。 */
  async reverse(input: ReverseTurnsInput): Promise<AppResult<TurnReversalOutcome[]>> {
    await delay();
    if (input.ids.length === 0) return fail({ code: 'validation', message: '没有选中回合。' });
    const remark = input.remark?.trim() || null;
    return ok(
      [...new Set(input.ids)].map((id): TurnReversalOutcome => {
        const turn = findTurn(id);
        if (!turn) return { outcome: 'rejected', id, reason: '计费记录不存在。' };
        if (turn.bill.status === 'reversed') return { outcome: 'rejected', id, reason: '已经驳回过了。' };
        if (!turn.bill.reversible) return { outcome: 'rejected', id, reason: '只有已扣费、有账单的回合能驳回。' };
        const reversal: TurnReversal = { atUtc: Date.now(), by: MOCK_STAFF_UID, code: input.reasonCode, remark };
        markReversed(turn, reversal);
        return { outcome: 'reversed', id, reversal };
      }),
    );
  }
}
