import type { AppResult } from '@/shared/api/httpTypes';

import type { ModelPriceMakerGroup } from '@yomi/common';

/**
 * 官方价格表端口。目录全站一份，在 OneApi 的号池管理台维护、发布；各产品的控制台只读（当前经 Yomi `/admin/pricing` 读），
 * 所以这里没有写的方法。编译有效价是 Yomi 自己的事，不在这里。
 */
export interface PriceTablePort {
  listModelPricesByMaker(input: {
    keyword: string;
    maker?: string | null;
  }): Promise<AppResult<ModelPriceMakerGroup[]>>;
}
