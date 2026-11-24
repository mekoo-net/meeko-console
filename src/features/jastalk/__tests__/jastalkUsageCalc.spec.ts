import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { catalogModelSchema, listPriceSchema, pointRateSchema, usageLineSchema, type UsageLine } from '../model/jastalk.types';
import { usageBasisText, usagePriceUnit, usageTerms } from '../model/usageCalc';
import { JastalkAdminMock } from '../services/mock/jastalkAdminMock';

/**
 * 缓存价和扣积分的依据：管理端要看得到每一档「用量 × 单价」和单价的来历（用户那边只给积分）。
 * 后端还不分缓存价、还没记来历（TODO(网关)），所以也钉住：现在后端回的样子照样读得进来，页面不摆它没有的东西。
 */

function line(over: Partial<UsageLine> = {}): UsageLine {
  return usageLineSchema.parse({
    kind: 'chat',
    vendorKey: 'kiro',
    modelName: 'claude-opus-5.5',
    unit: 'token',
    inputTokens: 2_000,
    cachedInputTokens: 18_000,
    outputTokens: 400,
    quantity: 0,
    estimated: false,
    ratedBy: 'kiro/claude-opus-5.5',
    inputPrice: 3500,
    outputPrice: 17500,
    cachedInputPrice: 350,
    basis: {
      source: 'compiled',
      listModelKey: 'claude-opus-5.5',
      multiplier: 7,
      usdInput: 5,
      usdCachedInput: 0.5,
      usdOutput: 25,
    },
    points: 20.3,
    ...over,
  });
}

describe('what the current backend sends still reads, without a cache tier', () => {
  it('a model and a rate without cachedInputPrice: undefined, so the page neither shows nor asks for a cache price', () => {
    const model = catalogModelSchema.parse({
      id: 1, category: 'chat', vendorKey: 'kiro', vendorName: 'Kiro', modelName: 'claude-opus-5.5', displayName: 'Claude Opus 5.5',
      enabled: true, sort: 10, priced: true, unit: 'token', inputPrice: 3500, outputPrice: 17500, ratedBy: 'kiro/claude-opus-5.5', updatedAt: 1763452800000,
    });
    expect(model.cachedInputPrice).toBeUndefined();
    const rate = pointRateSchema.parse({
      id: 6, vendorKey: 'kiro', modelName: 'claude-opus-5.5', unit: 'token', inputPrice: 3500, outputPrice: 17500, updatedAt: 1763452800000,
      source: 'compiled', sourceModelKey: 'claude-opus-5.5', multiplierApplied: 7,
    });
    expect(rate.cachedInputPrice).toBeUndefined();
    // 后端分了缓存价、这个模型没有单独的：null，和「不分」是两回事
    expect(catalogModelSchema.parse({ ...model, cachedInputPrice: null }).cachedInputPrice).toBeNull();
  });

  it('a list price without the cache fields reads as having none', () => {
    const price = listPriceSchema.parse({
      modelKey: 'claude-opus-5.5', maker: 'anthropic', billingType: 'per_token', rate: {}, usdInput: 5, usdOutput: 25,
      convertible: true, pointsInput: 3500, pointsOutput: 17500,
    });
    expect(price).toMatchObject({ usdCachedInput: null, pointsCachedInput: null });
  });

  it('a usage line without cache tokens or basis: nothing cached, basis unknown, and the sum is what it was', () => {
    const old = usageLineSchema.parse({
      kind: 'chat', vendorKey: 'kiro', modelName: 'claude-opus-5.5', unit: 'token', inputTokens: 8000, outputTokens: 200, quantity: 0,
      estimated: false, ratedBy: 'kiro/claude-opus-5.5', inputPrice: 300, outputPrice: 1500, points: 2.7,
    });
    expect(old).toMatchObject({ cachedInputTokens: 0, cachedInputPrice: null, basis: null });
    expect(usageTerms(old).map((t) => [t.label, t.quantity, t.price, t.points])).toEqual([
      ['输入', 8000, 300, 2.4],
      ['输出', 200, 1500, 0.3],
    ]);
    // 没记来历：只说照价格表里哪一行
    expect(usageBasisText(old)).toBe('照价格表 kiro/claude-opus-5.5 那一行');
  });
});

