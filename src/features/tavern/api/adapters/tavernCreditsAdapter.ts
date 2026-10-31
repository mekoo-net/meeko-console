import { z } from 'zod';

import { parseTavern, requestTavern } from '@/features/tavern/api/http';
import type { TavernCreditsPort } from '@/features/tavern/services/ports/tavernCreditsPort';
import type { AppResult } from '@/shared/api/httpTypes';

import {
  creditAccountSchema,
  creditBalanceSchema,
  creditPackSchema,
  creditRateBoardSchema,
  creditRateSchema,
  type CreditAccount,
  type CreditAdjustInput,
  type CreditBalance,
  type CreditPack,
  type CreditPackEdit,
  type CreditRate,
  type CreditRateBoard,
  type CreditRateUpsert,
} from '../../model/credits.types';

const BASE = '/tavern/api/admin/credits';

const doneSchema = z.literal(true);
const packsSchema = z.array(creditPackSchema);

export class TavernCreditsHttpAdapter implements TavernCreditsPort {
  async rates(): Promise<AppResult<CreditRateBoard>> {
    return parseTavern(creditRateBoardSchema, await requestTavern<unknown>(`${BASE}/rates`), '积分价目');
  }

  async saveRate(input: CreditRateUpsert): Promise<AppResult<CreditRate>> {
    const res = await requestTavern<unknown>(`${BASE}/rates`, { method: 'PUT', body: input });
    return parseTavern(creditRateSchema, res, '积分价目');
  }

  async deleteRate(id: number): Promise<AppResult<true>> {
    return parseTavern(doneSchema, await requestTavern<unknown>(`${BASE}/rates/${id}`, { method: 'DELETE' }), '删除价目');
  }

  async packs(): Promise<AppResult<CreditPack[]>> {
    return parseTavern(packsSchema, await requestTavern<unknown>(`${BASE}/packs`), '积分包');
  }

  async savePack(input: CreditPackEdit): Promise<AppResult<CreditPack>> {
    const res = await requestTavern<unknown>(`${BASE}/packs`, { method: 'PUT', body: input });
    return parseTavern(creditPackSchema, res, '积分包');
  }

  async deletePack(id: number): Promise<AppResult<true>> {
    return parseTavern(doneSchema, await requestTavern<unknown>(`${BASE}/packs/${id}`, { method: 'DELETE' }), '删除积分包');
  }

  async account(accountUid: number, page: number, pageSize: number): Promise<AppResult<CreditAccount>> {
    const res = await requestTavern<unknown>(`${BASE}/accounts/${accountUid}`, { query: { p: page, pageSize } });
    return parseTavern(creditAccountSchema, res, '积分账户');
  }

  async adjust(accountUid: number, input: CreditAdjustInput): Promise<AppResult<CreditBalance>> {
    const res = await requestTavern<unknown>(`${BASE}/accounts/${accountUid}/adjust`, { method: 'POST', body: input });
    return parseTavern(creditBalanceSchema, res, '积分调整');
  }
}
