/**
 * 渠道定价（倍率 / 积分）在界面上的口径。
 *
 * 渠道只存「方式 + 一个值」：倍率渠道的值乘在价格表牌价上，积分渠道的值就是每积分单价。
 * 它只管「继承渠道定价」（Compiled）的别名；单独定过价（Manual）的别名不受影响。
 */
import type { RoutePricingMode } from '@yomi/common';

import type { ProviderGroup, VendorPricingMode } from './catalog.types';
import { formatMultiplier } from './rateSummary';

export type VendorPricing = Pick<ProviderGroup, 'pricingMode' | 'pricingValue'>;

export const VENDOR_PRICING_MODE_LABEL: Readonly<Record<VendorPricingMode, string>> = {
  multiplier: '倍率',
  credit: '积分',
};

const creditPriceFormatter = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
});

/**
 * 每积分单价，人民币。最多 6 位小数（与后端存储精度一致）、去尾零但至少 2 位：
 * 积分单价常见 0.000125 这种量级，按价格列的 4 位显示会变成 ¥0.0001，看着像定错了价。
 */
export function formatCreditPrice(v: number): string {
  return creditPriceFormatter.format(v);
}

/** 渠道定价的值，按方式带上单位：`×1.2` 或 `¥0.028 / 积分`。 */
export function formatVendorPricing(p: VendorPricing): string {
  return p.pricingMode === 'credit'
    ? `${formatCreditPrice(p.pricingValue)} / 积分`
    : formatMultiplier(p.pricingValue);
}

/**
 * 积分渠道里一条别名和渠道单价的关系。
 * 只看渠道是不是积分渠道、别名是不是继承（Compiled）——不看有效价本身：
 * 单独定价也能挂 per_credit，单价恰好与渠道相同也仍是独立的，改渠道单价时它不会跟着变。
 */
export type RouteCreditPricing =
  /** 渠道不按积分定价：展示维持「价格表 × 倍率 / 自定义」那一套。 */
  | { kind: 'none' }
  /** 继承渠道积分单价。 */
  | { kind: 'inherit'; creditPrice: number }
  /** 渠道按积分定价，但这条别名单独定过价。 */
  | { kind: 'independent'; creditPrice: number };

export function routeCreditPricing(
  routeMode: RoutePricingMode,
  vendor: VendorPricing | null | undefined,
): RouteCreditPricing {
  if (vendor?.pricingMode !== 'credit') return { kind: 'none' };
  return routeMode === 'compiled'
    ? { kind: 'inherit', creditPrice: vendor.pricingValue }
    : { kind: 'independent', creditPrice: vendor.pricingValue };
}

export const CREDIT_PRICING_LABEL = {
  inherit: '继承渠道积分价',
  independent: '独立定价',
  /** 已单独定过价的别名切回继承：点了会丢掉自己定的价，措辞得让人看出是「恢复」。 */
  restore: '恢复继承渠道积分价',
} as const;

/** 定价抽屉里「跟渠道走」那个选项的名字；倍率渠道沿用原来的「渠道定价」。 */
export function inheritOptionLabel(state: RouteCreditPricing): string {
  switch (state.kind) {
    case 'none':
      return '渠道定价';
    case 'inherit':
      return CREDIT_PRICING_LABEL.inherit;
    case 'independent':
      return CREDIT_PRICING_LABEL.restore;
  }
}
