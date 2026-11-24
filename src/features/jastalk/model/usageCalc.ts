/**
 * 一条用量扣的积分是怎么来的：每一档「用量 × 单价」，单价又是从哪来的（牌价 × 渠道倍率、单独定价、默认价）。
 * 只有管理端看：用户那边只给积分，不给用量（2026-11-21 用户：「后台要看到真实依据，前端用户只用看到积分扣除看不到用量」）。
 *
 * 这一条的积分以后端回的 `points` 为准；这里拆出来的每一档是把同样的乘法摆出来给人核对，
 * 后端用十进制算、不在中途取整，所以每一档加起来就是它。
 */
import { formatUsd, multiplierText, pricingLabels } from './channelPricing';
import type { UsageBasis, UsageLine } from './jastalk.types';

export interface UsageTerm {
  /** 输入、缓存、输出；按张的是「张数」，按秒的是「秒数」。 */
  label: string;
  quantity: number;
  /** 这一档的单价（积分）：按 token 的是每百万 token。 */
  price: number;
  points: number;
  /** 命中缓存的没有单独的缓存价，按输入价算的。 */
  atInputPrice: boolean;
}

const PER_MILLION = 1_000_000;

/** 拆成几档。按 token 的：输入、命中缓存的（有才列）、输出（有才列：向量模型没有输出）。 */
export function usageTerms(line: UsageLine): UsageTerm[] {
  if (line.unit === 'token') {
    const term = (label: string, quantity: number, price: number, atInputPrice = false): UsageTerm => ({
      label,
      quantity,
      price,
      points: (quantity * price) / PER_MILLION,
      atInputPrice,
    });
    const terms = [term('输入', line.inputTokens, line.inputPrice)];
    if (line.cachedInputTokens > 0) {
      const price = line.cachedInputPrice ?? line.inputPrice;
      terms.push(term('缓存', line.cachedInputTokens, price, line.cachedInputPrice === null));
    }
    if (line.outputTokens > 0 || line.outputPrice > 0) terms.push(term('输出', line.outputTokens, line.outputPrice));
    return terms;
  }
  // 按张只有输出价；按秒的合成算输出价、听写算输入价——一条里只有一个不是 0
  const price = line.outputPrice || line.inputPrice;
  return [
    {
      label: line.unit === 'image' ? '张数' : '秒数',
      quantity: line.quantity,
      price,
      points: line.quantity * price,
      atInputPrice: false,
    },
  ];
}

/** 用量后面的单位：按 token 的写 tok（和 Yomi 的调用详情一样），按张、按秒的写张、秒。 */
export function quantityUnit(line: UsageLine): string {
  if (line.unit === 'token') return 'tok';
  return line.unit === 'image' ? '张' : '秒';
}

/** 单价后面短的那种写法（「/1M」「/张」「/秒」），一档一行时用；单位是积分。 */
export function priceSuffix(line: UsageLine): string {
  if (line.unit === 'token') return '/1M';
  return line.unit === 'image' ? '/张' : '/秒';
}

/** 单价后面的单位。 */
export function usagePriceUnit(line: UsageLine): string {
  if (line.unit === 'token') return '积分 / 百万 token';
  return line.unit === 'image' ? '积分 / 张' : '积分 / 秒';
}

/** 牌价里那几个数，写成「输入 $5 · 缓存 $0.5 · 输出 $25」；按张、按秒的只有一个数。 */
function listUsd(basis: UsageBasis, unit: string): string {
  if (unit !== 'token') {
    const one = basis.usdOutput || basis.usdInput;
    return one === null ? '—' : formatUsd(one);
  }
  const parts: string[] = [];
  if (basis.usdInput !== null) parts.push(`输入 ${formatUsd(basis.usdInput)}`);
  if (basis.usdCachedInput !== null) parts.push(`缓存 ${formatUsd(basis.usdCachedInput)}`);
  if (basis.usdOutput !== null) parts.push(`输出 ${formatUsd(basis.usdOutput)}`);
  return parts.join(' · ') || '—';
}

/**
 * 单价的来历，一句话。结算时记了来历的（`basis`）照它说；没记的（TODO(网关)：后端还没记）只说照价格表里哪一行算的。
 */
export function usageBasisText(line: UsageLine): string {
  if (line.ratedBy === '-') return '没找到价格';
  const basis = line.basis;
  if (!basis) return `照价格表 ${line.ratedBy} 那一行`;
  const label = pricingLabels[basis.source];
  if (basis.source !== 'compiled') return `${label}（${line.ratedBy}）`;
  const mul = basis.multiplier === null ? '' : ` ${multiplierText(basis.multiplier)} ×100`;
  return `${label}：牌价 ${basis.listModelKey ?? '—'}（${listUsd(basis, line.unit)}）${mul}`;
}

/** 用量写成带千分位的数：token 很多位，不分组看不清。 */
export function formatQuantity(value: number): string {
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 6 });
}
