/**
 * 官方价格表：Demux / ToApi 共用的目录页与展示件。
 * 数据全站一份，当前走 Demux `/admin/pricing`；编译有效价仍在 Demux 业务里。
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
