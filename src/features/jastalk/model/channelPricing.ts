import { formatMultiplier } from '@/shared/pricing/model/rateSummary';

import type {
  ChannelPricing,
  ListPrice,
  ModelCategory,
  RateCompileResult,
  RateUnit,
  UnmatchedReason,
} from './jastalk.types';
import { categoryUnits, formatPrice, unitLabels, unitPer } from './jastalkFormat';

/**
 * 渠道页上「价格是怎么来的」这一块的说法和算式。价格本身是后端算的（牌价 × 渠道倍率 × 100），
 * 这里只管怎么显示、以及一个模型能不能跟渠道走；不在前端重算一遍价格。
 */

/** 价格的来源。一组标签一样长，在表格里才排得齐。 */
export const pricingLabels: Readonly<Record<ChannelPricing, string>> = {
  compiled: '跟随渠道',
  manual: '单独定价',
  default: '默认价格',
  none: '尚未定价',
};

export const pricingTones: Readonly<Record<ChannelPricing, 'success' | 'warning' | 'info' | 'danger'>> = {
  compiled: 'success',
  manual: 'warning',
  default: 'info',
  none: 'danger',
};

/** 渠道的倍率：`×7`；没设的明说没设，不写成 ×0 或者空着。 */
export function multiplierText(multiplier: number | null): string {
  return multiplier === null ? '未设置' : formatMultiplier(multiplier);
}

/** 牌价是美元；位数和积分单价一样最多留六位（按秒的牌价是每分钟的价除以 60，很小）。 */
export function formatUsd(value: number): string {
  return `$${formatPrice(value)}`;
}

const listBillingLabels: Readonly<Record<string, string>> = {
  per_token: '按 token 计价',
  per_call: '按次计价',
  per_credit: '按积分计价',
  per_image: '按张计价',
  per_video: '按视频时长计价',
  per_audio_minute: '按分钟计价',
  per_character: '按字符计价',
};

/** 牌价的计价方式。后端加了这里不认识的，原样显示，不猜。 */
export function listBillingLabel(billingType: string): string {
  return listBillingLabels[billingType] ?? billingType;
}

export interface PriceSlot {
  label: string;
  side: 'input' | 'cachedInput' | 'output';
  /** 可以不填：缓存价不填就是命中缓存的按输入价算。 */
  optional?: boolean;
}

const tokenSlots: readonly PriceSlot[] = [
  { label: '输入', side: 'input' },
  { label: '输出', side: 'output' },
];

/**
 * 每一类模型用得上价格表那一行里的哪个数、叫什么。
 * 生图只看输出价；语音按秒：合成的算输出价，听写的算输入价——另一个数这一类用不上，不摆出来让人填。
 */
export const categoryPriceSlots: Readonly<Record<ModelCategory, readonly PriceSlot[]>> = {
  chat: tokenSlots,
  embed: tokenSlots,
  rerank: tokenSlots,
  image: [{ label: '每张', side: 'output' }],
  tts: [{ label: '合成', side: 'output' }],
  stt: [{ label: '听写', side: 'input' }],
};

/** 命中缓存的输入那一档。只有对话有：向量、重排没有缓存这一说。和「输入」「输出」一样两个字。 */
const cacheSlot: PriceSlot = { label: '缓存', side: 'cachedInput', optional: true };

/** 摆得出缓存价的类别。 */
export function hasCacheTier(category: ModelCategory): boolean {
  return category === 'chat';
}

/**
 * 这一类模型要摆哪几个价。`withCache`：要不要摆缓存那一档——有缓存价才摆（null 是按输入价算，不另写），
 * 编辑时看后端分不分缓存价（不分的不让填）。
 */
export function priceSlotsFor(category: ModelCategory, withCache: boolean): readonly PriceSlot[] {
  const slots = categoryPriceSlots[category];
  if (!withCache || !hasCacheTier(category)) return slots;
  // 输入、缓存、输出：缓存是输入的一种，挨着输入
  return [slots[0]!, cacheSlot, ...slots.slice(1)];
}

/**
 * 一个模型的积分价写成一句话。知道类别，所以只写这一类用得上的数（`describePrice` 只知道单位，语音的两个都写）。
 * 缓存价是 null（按输入价算）的不写缓存那一档。
 */
export function describeModelPrice(
  category: ModelCategory,
  inputPrice: number,
  outputPrice: number,
  cachedInputPrice: number | null = null,
): string {
  const slots = priceSlotsFor(category, cachedInputPrice !== null);
  const per = unitPer[categoryUnits[category]];
  const of = (slot: PriceSlot) =>
    formatPrice(slot.side === 'input' ? inputPrice : slot.side === 'output' ? outputPrice : (cachedInputPrice ?? inputPrice));
  if (slots.length === 1) return `${of(slots[0]!)} ${per}`;
  return `${slots.map((slot) => `${slot.label} ${of(slot)}`).join(' · ')} ${per}`;
}

