/**
 * 价目公式的前端镜像（服务端 `MeteringPricingSettings.Quote` / `MultiplierFor`）。
 * 页面上的金额都由服务端算好下发；这里只给计费配置页预览「还没保存的改动」，以及让 Mock 扮演服务端。
 */
import type { MeteredUsage, UsageQuote } from './metering.types';
import {
  MeteringUnitLabel,
  MeteringUnitSuffix,
  type BaselinePrice,
  type MeteringUnit,
  type ModelMultiplier,
  type PricingModel,
  type PricingRules,
} from './meteringPricing.types';

export const TOKENS_PER_MILLION = 1_000_000;

/** 只用来抹掉浮点乘除的尾差（2.5 / 1e6 这类），不做展示格式化。 */
export function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function baselinePrice(baselines: readonly BaselinePrice[], unit: MeteringUnit): number {
  return baselines.find((b) => b.unit === unit)?.price ?? 0;
}

export function perMillionFromPerToken(perToken: number): number {
  return roundTo(perToken * TOKENS_PER_MILLION, 6);
}

/** 每 token 单价远小于 1e-6 精度，按 12 位收尾才不丢有效数字。 */
export function perTokenFromPerMillion(perMillion: number): number {
  return roundTo(perMillion / TOKENS_PER_MILLION, 12);
}

function sameModel(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** 倍率表不分大小写；带渠道前缀的名字（`cmdc/deepseek-v4-pro`）再去掉首段查一次，同服务端。 */
export function multiplierFor(
  rules: Pick<PricingRules, 'modelMultipliers' | 'defaultModelMultiplier'>,
  modelName: string,
): number {
  const find = (name: string) => rules.modelMultipliers.find((m) => sameModel(m.modelName, name));
  const slash = modelName.indexOf('/');
  const hit = find(modelName) ?? (slash > 0 ? find(modelName.slice(slash + 1)) : undefined);
  return hit?.multiplier ?? rules.defaultModelMultiplier;
}

export interface ModelPricePreview {
  inputPerMillion: number;
  outputPerMillion: number;
}

export function previewModelPrice(
  rules: Pick<PricingRules, 'baselines' | 'completionWeight'>,
  multiplier: number,
): ModelPricePreview {
  const raw = baselinePrice(rules.baselines, 'token') * multiplier * TOKENS_PER_MILLION;
  return {
    inputPerMillion: roundTo(raw, 6),
    outputPerMillion: roundTo(raw * rules.completionWeight, 6),
  };
}

/** 计价用量：token 的输出按输出权重折成输入；按件计的就是张数 / 秒数。 */
export function billableQuantity(rules: Pick<PricingRules, 'completionWeight'>, usage: MeteredUsage): number {
  switch (usage.unit) {
    case 'token':
      return usage.promptTokens + usage.completionTokens * rules.completionWeight;
    default:
      return usage.quantity;
  }
}

export function quoteUsage(rules: PricingRules, usage: MeteredUsage): UsageQuote {
  const multiplier = multiplierFor(rules, usage.modelName);
  const baseline = baselinePrice(rules.baselines, usage.unit);
  const quantity = billableQuantity(rules, usage);
  return { multiplier, baseline, billableQuantity: quantity, amount: roundTo(quantity * multiplier * baseline, 6) };
}

/** 自主倍率作用在回合合计上，不是逐条。 */
export function applyProactive(rules: PricingRules, amount: number, proactive: boolean): number {
  return proactive ? roundTo(amount * rules.proactiveRateMultiplier, 6) : amount;
}

/** 近 30 天有调用、却没单独定价的模型：它们在静默按默认倍率扣费，最容易被忽略。 */
export function inUseWithoutMultiplier(
  models: readonly PricingModel[],
  multipliers: readonly ModelMultiplier[],
): PricingModel[] {
  return models
    .filter((m) => m.calls30d > 0 && !multipliers.some((x) => sameModel(x.modelName, m.modelName)))
    .sort((a, b) => b.calls30d - a.calls30d);
}

/** 服务端倍率表是不分大小写的字典，同名两行会被拒，提前在页面上指出来。 */
export function duplicateModelNames(multipliers: readonly ModelMultiplier[]): string[] {
  const seen = new Map<string, string>();
  const dupes = new Set<string>();
  for (const m of multipliers) {
    const key = m.modelName.trim().toLowerCase();
    if (!key) continue;
    if (seen.has(key)) dupes.add(seen.get(key)!);
    else seen.set(key, m.modelName.trim());
  }
  return [...dupes];
}

function num(value: number): string {
  return String(roundTo(value, 12));
}

function baselineChange(unit: MeteringUnit, before: number, after: number): string {
  if (unit === 'token') {
    return `Token 基线：¥${num(perMillionFromPerToken(before))}/百万 → ¥${num(perMillionFromPerToken(after))}/百万`;
  }
  const suffix = MeteringUnitSuffix[unit];
  return `${MeteringUnitLabel[unit]}基线：¥${num(before)}${suffix} → ¥${num(after)}${suffix}`;
}

/** 保存前的确认摘要：只列与已保存值不同的项。 */
export function describePricingChanges(before: PricingRules, after: PricingRules): string[] {
  const lines: string[] = [];

  for (const { unit, price } of after.baselines) {
    const prev = baselinePrice(before.baselines, unit);
    if (prev !== price) lines.push(baselineChange(unit, prev, price));
  }

  if (before.completionWeight !== after.completionWeight) {
    lines.push(`输出权重：${num(before.completionWeight)} → ${num(after.completionWeight)}`);
  }
  if (before.defaultModelMultiplier !== after.defaultModelMultiplier) {
    lines.push(`默认模型倍率：×${num(before.defaultModelMultiplier)} → ×${num(after.defaultModelMultiplier)}`);
  }
  if (before.proactiveRateMultiplier !== after.proactiveRateMultiplier) {
    lines.push(`自主倍率：×${num(before.proactiveRateMultiplier)} → ×${num(after.proactiveRateMultiplier)}`);
  }

  for (const m of after.modelMultipliers) {
    const prev = before.modelMultipliers.find((x) => sameModel(x.modelName, m.modelName));
    if (!prev) {
      lines.push(`新增 ${m.modelName.trim()} 倍率 ×${num(m.multiplier)}`);
    } else if (prev.multiplier !== m.multiplier) {
      lines.push(`${m.modelName.trim()} 倍率：×${num(prev.multiplier)} → ×${num(m.multiplier)}`);
    }
  }
  for (const m of before.modelMultipliers) {
    if (!after.modelMultipliers.some((x) => sameModel(x.modelName, m.modelName))) {
      lines.push(`移除 ${m.modelName.trim()} 倍率 ×${num(m.multiplier)}（改按默认倍率）`);
    }
  }

  return lines;
}
