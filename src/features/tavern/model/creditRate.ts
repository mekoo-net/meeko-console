import type { RateBody } from '@yomi/common';

/**
 * 积分价目的读法，价目表与调用详情共用。和 Yomi 的 `rateBodySummary` 同一个顺序，单位换成积分——
 * 不能借 `formatMoney`，它按 ISO 币种格式化，积分不是币种。
 */

const fmt = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 4 });

function n(value: number): string {
  return fmt.format(value);
}

export interface CreditPricePart {
  label: string;
  value: string;
  /** 留空按同侧主价计的那几项，用占位色。 */
  inherited?: boolean;
}

/** 摊成几段：按 token 是「入 / 出 / 读 / 写 / 推理」，其余一段。单位写在 {@link creditPriceUnit}。 */
export function creditPriceParts(body: RateBody): CreditPricePart[] {
  switch (body.billingType) {
    case 'per_token': {
      const { input, output } = body.rate;
      return [
        { label: '入', value: n(input.perMToken) },
        { label: '出', value: n(output.perMToken) },
        { label: '读', value: n(input.cachedRead ?? input.perMToken), inherited: input.cachedRead == null },
        { label: '写', value: n(input.cachedWrite ?? input.perMToken), inherited: input.cachedWrite == null },
        ...(output.reasoning != null ? [{ label: '推理', value: n(output.reasoning) }] : []),
      ];
    }
    case 'per_call':
      return [{ label: '每次', value: n(body.rate.pricePerCall) }];
    case 'per_image':
      return [{ label: '每张', value: n(body.rate.tiers[0]?.pricePerImage ?? 0) }];
    case 'per_video':
      return [{ label: '每秒', value: n(body.rate.tiers[0]?.pricePerSecond ?? 0) }];
    case 'per_audio_minute':
      return [{ label: '每分钟', value: n(body.rate.pricePerMinute) }];
    case 'per_credit':
      return [{ label: '每上游积分', value: n(body.rate.pricePerCredit) }];
    case 'per_character':
      return [{ label: '每千字', value: n(body.rate.pricePerKChar) }];
  }
}

export function creditPriceUnit(body: RateBody): string {
  return body.billingType === 'per_token' ? '积分 / 百万 token' : '积分';
}

/** 一行：「入 300 · 出 1,500 · 读 30 积分 / 百万 token」。 */
export function creditPriceSummary(body: RateBody): string {
  const parts = creditPriceParts(body).filter((p) => !p.inherited);
  return `${parts.map((p) => `${p.label} ${p.value}`).join(' · ')} ${creditPriceUnit(body)}`;
}

/** 价目行的读法：`*` 写成「不分渠道」「默认价」。 */
export function ratedByText(ratedBy: string): string {
  if (ratedBy === '*/*') return '默认价';
  if (ratedBy === '-') return '没有可用的价目';
  return ratedBy.startsWith('*/') ? `${ratedBy.slice(2)}（不分渠道）` : ratedBy;
}
