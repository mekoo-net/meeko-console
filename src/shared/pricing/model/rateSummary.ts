import type { RateBody } from '@yomi/common';
import { MODEL_PRICE_CURRENCY } from '@yomi/common';
import { formatMoney } from '@/shared/lib/money';

/**
 * 把一份 rate 形状压成一行可读文本，模型定价页 / 价格表页 / 拉价 diff 共用。
 */
export function rateBodySummary(body: RateBody, currency: string = MODEL_PRICE_CURRENCY): string {
  const m2 = (v: number) => formatMoney(v, { currency, fractionDigits: 2 });
  const m4 = (v: number) => formatMoney(v, { currency, fractionDigits: 4 });

  switch (body.billingType) {
    case 'per_token': {
      const p = body.rate;
      const extras: string[] = [];
      if (p.input.cachedRead != null) extras.push(`cR ${m2(p.input.cachedRead)}`);
      if (p.input.cachedWrite != null) extras.push(`cW ${m2(p.input.cachedWrite)}`);
      if (p.output.reasoning != null) extras.push(`reason ${m2(p.output.reasoning)}`);
      if (p.input.audio != null || p.output.audio != null) {
        extras.push(`audio ${m2(p.input.audio ?? 0)}/${m2(p.output.audio ?? 0)}`);
      }
      const main = `${m2(p.input.perMToken)} 入 / ${m2(p.output.perMToken)} 出 · per 1M`;
      return extras.length ? `${main} · ${extras.join(' · ')}` : main;
    }
    case 'per_call':
      return `${m4(body.rate.pricePerCall)} / 次`;
    case 'per_credit':
      return `${m4(body.rate.pricePerCredit)} / 积分`;
    case 'per_image': {
      const prices = body.rate.tiers.map((t) => t.pricePerImage);
      return `${body.rate.tiers.length} 档 / ${rangeText(prices, m4)} / 张`;
    }
    case 'per_video': {
      const prices = body.rate.tiers.map((t) => t.pricePerSecond);
      return `${body.rate.tiers.length} 档 / ${rangeText(prices, m4)} / 秒`;
    }
    case 'per_audio_minute':
      return `${m4(body.rate.pricePerMinute)} / 分钟`;
    case 'per_character':
      return `${m4(body.rate.pricePerKChar)} / 1K 字符`;
  }
}

function rangeText(prices: number[], fmt: (v: number) => string): string {
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? fmt(min) : `${fmt(min)}-${fmt(max)}`;
}

/** 倍率显示：1 → 「×1」，1.25 → 「×1.25」；最多 4 位小数，去尾零。 */
export function formatMultiplier(v: number): string {
  return `×${Number(v.toFixed(4))}`;
}