/** 一条牌价写成一句话（美元）。折不成这个单位的没有可比的数，只说它按什么计价。 */
export function describeListPrice(listPrice: ListPrice, unit: RateUnit): string {
  const { usdInput, usdOutput } = listPrice;
  if (!listPrice.convertible || usdInput === null || usdOutput === null) return listBillingLabel(listPrice.billingType);
  if (unit === 'token') {
    const cache = listPrice.usdCachedInput === null ? '' : ` · 缓存 ${formatUsd(listPrice.usdCachedInput)}`;
    return `输入 ${formatUsd(usdInput)}${cache} · 输出 ${formatUsd(usdOutput)} ${unitPer.token}`;
  }
  return `${formatUsd(usdOutput)} ${unitPer[unit]}`;
}

export interface FormulaRow {
  label: string;
  /** 牌价里取的那个数（美元）。 */
  usd: number | null;
  /** 按渠道现在的倍率折出来的积分；渠道没设倍率是 null。 */
  points: number | null;
}

/** 「牌价 × 倍率 = 积分」要列的几行：这一类模型用得上的那几个价；牌价写了缓存价的，对话多一行缓存。 */
export function formulaRows(category: ModelCategory, listPrice: ListPrice): FormulaRow[] {
  const pick = <T>(side: PriceSlot['side'], input: T, cached: T, output: T): T =>
    side === 'input' ? input : side === 'output' ? output : cached;
  return priceSlotsFor(category, listPrice.usdCachedInput !== null).map((slot) => ({
    label: slot.label,
    usd: pick(slot.side, listPrice.usdInput, listPrice.usdCachedInput, listPrice.usdOutput),
    points: pick(slot.side, listPrice.pointsInput, listPrice.pointsCachedInput, listPrice.pointsOutput),
  }));
}

/**
 * 算式旁边要交代的一句：按张的牌价分档（尺寸、画质），这边一张图只有一个价，后端取的是最贵的那一档——
 * 不说的话，算式里的美元价和牌价表上看到的第一档对不上。别的计价方式没有要交代的。
 */
export function listPriceNote(listPrice: ListPrice): string | null {
  if (listPrice.billingType !== 'per_image') return null;
  const tiers = (listPrice.rate as { tiers?: unknown } | null)?.tiers;
  return Array.isArray(tiers) && tiers.length > 1 ? `牌价分 ${tiers.length} 档，取最贵的一档` : null;
}

/** 一个模型为什么跟不了渠道。 */
export type FollowBlock = 'list_prices_missing' | 'no_list_price' | 'unit_mismatch' | 'no_multiplier';

/**
 * 能不能跟渠道走；能是 null。先看牌价、再看倍率：牌价里没有（或者折不了）的模型，设了倍率也算不出价，
 * 先说「渠道没设倍率」会让人白设一次。
 * `listPricesLoaded = false` 时每个模型的牌价都是空的，那是这次没读到，不是牌价里没有它。
 */
export function followBlock(input: {
  multiplier: number | null;
  listPrice: ListPrice | null;
  listPricesLoaded: boolean;
}): FollowBlock | null {
  if (!input.listPrice) return input.listPricesLoaded ? 'no_list_price' : 'list_prices_missing';
  if (!input.listPrice.convertible) return 'unit_mismatch';
  if (input.multiplier === null) return 'no_multiplier';
  return null;
}

export function followBlockText(block: FollowBlock, listPrice: ListPrice | null, unit: RateUnit): string {
  switch (block) {
    case 'list_prices_missing':
      return '没读到牌价';
    case 'no_list_price':
      return '牌价里没有这个模型';
    case 'unit_mismatch':
      return `牌价${listBillingLabel(listPrice?.billingType ?? '')}，折不成${unitLabels[unit]}`;
    case 'no_multiplier':
      return '渠道没设倍率';
  }
}

// ---------- 重算的结果 ----------

export const unmatchedReasonLabels: Readonly<Record<UnmatchedReason, string>> = {
  no_list_price: '牌价里没有',
  unit_mismatch: '计价方式对不上',
};

/**
 * 一次重算压成一句话：有几个价真的变了、删了几个、几个对不上牌价。
 * 没读到牌价要单独说：那是什么都没重算，不是「价格没有变化」。
 */
export function describeCompile(r: RateCompileResult): string {
  const parts: string[] = [];
  if (r.compiled > 0) parts.push(`重算了 ${r.compiled} 个价格`);
  if (r.removed > 0) parts.push(`删掉 ${r.removed} 个算出来的价`);
  if (r.listPricesEmpty) parts.push('手上没有牌价，没法算新价');
  else if (parts.length === 0) parts.push('价格没有变化');
  if (r.unmatched.length > 0) parts.push(`${r.unmatched.length} 个对不上牌价`);
  return parts.join('，');
}

/** 对不上牌价的模型，一行一个「模型名：原因」。多了只列前几个，剩下的报个数（提示条放不下一长串）。 */
export function unmatchedLines(r: RateCompileResult, limit = 6): string[] {
  const lines = r.unmatched.slice(0, limit).map((m) => `${m.modelName}：${unmatchedReasonLabels[m.reason]}`);
  if (r.unmatched.length > limit) lines.push(`还有 ${r.unmatched.length - limit} 个`);
  return lines;
}
