import { describe, expect, it } from 'vitest';

import { creditPriceParts, creditPriceSummary, ratedByText } from '../model/creditRate';
import { checkRange, formatCharge, formatCny, formatCredits } from '../model/meteringFormat';
import { quoteCredits } from '../services/mock/tavernMeteringMockData';

describe('credit formatting', () => {
  it('writes credits with up to two decimals and the unit', () => {
    expect(formatCredits(12.37)).toBe('12.37 积分');
    expect(formatCredits(1000)).toBe('1,000 积分');
  });

  it('reads a turn charge in its own currency', () => {
    expect(formatCharge('credits', 4.84)).toBe('4.84 积分');
    expect(formatCharge('cny', 0.0288)).toBe('¥0.0288');
  });

  it('keeps at least 2 and at most 6 decimals for money', () => {
    expect(formatCny(2)).toBe('¥2.00');
    expect(formatCny(0.1234567)).toBe('¥0.123457');
  });

  it('summarises a per-token credit price, marking blanks that fall back to the main price', () => {
    const price = { billingType: 'per_token', rate: { input: { perMToken: 300, cachedRead: 30 }, output: { perMToken: 1500 } } } as const;
    expect(creditPriceSummary(price)).toBe('入 300 · 出 1,500 · 读 30 积分 / 百万 token');
    expect(creditPriceParts(price).find((p) => p.label === '写')).toEqual({ label: '写', value: '300', inherited: true });
  });

  it('names wildcard rate rows in words', () => {
    expect(ratedByText('*/*')).toBe('默认价');
    expect(ratedByText('*/gemini-4-argon')).toBe('gemini-4-argon（不分渠道）');
    expect(ratedByText('kiro/claude-opus-5.5')).toBe('kiro/claude-opus-5.5');
  });

  it('rejects ranges over 31 days or reversed', () => {
    expect(checkRange(['2026-10-01T00:00:00', '2026-10-31T23:59:59']).ok).toBe(true);
    expect(checkRange(['2026-09-01T00:00:00', '2026-10-31T00:00:00']).ok).toBe(false);
    expect(checkRange(null).ok).toBe(false);
  });
});

describe('mock credit quoting mirrors the server', () => {
  const tokens = (input: number, output: number, cachedRead = 0, reasoning = 0) => ({
    totalTokens: input + output,
    input: { tokens: input, cachedReadTokens: cachedRead, cachedWriteTokens: 0, audioTokens: 0 },
    output: { tokens: output, reasoningTokens: reasoning, audioTokens: 0, imageTokens: 0 },
  });

  it('prices each token bucket on its own (same numbers as the server check)', () => {
    // 100 万入 × 300 + 10 万缓存读 × 30 + 2 万出 × 1500 + 1 万推理 × 1500（推理没单独价，按输出）= 348
    const line = quoteCredits({
      unit: 'token',
      modelName: 'claude-opus-5.5',
      vendorKey: 'kiro',
      kind: 'chat',
      tokens: tokens(1_000_000, 20_000, 100_000, 10_000),
    });
    expect(line.ratedBy).toBe('kiro/claude-opus-5.5');
    expect(line.credits).toBe(348);
  });

  it('falls back from exact to any-vendor to the default rate', () => {
    const anyVendor = quoteCredits({ unit: 'token', modelName: 'gemini-4-argon', vendorKey: 'antigravity', kind: 'chat', tokens: tokens(10_000, 1_000) });
    expect(anyVendor.ratedBy).toBe('*/gemini-4-argon');
    const unknown = quoteCredits({ unit: 'token', modelName: 'unknown-model', vendorKey: 'x', kind: 'chat', tokens: tokens(10_000, 1_000) });
    expect(unknown.ratedBy).toBe('*/*');
  });
});
