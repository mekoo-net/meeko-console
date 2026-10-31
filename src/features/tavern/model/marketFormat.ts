/**
 * 市场页共用的展示辅助。
 */
import { TemplateTimeModeLabel, type MarketItemKind, type MarketPrice, type WorldTimeTemplate } from './market.types';

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

/** 时间走多快：流逝是故事钟相对现实的倍数，推进是每回合几分钟；停滞没有快慢。 */
export function timePace(time: WorldTimeTemplate): string {
  if (time.mode === 'realtime') return `${time.ratio} 倍速`;
  if (time.mode === 'turnbased') return `每回合 ${time.turnMinutes} 分钟`;
  return '';
}

/** 列表里一格写完：「推进 · 每回合 30 分钟」。 */
export function timeText(time: WorldTimeTemplate): string {
  const pace = timePace(time);
  return pace ? `${TemplateTimeModeLabel[time.mode]} · ${pace}` : TemplateTimeModeLabel[time.mode];
}

/** 一类商品在市场里的那一页（路由名）；带 `?itemId=` 进去直接打开那一件。 */
export function itemPage(kind: MarketItemKind): string {
  return kind === 'world_line' ? 'tavern-market-world-lines' : 'tavern-market-cards';
}

/** 商品行上记录弹窗（评价、订单）头部的一格统计；`rating` 给了就在数字后面画星。 */
export interface RecordStat {
  label: string;
  value: string;
  rating?: number;
}

/** 人民币两位小数带 ¥；0 写 ¥0.00，不写「免费」——这是钱款不是售价。 */
export function formatYuan(amount: number): string {
  return `¥${amount.toFixed(2)}`;
}
