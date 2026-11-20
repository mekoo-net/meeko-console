import type { AppResult } from '@/shared/api/httpTypes';

import type { ModelPrice, PriceCompileResult, RoutePricingMode } from '@yomi/common';
import type { VendorPricingMode } from '../../model/catalog.types';

/**
 * 价格表端口 —— 对应 `/yomi/api/admin/pricing`。
 *
 * 管的是有效价上游的两个因子：基准价（价格表，美元）与渠道定价。
 * 倍率渠道：有效价(CNY) = 基准价(USD) × 倍率，不再另乘 7；积分渠道：有效价就是渠道积分单价，不看价格表。
 *
 * 价格表不归悠米：它是 OneApi 的，全站一份，在「组件设置 → OneApi → 模型价格」里维护
 * （`features/platform/components/oneapi`，新建、改价、删除、拉官方价、整张表的列表都在那边）。
 * 悠米这边只按键查一行牌价，用来预览出价。
 * 悠米自己管的是渠道定价和路由定价；这两个写操作后端都会顺手编译受影响范围的有效价，并把编译结果返回，
 * 所以它们返回 `PriceCompileResult` 而不是 void。
 */
export interface YomiPricingPort {
  /** 悠米手上的那一份牌价里，这个模型对上的那一行；没有是 not_found。定价抽屉拿它预览「牌价 × 倍率」。 */
  getModelPrice(modelKey: string): Promise<AppResult<ModelPrice>>;

  /**
   * 渠道定价方式 + 值（倍率，或人民币 / 积分；≥ 0，0 = 免费）。
   * 写完后端重编该渠道继承渠道定价的别名，并返回编译结果。
   */
  setVendorPricing(input: {
    vendorId: string;
    mode: VendorPricingMode;
    value: number;
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
}
