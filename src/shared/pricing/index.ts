/**
 * 官方价格表：Yomi / ToApi 共用的展示件。
 * 数据全站一份，在 OneApi 的号池管理台维护，这边只读（当前走 Yomi `/admin/pricing`）；编译有效价仍在 Yomi 业务里。
 */
export type { PriceTablePort } from './port';

export {
  MODEL_KIND,
  allowedManualBillingTypes,
  imageCaption,
  isEmbeddingPrice,
  priceDisplay,
  priceModelKind,
  rateBodyDisplay,
  resolvePriceModelKind,
  type PriceDisplay,
  type PriceModelKind,
  type PricePart,
  type PricePartKind,
} from './model/priceTable';

export { hasMakerIcon, makerIconSrc } from './model/makerIcons';
export { formatMultiplier, rateBodySummary } from './model/rateSummary';
export { describeCompile, notifyCompile } from './model/compileFeedback';