describe('the basis of a deduction', () => {
  it('splits a token line into input, cache hits and output, which add up to the points', () => {
    const l = line();
    const terms = usageTerms(l);
    expect(terms.map((t) => [t.label, t.quantity, t.price, t.points, t.atInputPrice])).toEqual([
      ['输入', 2_000, 3500, 7, false],
      ['缓存', 18_000, 350, 6.3, false],
      ['输出', 400, 17500, 7, false],
    ]);
    expect(terms.reduce((s, t) => s + t.points, 0)).toBeCloseTo(l.points, 6);
    expect(usagePriceUnit(l)).toBe('积分 / 百万 token');
  });

  it('bills cache hits at the input price when there is no cache price, and says so', () => {
    const terms = usageTerms(line({ cachedInputPrice: null }));
    expect(terms[1]).toMatchObject({ label: '缓存', price: 3500, points: 63, atInputPrice: true });
    // 没命中缓存的不列这一档；向量模型没有输出也不列
    expect(usageTerms(line({ cachedInputTokens: 0 })).map((t) => t.label)).toEqual(['输入', '输出']);
    expect(usageTerms(line({ kind: 'embedding', cachedInputTokens: 0, outputTokens: 0, outputPrice: 0 })).map((t) => t.label)).toEqual(['输入']);
  });

  it('counts images and seconds by the one price they use', () => {
    const image = line({ unit: 'image', quantity: 3, inputPrice: 0, outputPrice: 8.76, cachedInputTokens: 0, basis: null });
    expect(usageTerms(image)).toEqual([{ label: '张数', quantity: 3, price: 8.76, points: 3 * 8.76, atInputPrice: false }]);
    expect(usagePriceUnit(image)).toBe('积分 / 张');
    const listen = line({ unit: 'audio_second', quantity: 12, inputPrice: 0.073, outputPrice: 0, cachedInputTokens: 0, basis: null });
    expect(usageTerms(listen)[0]).toMatchObject({ label: '秒数', price: 0.073 });
  });

  it('says where the unit prices came from', () => {
    expect(usageBasisText(line())).toBe('跟随渠道：牌价 claude-opus-5.5（输入 $5 · 缓存 $0.5 · 输出 $25） ×7 ×100');
    expect(usageBasisText(line({ basis: { source: 'manual', listModelKey: null, multiplier: null, usdInput: null, usdCachedInput: null, usdOutput: null } }))).toBe(
      '单独定价（kiro/claude-opus-5.5）',
    );
    expect(
      usageBasisText(line({ ratedBy: '*/*', basis: { source: 'default', listModelKey: null, multiplier: null, usdInput: null, usdCachedInput: null, usdOutput: null } })),
    ).toBe('默认价格（*/*）');
    expect(usageBasisText(line({ ratedBy: '-', basis: null }))).toBe('没找到价格');
  });
});

describe('jastalk mock: cache prices and the basis of each deduction', () => {
  const port = new JastalkAdminMock();

  beforeEach(() => vi.stubEnv('VITE_MOCK_DELAY_MS', '0'));
  afterEach(() => vi.unstubAllEnvs());

  it('every usage line adds up from its terms, and chat after the first turn is mostly cache hits', async () => {
    const r = await port.usageActions({}, { p: 1, pageSize: 100 });
    if (!r.success) throw new Error('usage failed');
    const lines = r.data.items.flatMap((a) => a.calls).map((c) => usageLineSchema.parse(c.line));
    expect(lines.length).toBeGreaterThan(10);
    for (const l of lines) {
      expect(usageTerms(l).reduce((s, t) => s + t.points, 0)).toBeCloseTo(l.points, 6);
      expect(l.basis).not.toBeNull();
    }
    const cachedChat = lines.filter((l) => l.kind === 'chat' && l.cachedInputTokens > 0);
    expect(cachedChat.length).toBeGreaterThan(0);
    expect(cachedChat.every((l) => l.cachedInputTokens > l.inputTokens)).toBe(true);
  });

  it('a manual price keeps its own cache price; leaving it out of a save keeps the old one, null means at the input price', async () => {
    const save = (over: Record<string, unknown>) =>
      port.saveRate({ vendorKey: 'claude', modelName: 'claude-haiku-5-5', unit: 'token', inputPrice: 600, outputPrice: 3000, ...over });

    const kept = await save({});
    expect(kept.success && kept.data.cachedInputPrice).toBe(60);
    const cleared = await save({ cachedInputPrice: null });
    expect(cleared.success && cleared.data.cachedInputPrice).toBeNull();
    const set = await save({ cachedInputPrice: 45 });
    expect(set.success && set.data.cachedInputPrice).toBe(45);
    const negative = await save({ cachedInputPrice: -1 });
    expect(negative.success).toBe(false);
  });
});
