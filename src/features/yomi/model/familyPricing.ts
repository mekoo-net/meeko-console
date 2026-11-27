/**
 * 定价在界面上的口径。
 *
 * 价格只定在两处，渠道自己不管价格：
 *  - 模型家族的分组定价：渠道里每个家族一份，方式三选一——倍率（牌价 × 倍率）、按次（每次调用一个价）、
 *    积分（每 1 上游积分一个价）。后两种的值本身就是有效价，不看价格表。
 *  - 别名自己的：默认继承分组；也可以设独立倍率（牌价 × 它，顶掉分组的定价、不叠乘），
 *    或自定义有效价（Manual），那就哪一层都不跟。
 */
import {
  type FamilyPricingMode,
  type RoutePricingMode,
  type VendorFamilyPricing,
} from '@yomi/common';

import { formatMultiplier } from './rateSummary';

export type FamilyPricing = Pick<VendorFamilyPricing, 'mode' | 'value'>;

/** 默认定价：谁都没改过的分组就是倍率 1。列表还没加载出来时也先按它算。 */
export const DEFAULT_FAMILY_PRICING: FamilyPricing = { mode: 'multiplier', value: 1 };

const unitPriceFormatter = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
});

/**
 * 按次价 / 积分单价，人民币。最多 6 位小数（与后端存储精度一致）、去尾零但至少 2 位：
 * 积分单价常见 0.000125 这种量级，按价格列的 4 位显示会变成 ¥0.0001，看着像定错了价。
 */
export function formatUnitPrice(v: number): string {
  return unitPriceFormatter.format(v);
}

/** 值后面跟的单位；倍率没有单位。 */
export const FAMILY_PRICING_UNIT: Readonly<Record<FamilyPricingMode, string>> = {
  multiplier: '',
  per_call: '次',
  credit: '积分',
};

/** 分组定价的值，按方式带上单位：`×1.2`、`¥0.35 / 次`、`¥0.028 / 积分`。 */
export function formatFamilyPricing(p: FamilyPricing): string {
  return p.mode === 'multiplier'
    ? formatMultiplier(p.value)
    : `${formatUnitPrice(p.value)} / ${FAMILY_PRICING_UNIT[p.mode]}`;
}

/**
 * 不带单位的短写法：`×1.2`、`¥0.35`、`¥0.028`。前面已经写了方式（倍率 / 按次 / 积分）的地方用它，
 * 不然就成了「按次 ¥0.35 / 次」。
 */
export function formatFamilyPricingValue(p: FamilyPricing): string {
  return p.mode === 'multiplier' ? formatMultiplier(p.value) : formatUnitPrice(p.value);
}

/**
 * 一条别名的价从哪来：继承家族分组定价 / 自己的独立倍率 / 自定义有效价。
 * 只看路由上存的两样东西，不看有效价本身——独立倍率恰好等于分组倍率也仍是独立的，分组改了它不跟。
 */
export type RoutePricingChoice = 'family' | 'own' | 'manual';

export function routePricingChoice(
  mode: RoutePricingMode,
  priceMultiplier: number | null | undefined,
): RoutePricingChoice {
  if (mode === 'manual') return 'manual';
  return priceMultiplier == null ? 'family' : 'own';
}

export const ROUTE_PRICING_CHOICE_LABEL: Readonly<Record<RoutePricingChoice, string>> = {
  family: '继承分组',
  own: '独立倍率',
  manual: '自定义',
};

/** 一个家族的分组定价；列表里没有这个家族（还没加载出来）按默认的倍率 1 算。 */
export function familyPricingOf(families: readonly VendorFamilyPricing[], family: string): FamilyPricing {
  return families.find((f) => f.family === family) ?? DEFAULT_FAMILY_PRICING;
}

/**
 * 继承这个分组的别名要不要读价格表：只有倍率要（牌价 × 倍率）；按次 / 积分的值就是有效价，
 * 价格表里没有这个模型也照样定得出价。
 */
export function familyReadsPriceTable(p: FamilyPricing): boolean {
  return p.mode === 'multiplier';
}
