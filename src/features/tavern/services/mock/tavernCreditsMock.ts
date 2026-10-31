import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { delay } from '@/shared/lib/delay';

import {
  ANY,
  type CreditAccount,
  type CreditAdjustInput,
  type CreditBalance,
  type CreditPack,
  type CreditPackEdit,
  type CreditRate,
  type CreditRateBoard,
  type CreditRateUpsert,
} from '../../model/credits.types';
import type { TavernCreditsPort } from '../ports/tavernCreditsPort';
import {
  adjustMockCredits,
  deleteMockPack,
  deleteMockRate,
  mockCreditAccount,
  mockPacks,
  mockRateBoard,
  pageOf,
  saveMockPack,
  upsertMockRate,
} from './tavernMeteringMockData';

export class TavernCreditsMock implements TavernCreditsPort {
  async rates(): Promise<AppResult<CreditRateBoard>> {
    await delay();
    return ok(mockRateBoard());
  }

  /** 同服务端 `UpsertAsync` 的几道关。 */
  async saveRate(input: CreditRateUpsert): Promise<AppResult<CreditRate>> {
    await delay();
    const vendor = input.vendorKey.trim();
    const model = input.modelName.trim();
    if (!vendor || !model) return fail({ code: 'validation', message: '渠道和模型都要填；不分渠道写 *。' });
    if (model === ANY && vendor !== ANY) return fail({ code: 'validation', message: '模型写 * 时渠道也只能是 *（那就是默认价）。' });
    return ok(upsertMockRate(vendor, model, input.price));
  }

  async deleteRate(id: number): Promise<AppResult<true>> {
    await delay();
    const error = deleteMockRate(id);
    return error ? fail({ code: 'validation', message: error }) : ok(true);
  }

  async packs(): Promise<AppResult<CreditPack[]>> {
    await delay();
    return ok(mockPacks());
  }

  async savePack(input: CreditPackEdit): Promise<AppResult<CreditPack>> {
    await delay();
    const name = input.name.trim();
    if (!name || name.length > 64) return fail({ code: 'validation', message: '名称 1 到 64 字。' });
    if (input.credits <= 0) return fail({ code: 'validation', message: '积分要大于 0。' });
    if (input.bonusCredits < 0 || input.price < 0) return fail({ code: 'validation', message: '赠送积分和售价不能为负。' });
    return ok(saveMockPack({ ...input, name }));
  }

  async deletePack(id: number): Promise<AppResult<true>> {
    await delay();
    return deleteMockPack(id) ? ok(true) : fail({ code: 'not_found', message: `积分包 ${id} 不存在。` });
  }

  async account(accountUid: number, page: number, pageSize: number): Promise<AppResult<CreditAccount>> {
    await delay();
    const a = mockCreditAccount(accountUid);
    const txns = pageOf(a.txns, page, pageSize);
    return ok({
      accountUid,
      balance: { available: a.available, held: a.held },
      txns: { items: txns.items, total: txns.total, page: txns.page ?? page, pageSize: txns.pageSize ?? pageSize },
    });
  }

  async adjust(accountUid: number, input: CreditAdjustInput): Promise<AppResult<CreditBalance>> {
    await delay();
    if (input.delta === 0) return fail({ code: 'validation', message: '调整数不能为 0。' });
    if (!input.note.trim()) return fail({ code: 'validation', message: '写一下为什么调整。' });
    adjustMockCredits(accountUid, input.delta, input.note.trim(), input.requestId);
    const a = mockCreditAccount(accountUid);
    return ok({ available: a.available, held: a.held });
  }
}
