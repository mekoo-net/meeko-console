import type { AppResult } from '@/shared/api/httpTypes';

import type {
  FamilyPricingMode,
  ModelPrice,
  PriceCompileResult,
  RoutePricingMode,
  VendorFamilyPricing,
} from '@yomi/common';

/**
 * 价格表端口 —— 对应 `/yomi/api/admin/pricing`。
 *
 * 管的是有效价是怎么定出来的。价格只定在两处，渠道自己不管价格：
 *  - 渠道里每个模型家族一份分组定价：牌价(USD) × 倍率（不再另乘 7）、按次价，或积分单价；
 *  - 别名可以设自己的独立倍率，顶掉分组的定价（不叠乘）。
 *
 * 价格表不归悠米：它是 OneApi 的，全站一份，在「组件设置 → OneApi → 模型价格」里维护
 * （`features/platform/components/oneapi`，新建、改价、删除、拉官方价、整张表的列表都在那边）。
 * 悠米这边只按键查一行牌价，用来预览出价。
 * 悠米自己管的是家族分组定价和路由定价；这两个写操作后端都会顺手重算受影响的那一块（改分组算那个家族，
 * 改别名算那一条），并把编译结果返回，所以它们返回 `PriceCompileResult` 而不是 void。
 * 没有「手动重算」这个口：牌价变了后端自己全量重算，别的时候没有需要人去点的重算。
 */
export interface YomiPricingPort {
  /** 悠米手上的那一份牌价里，这个模型对上的那一行；没有是 not_found。定价抽屉拿它预览「牌价 × 倍率」。 */
  getModelPrice(modelKey: string): Promise<AppResult<ModelPrice>>;

  /** 渠道里的模型家族分组：有别名的家族，加上改过定价但眼下没有别名的。按家族顺序排好。 */
  listVendorFamilies(vendorId: string): Promise<AppResult<VendorFamilyPricing[]>>;

  /**
   * 定一个家族在这个渠道里的定价：方式加一个值（倍率 [0, 1000]；按次价 / 积分单价 [0, 10000] 人民币；0 = 免费）。
   * 写完后端只重算这个渠道里这个家族的别名：继承分组的跟着变，设了独立倍率或自定义有效价的不动；别的家族不碰。
   */
  setFamilyPricing(input: {
    vendorId: string;
    family: string;
    mode: FamilyPricingMode;
    value: number;
    reason?: string | null;
  }): Promise<AppResult<PriceCompileResult>>;

  /**
   * 一条别名怎么出价。`compiled` + `multiplier: null` = 继承家族分组定价；
   * `compiled` + 数字 = 独立倍率；`manual` = 留着现有有效价等人手工改。
   */
  setRoutePricing(input: {
    routeId: string;
    mode: RoutePricingMode;
    multiplier: number | null;
    reason?: string | null;
  }): Promise<AppResult<PriceCompileResult>>;
}
