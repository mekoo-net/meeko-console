import type { AppResult } from '@/shared/api/httpTypes';

import type {
  ApplyPricesInput,
  FetchPricesInput,
  FetchPricesResult,
  ModelPriceMakerGroup,
  ModelPriceWriteResult,
  PriceCompileResult,
  UpsertModelPriceInput,
} from '@demux/common';

/**
 * 官方价格表端口。目录全站一份（当前由 Demux `/admin/pricing` 托管），
 * Demux / ToApi 控制台共用这一面；编译有效价是 Demux 自己的事，不在这里。
 */
export interface PriceTablePort {
  listModelPricesByMaker(input: {
    keyword: string;
    maker?: string | null;
  }): Promise<AppResult<ModelPriceMakerGroup[]>>;

  upsertModelPrice(input: UpsertModelPriceInput): Promise<AppResult<ModelPriceWriteResult>>;

  deleteModelPrice(id: string): Promise<AppResult<void>>;

  fetchPrices(input: FetchPricesInput): Promise<AppResult<FetchPricesResult>>;

  applyPrices(input: ApplyPricesInput): Promise<AppResult<PriceCompileResult>>;
}
