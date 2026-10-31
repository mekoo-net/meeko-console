import { describe, expect, it } from 'vitest';

import type { MeteredUsage } from '../model/metering.types';
import type { PricingRules } from '../model/meteringPricing.types';
import { checkRange, formatCny } from '../model/meteringFormat';
import {
  applyProactive,
  describePricingChanges,
  duplicateModelNames,
  inUseWithoutMultiplier,
  multiplierFor,
  perMillionFromPerToken,
  perTokenFromPerMillion,
  previewModelPrice,
  quoteUsage,
} from '../model/pricingPreview';

/** 线上现行价目。 */
const LIVE: PricingRules = {
  baselines: [
    { unit: 'token', price: 0.000002 },
    { unit: 'image', price: 0.05 },
    { unit: 'audio_second', price: 0.002 },
    { unit: 'video_second', price: 0.08 },
  ],
  modelMultipliers: [],
  defaultModelMultiplier: 1,
  completionWeight: 3,
  proactiveRateMultiplier: 1,
};

function rules(patch: Partial<PricingRules>): PricingRules {
  return { ...LIVE, ...patch };
}

const OPUS_CALL: MeteredUsage = {
  unit: 'token',
  modelName: 'claude-opus-5.5',
  vendorKey: 'kiro',
  kind: 'chat',
  promptTokens: 12_000,
  completionTokens: 800,
};

const IMAGE: MeteredUsage = {
  unit: 'image',
  modelName: 'nai-diffusion-5-full',
  vendorKey: 'neko',
  kind: 'generation',
  quantity: 2,
};

describe('pricingPreview', () => {
  it('converts per-token and per-million without float residue', () => {
    expect(perMillionFromPerToken(0.000002)).toBe(2);
    expect(perTokenFromPerMillion(2.5)).toBe(0.0000025);
    expect(perMillionFromPerToken(perTokenFromPerMillion(0.3))).toBe(0.3);
  });

  it('previews ¥ per million input / output from baseline × multiplier × completion weight', () => {
    expect(previewModelPrice(LIVE, 1)).toEqual({ inputPerMillion: 2, outputPerMillion: 6 });
    expect(previewModelPrice(LIVE, 1.5)).toEqual({ inputPerMillion: 3, outputPerMillion: 9 });
  });

  it('looks multipliers up like the server: case-insensitive, then without the channel prefix', () => {
    const r = rules({
      modelMultipliers: [
        { modelName: 'Claude-Opus-5.5', multiplier: 2 },
        { modelName: 'deepseek-v4-pro', multiplier: 0.5 },
      ],
      defaultModelMultiplier: 1.2,
    });
    expect(multiplierFor(r, 'claude-opus-5.5')).toBe(2);
    expect(multiplierFor(r, 'cmdc/deepseek-v4-pro')).toBe(0.5);
    expect(multiplierFor(r, 'gemini-4-argon')).toBe(1.2);
  });

  it('quotes by usage shape: tokens weight the output, counted units go by quantity', () => {
    expect(quoteUsage(LIVE, OPUS_CALL)).toEqual({
      multiplier: 1,
      baseline: 0.000002,
      billableQuantity: 14_400,
      amount: 0.0288,
    });
    const doubled = rules({ modelMultipliers: [{ modelName: 'nai-diffusion-5-full', multiplier: 2 }] });
    expect(quoteUsage(doubled, IMAGE)).toEqual({ multiplier: 2, baseline: 0.05, billableQuantity: 2, amount: 0.2 });
  });

  it('applies the proactive multiplier only to proactive turns', () => {
    const r = rules({ proactiveRateMultiplier: 1.5 });
    expect(applyProactive(r, 0.0288, true)).toBe(0.0432);
    expect(applyProactive(r, 0.0288, false)).toBe(0.0288);
  });

  it('flags models in use without their own multiplier, busiest first', () => {
    const models = [
      { modelName: 'gemini-3.8-flash', vendors: ['antigravity'], inCatalog: true, calls30d: 120 },
      { modelName: 'claude-opus-5.5', vendors: ['factory', 'kiro'], inCatalog: true, calls30d: 400 },
      { modelName: 'gpt-5.4', vendors: ['factory'], inCatalog: true, calls30d: 0 },
      { modelName: 'gemini-4-argon', vendors: ['antigravity'], inCatalog: true, calls30d: 80 },
    ];
    const flagged = inUseWithoutMultiplier(models, [{ modelName: 'GEMINI-4-ARGON', multiplier: 1.5 }]);
    expect(flagged.map((m) => m.modelName)).toEqual(['claude-opus-5.5', 'gemini-3.8-flash']);
  });

  it('finds duplicate model rows the server would reject', () => {
    expect(
      duplicateModelNames([
        { modelName: 'claude-opus-5.5', multiplier: 2 },
        { modelName: 'Claude-Opus-5.5 ', multiplier: 3 },
        { modelName: '', multiplier: 1 },
        { modelName: '', multiplier: 1 },
      ]),
    ).toEqual(['claude-opus-5.5']);
  });

  it('describes only what changed, token baseline in ¥ per million', () => {
    expect(describePricingChanges(LIVE, rules({}))).toEqual([]);

    const before = rules({
      modelMultipliers: [
        { modelName: 'gemini-4-argon', multiplier: 1.5 },
        { modelName: 'claude-opus-5.5', multiplier: 2 },
      ],
    });
    const after = rules({
      baselines: [{ unit: 'token', price: 0.0000025 }, ...LIVE.baselines.slice(1, 3), { unit: 'video_second', price: 0.1 }],
      completionWeight: 4,
      modelMultipliers: [
        { modelName: 'claude-opus-5.5', multiplier: 2.5 },
        { modelName: 'gemini-3.8-flash', multiplier: 0.5 },
      ],
    });
    expect(describePricingChanges(before, after)).toEqual([
      'Token 基线：¥2/百万 → ¥2.5/百万',
      '视频基线：¥0.08/秒 → ¥0.1/秒',
      '输出权重：3 → 4',
      'claude-opus-5.5 倍率：×2 → ×2.5',
      '新增 gemini-3.8-flash 倍率 ×0.5',
      '移除 gemini-4-argon 倍率 ×1.5（改按默认倍率）',
    ]);
  });
});

describe('meteringFormat', () => {
  it('keeps at least 2 and at most 6 decimals, trimming trailing zeros', () => {
    expect(formatCny(2)).toBe('¥2.00');
    expect(formatCny(0.0288)).toBe('¥0.0288');
    expect(formatCny(0.1234567)).toBe('¥0.123457');
  });

  it('rejects ranges over 31 days or reversed', () => {
    expect(checkRange(['2026-10-01T00:00:00', '2026-10-31T23:59:59']).ok).toBe(true);
    expect(checkRange(['2026-09-01T00:00:00', '2026-10-31T00:00:00']).ok).toBe(false);
    expect(checkRange(['2026-10-31T00:00:00', '2026-10-01T00:00:00']).ok).toBe(false);
    expect(checkRange(null).ok).toBe(false);
  });
});
