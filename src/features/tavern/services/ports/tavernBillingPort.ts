import type { AppResult } from '@/shared/api/httpTypes';

import type { ReverseTurnsInput, TurnReversalOutcome } from '../../model/metering.types';

export interface TavernBillingPort {
  /** 全额退回所选回合的扣费，按回合逐个回结果。 */
  reverse(input: ReverseTurnsInput): Promise<AppResult<TurnReversalOutcome[]>>;
}
