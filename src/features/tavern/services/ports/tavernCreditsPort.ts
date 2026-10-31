import type { AppResult } from '@/shared/api/httpTypes';

import type {
  CreditAccount,
  CreditAdjustInput,
  CreditBalance,
  CreditPack,
  CreditPackEdit,
  CreditRate,
  CreditRateBoard,
  CreditRateUpsert,
} from '../../model/credits.types';

export interface TavernCreditsPort {
  rates(): Promise<AppResult<CreditRateBoard>>;
  /** (渠道, 模型) 唯一，有就改价、没有就建。 */
  saveRate(input: CreditRateUpsert): Promise<AppResult<CreditRate>>;
  /** 默认价不能删。 */
  deleteRate(id: number): Promise<AppResult<true>>;

  packs(): Promise<AppResult<CreditPack[]>>;
  /** `id` 为 null 新建。 */
  savePack(input: CreditPackEdit): Promise<AppResult<CreditPack>>;
  deletePack(id: number): Promise<AppResult<true>>;

  /** 余额 + 全部流水（含预扣与退回），倒序分页。 */
  account(accountUid: number, page: number, pageSize: number): Promise<AppResult<CreditAccount>>;
  adjust(accountUid: number, input: CreditAdjustInput): Promise<AppResult<CreditBalance>>;
}
