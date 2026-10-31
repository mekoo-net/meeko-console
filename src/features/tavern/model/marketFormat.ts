/**
 * 市场页共用的展示辅助。
 */
import type { MarketPrice } from './market.types';

/** 0 元写「免费」，其余两位小数带币种符号。 */
export function formatPrice(price: MarketPrice): string {
  if (price.amount === 0) return '免费';
  const symbol = price.currency === 'CNY' ? '¥' : `${price.currency} `;
  return `${symbol}${price.amount.toFixed(2)}`;
}

/** 0.3 → 30%。 */
export function formatPercent(rate: number): string {
  return `${Math.round(rate * 1000) / 10}%`;
}
