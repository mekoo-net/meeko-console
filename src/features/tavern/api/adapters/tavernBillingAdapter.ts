import { z } from 'zod';

import { parseTavern, requestTavern } from '@/features/tavern/api/http';
import type { TavernBillingPort } from '@/features/tavern/services/ports/tavernBillingPort';
import type { AppResult } from '@/shared/api/httpTypes';

import {
  turnReversalOutcomeSchema,
  type ReverseTurnsInput,
  type TurnReversalOutcome,
} from '../../model/metering.types';

const reversalOutcomesSchema = z.array(turnReversalOutcomeSchema);

export class TavernBillingHttpAdapter implements TavernBillingPort {
  async reverse(input: ReverseTurnsInput): Promise<AppResult<TurnReversalOutcome[]>> {
    const res = await requestTavern<unknown>('/tavern/api/admin/billing/reverse', { method: 'POST', body: input });
    return parseTavern(reversalOutcomesSchema, res, '驳回');
  }
}
