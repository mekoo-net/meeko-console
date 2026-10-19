import type { AppResult } from '@/shared/api/httpTypes';

import type {
  ApplyPricesInput,
  FetchPricesInput,
  FetchPricesResult,
  ModelPrice,
  ModelPriceMakerGroup,
  ModelPriceWriteResult,
  PriceCompileResult,
  RoutePricingMode,
  UpsertModelPriceInput,
} from '@demux/common';

/**
 * 价格表端口 —— 对应 `/yomi/api/admin/pricing`。
 *
 * 管的是有效价上游的两个因子：基准价（价格表，美元）与渠道倍率。
 * 有效价(CNY) = 基准价(USD) × 倍率。不再另乘 7。
 * 每个写操作后端都会顺手编译受影响范围的有效价，并把编译结果返回，
 * 所以这里的写方法大多返回 `PriceCompileResult` 而不是 void。
 *
 * 价格表按厂家（maker）组织：列表一次给全量并按厂家分好组（价格表最多几百行，不分页），
 * 拉官方价可以按厂家圈定范围。
 */
export interface DemuxPricingPort {
  /**
   * 全量价格表，按厂家分组。`keyword` 对 modelKey 模糊匹配；`maker` 只看一家。
   * 给的都是厂家发布的模型，不夹带路由侧「哪个别名还没映射上」。
   */
  listModelPricesByMaker(input: {
    keyword: string;
    maker?: string | null;
  }): Promise<AppResult<ModelPriceMakerGroup[]>>;

  getModelPrice(modelKey: string): Promise<AppResult<ModelPrice>>;

  upsertModelPrice(input: UpsertModelPriceInput): Promise<AppResult<ModelPriceWriteResult>>;

  deleteModelPrice(id: string): Promise<AppResult<void>>;

  setVendorMultiplier(input: {
    vendorId: string;
    multiplier: number;
    reason?: string | null;
  }): Promise<AppResult<PriceCompileResult>>;

  setRoutePricing(input: {
    routeId: string;
    mode: RoutePricingMode;
    multiplier: number | null;
    reason?: string | null;
  }): Promise<AppResult<PriceCompileResult>>;

  compile(input?: {
    modelKeys?: string[];
    vendorKeys?: string[];
    reason?: string | null;
  }): Promise<AppResult<PriceCompileResult>>;

  fetchPrices(input: FetchPricesInput): Promise<AppResult<FetchPricesResult>>;

  applyPrices(input: ApplyPricesInput): Promise<AppResult<PriceCompileResult>>;
}
