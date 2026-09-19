import { beforeEach, describe, expect, it } from 'vitest';

import {
  PRICE_CURRENCY,
  USD_CNY_FIXED_RATE,
  inferMaker,
  modelPriceSchema,
  rateSchema,
  upsertModelPriceInputSchema,
} from '@demux/common';

import { _resetDemuxStore, getDemuxStore } from '../services/mock/data';
import { allowedManualBillingTypes, priceDisplay, rateBodyDisplay, resolvePriceModelKind } from '../model/priceTable';
import { scaleRateBody } from '../model/rateScale';
import { OFFICIAL_USD_PRICES } from '../services/mock/officialUsdPrices';
import { DemuxPricingMock } from '../services/mock/demuxPricingMock';

/**
 * 价格表契约：这些用例是给后端看的验收标准，而不是前端的自娱自乐。
 *
 * - 基准价只有人民币，没有汇率设置项；
 * - 官方美元价在 fetch 阶段就按固定 1:7 折成人民币返回，候选带 `sourceCurrency` / `fxApplied` 备注；
 * - 有效价 = 基准价 × 渠道倍率 × 路由倍率，审计列只有 `sourcePriceId` / `multiplierApplied`；
 * - `PriceCompileResult` 没有 `skipped`——不存在「缺汇率」这种跳过原因。
 */
describe('pricing contract', () => {
  beforeEach(() => _resetDemuxStore());

  it('fixed FX is 1 USD = 7 CNY and the only price currency is CNY', () => {
    expect(USD_CNY_FIXED_RATE).toBe(7);
    expect(PRICE_CURRENCY).toBe('CNY');
  });

  it('maker is inferred from the model key for manual / legacy rows', () => {
    expect(inferMaker('gpt-4o')).toBe('openai');
    expect(inferMaker('o1-mini')).toBe('openai');
    expect(inferMaker('claude-sonnet-4-6')).toBe('anthropic');
    expect(inferMaker('anthropic/claude-3-haiku')).toBe('anthropic');
    expect(inferMaker('gemini-2.0-flash-exp')).toBe('google');
    expect(inferMaker('deepseek-chat')).toBe('deepseek');
    expect(inferMaker('qwen-max')).toBe('qwen');
    expect(inferMaker('text-embedding-v4')).toBe('qwen');
    expect(inferMaker('qwen3-embedding-8b')).toBe('qwen');
    expect(inferMaker('tongyi-embedding-vision-plus')).toBe('qwen');
    expect(inferMaker('text-embedding-3-large')).toBe('openai');
    expect(inferMaker('kimi-k2')).toBe('moonshot');
    expect(inferMaker('some-unknown-thing')).toBe('other');
  });

  it('the catalog spans every metering shape, not just per_token', () => {
    const store = getDemuxStore();
    // 计量方式是模型自己的属性：文本按 token，生图按张，视频按秒——价格表要容得下全部。
    const shapes = new Set(store.modelPrices.map((p) => p.billingType));
    expect(shapes).toEqual(
      new Set(['per_token', 'per_image', 'per_video', 'per_audio_minute', 'per_character']),
    );

    const caps = (key: string) => store.modelPrices.find((p) => p.modelKey === key)?.capabilities;
    // models.dev 的 modalities / reasoning：会 thinking 的、收音频的，表单才放出对应的档。
    expect(caps('claude-sonnet-4-5')).toEqual({ audio: false, reasoning: true, embedding: false });
    expect(caps('gpt-4o')).toEqual({ audio: false, reasoning: false, embedding: false });
    expect(caps('gpt-realtime-2.1')).toEqual({ audio: true, reasoning: true, embedding: false });
    expect(caps('text-embedding-v4')).toEqual({ audio: false, reasoning: false, embedding: true });
    expect(caps('text-embedding-3-large')).toEqual({ audio: false, reasoning: false, embedding: true });
  });

  it('model_prices wire row must be CNY and carry a maker; any other currency is rejected', () => {
    const row = {
      id: '20000001',
      modelKey: 'gpt-4o',
      maker: 'openai',
      billingType: 'per_token',
      rate: { input: { perMToken: 17.5 }, output: { perMToken: 70 } },
      currency: 'CNY',
      source: 'models_dev',
      sourceRef: 'openai/gpt-4o',
      fetchedAtUtc: 1758200000000,
      effectiveFromUtc: 1758200000000,
      routeCount: 2,
    };
    expect(modelPriceSchema.safeParse(row).success).toBe(true);
    expect(modelPriceSchema.safeParse({ ...row, currency: 'USD' }).success).toBe(false);
  });

  it('upsert model price input carries neither currency nor effective time', () => {
    const parsed = upsertModelPriceInputSchema.safeParse({
      modelKey: 'gpt-4o',
      billingType: 'per_token',
      rate: { input: { perMToken: 17.5 }, output: { perMToken: 70 } },
      source: 'manual',
      effectiveFromUtc: 1758200000000,
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && 'currency' in parsed.data).toBe(false);
    expect(parsed.success && 'effectiveFromUtc' in parsed.data).toBe(false);
  });

  it('vendor_rates wire row audit columns are sourcePriceId + multiplierApplied only', () => {
    const parsed = rateSchema.safeParse({
      id: '30000001',
      modelId: 'demux-gpt-4o',
      billingType: 'per_token',
      rate: { input: { perMToken: 21 }, output: { perMToken: 84 } },
      currency: 'CNY',
      effectiveFromUtc: 1758200000000,
      updatedAtUtc: 1758200000000,
      sourcePriceId: '20000001',
      multiplierApplied: 1.2,
      // 后端若仍下发 fxApplied，zod 会静默丢掉——前端不再读它。
      fxApplied: 7,
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && 'fxApplied' in parsed.data).toBe(false);
  });

  it('fetched candidates are already CNY (usd × 7) and annotate the conversion', async () => {
    const port = new DemuxPricingMock();
    const r = await port.fetchPrices({ sources: [{ kind: 'models_dev' }], onlyMatched: true });
    expect(r.success).toBe(true);
    if (!r.success) return;

    const candidates = r.data.items.flatMap((it) => it.candidates);
    expect(candidates.length).toBeGreaterThan(0);
    for (const c of candidates) {
      expect(c.sourceCurrency).toBe('USD');
      expect(c.fxApplied).toBe(USD_CNY_FIXED_RATE);
      expect(c.maker).toBeTruthy();
      expect('currency' in c).toBe(false);
    }
  });

  it('the catalog is the whole official snapshot converted at 7, not a list of in-use models', () => {
    const store = getDemuxStore();
    expect(store.modelPrices).toHaveLength(OFFICIAL_USD_PRICES.length);
    expect(store.modelPrices.filter((p) => p.billingType === 'per_token')).toHaveLength(
      OFFICIAL_USD_PRICES.filter((r) => r.kind === 'llm' || r.kind === 'embedding').length,
    );

    const gpt4o = store.modelPrices.find((p) => p.modelKey === 'gpt-4o');
    expect(gpt4o?.maker).toBe('openai');
    expect(gpt4o?.currency).toBe(PRICE_CURRENCY);
    if (gpt4o?.billingType === 'per_token') {
      expect(gpt4o.rate.input.perMToken).toBeCloseTo(2.5 * USD_CNY_FIXED_RATE, 6);
    }

    // 阿里云也转售 glm / kimi，但厂家要归到真正做模型的那家。
    expect(store.modelPrices.find((p) => p.modelKey === 'glm-5.2')?.maker).toBe('zhipu');
    expect(store.modelPrices.find((p) => p.modelKey === 'kimi-k3')?.maker).toBe('moonshot');
    expect(store.modelPrices.find((p) => p.modelKey === 'text-embedding-v4')?.maker).toBe('qwen');
    expect(store.modelPrices.find((p) => p.modelKey === 'qwen3-embedding-8b')?.maker).toBe('qwen');

    const emb = OFFICIAL_USD_PRICES.find((r) => r.modelKey === 'text-embedding-v4');
    expect(emb?.kind).toBe('embedding');
    if (emb?.kind === 'embedding') expect('output' in emb).toBe(false);
    expect(OFFICIAL_USD_PRICES.find((r) => r.modelKey === 'gpt-4o')?.kind).toBe('llm');
    expect(OFFICIAL_USD_PRICES.find((r) => r.modelKey === 'dall-e-3')?.kind).toBe('image');
  });

  it('every metering shape renders as 模型 / 类型 / 价格 in one table', () => {
    const store = getDemuxStore();
    const show = (key: string) => priceDisplay(store.modelPrices.find((p) => p.modelKey === key)!);

    // 入/写一列、出/读一列，左右对照；cache 留空的那档仍要列出来，取入价并标继承（契约：留空按入价计）。
    const gpt4 = show('gpt-4');
    expect(gpt4.typeLabel).toBe('LLM');
    expect(show('dall-e-3').typeLabel).toBe('图像');
    expect(show('veo-3').typeLabel).toBe('视频');
    expect(show('whisper-1').typeLabel).toBe('音频');
    expect(show('tts-1').typeLabel).toBe('语音');
    expect(gpt4.columns.map((c) => c.map((p) => p.label))).toEqual([
      ['入', '写'],
      ['出', '读'],
    ]);
    expect(gpt4.columns.map((c) => c.map((p) => p.kind))).toEqual([
      ['input', 'cacheWrite'],
      ['output', 'cacheRead'],
    ]);
    expect(gpt4.columns[1]![1]!.text).toBe(gpt4.columns[0]![0]!.text);
    expect(gpt4.columns[1]![1]!.inherited).toBe(true);

    // 生图：图片 icon + 尺寸² · 质量，同尺寸相邻档落在同一列
    const dalle = show('dall-e-3');
    expect(dalle.columns.map((c) => c.map((p) => p.kind))).toEqual([
      ['image', 'image'],
      ['image', 'image'],
    ]);
    expect(dalle.columns.map((c) => c.map((p) => p.caption))).toEqual([
      ['1024² · std', '1024² · HD'],
      ['1792×1024 · std', '1792×1024 · HD'],
    ]);
    expect(dalle.compact?.count).toBe(4);

    const veo = show('veo-3');
    expect(veo.columns[0]!.map((p) => p.kind)).toEqual(['video', 'video']);
    expect(veo.columns[0]!.map((p) => p.caption)).toEqual(['720p', '1080p']);
    expect(veo.note).toBe('时长 4–8 秒');
    expect(veo.compact).toBeNull();

    // 向量化：类型是「向量」，价格只留入价，不出、也不列继承出来的缓存档。
    const qwenEmb = show('text-embedding-v4');
    expect(qwenEmb.kind).toBe('embedding');
    expect(qwenEmb.typeLabel).toBe('向量');
    expect(qwenEmb.price.maker).toBe('qwen');
    expect(qwenEmb.columns.map((c) => c.map((p) => p.kind))).toEqual([['input']]);
    expect(show('text-embedding-3-large').typeLabel).toBe('向量');
    expect(show('mistral-embed').typeLabel).toBe('向量');
  });

  it('compiled preview is 入/写 | 出/读, each tier catalog × multiplier', () => {
    const body = {
      billingType: 'per_token' as const,
      rate: {
        input: { perMToken: 10, cachedWrite: 12.5, cachedRead: 1 },
        output: { perMToken: 40 },
      },
    };
    const catalog = rateBodyDisplay(body);
    const effective = rateBodyDisplay(scaleRateBody(body, 1.25));
    expect(catalog.columns.map((c) => c.map((p) => p.kind))).toEqual([
      ['input', 'cacheWrite'],
      ['output', 'cacheRead'],
    ]);
    expect(effective.columns.map((c) => c.map((p) => p.kind))).toEqual([
      ['input', 'cacheWrite'],
      ['output', 'cacheRead'],
    ]);
    const expected = rateBodyDisplay({
      billingType: 'per_token',
      rate: {
        input: { perMToken: 12.5, cachedWrite: 15.625, cachedRead: 1.25 },
        output: { perMToken: 50 },
      },
    });
    expect(effective.columns.flat().map((p) => p.text)).toEqual(
      expected.columns.flat().map((p) => p.text),
    );
  });

  it('a few seeded rows deviate from the official sheet so the sync diff has something to show', async () => {
    const port = new DemuxPricingMock();
    const r = await port.fetchPrices({ sources: [{ kind: 'models_dev' }] });
    expect(r.success).toBe(true);
    if (!r.success) return;

    const changed = r.data.items.filter((it) => it.candidates.some((c) => !c.sameAsCurrent));
    expect(changed.map((it) => it.modelKey).sort()).toEqual([
      'claude-sonnet-4-5',
      'gemini-2.5-flash',
      'gpt-4.1',
    ]);
    // 其余的目录行就是官方价，同步出来不该有差异。
    expect(changed.length).toBeLessThan(r.data.items.length);
  });

  it('fetch can be scoped to one maker, and the grouped list is models only — no route-side gaps', async () => {
    const port = new DemuxPricingMock();

    const scoped = await port.fetchPrices({ sources: [{ kind: 'models_dev' }], makers: ['anthropic'] });
    expect(scoped.success).toBe(true);
    if (!scoped.success) return;
    expect(scoped.data.items.length).toBe(OFFICIAL_USD_PRICES.filter((r) => r.maker === 'anthropic').length);
    for (const it of scoped.data.items) expect(it.maker).toBe('anthropic');

    const grouped = await port.listModelPricesByMaker({ keyword: '' });
    expect(grouped.success).toBe(true);
    if (!grouped.success) return;
    const makers = grouped.data.map((g) => g.maker);
    expect(new Set(makers).size).toBe(makers.length);
    for (const g of grouped.data) {
      // 价格表只登记厂家发布的模型：分组里除了 items 没有别的（路由缺口归模型页）。
      expect(Object.keys(g).sort()).toEqual(['items', 'maker']);
      for (const p of g.items) expect(p.maker).toBe(g.maker);
    }
    const google = grouped.data.find((g) => g.maker === 'google');
    expect(google?.items.some((p) => p.modelKey === 'gemini-2.5-pro')).toBe(true);
  });

  it('compile = base × vendor multiplier × route multiplier, no FX factor', async () => {
    const store = getDemuxStore();
    const port = new DemuxPricingMock();

    const route = store.vendorRoutes.find(
      (v) =>
        v.pricingMode === 'compiled' &&
        store.providerGroups.some((g) => g.queueGroup === v.vendorKey) &&
        store.modelPrices.some((p) => p.modelKey === v.vendorModel.trim().toLowerCase()),
    );
    expect(route).toBeDefined();
    if (!route) return;
    const price = store.modelPrices.find((p) => p.modelKey === route.vendorModel.trim().toLowerCase())!;

    const group = store.providerGroups.find((g) => g.queueGroup === route.vendorKey)!;
    const setV = await port.setVendorMultiplier({ vendorId: group.id, multiplier: 1.5 });
    expect(setV.success).toBe(true);
    const setR = await port.setRoutePricing({ routeId: route.uid, mode: 'compiled', multiplier: 2 });
    expect(setR.success).toBe(true);
    expect(setR.success && 'skipped' in setR.data).toBe(false);

    const rate = store.rate.find((x) => x.modelId === route.routeKey)!;
    expect(rate.currency).toBe(PRICE_CURRENCY);
    expect(rate.sourcePriceId).toBe(price.id);
    expect(rate.multiplierApplied).toBe(3);
    expect('fxApplied' in rate).toBe(false);
    if (price.billingType === 'per_token' && rate.billingType === 'per_token') {
      expect(rate.rate.input.perMToken).toBeCloseTo(price.rate.input.perMToken * 3, 6);
    }
  });

  it('custom rates can only switch metering within the same product family', () => {
    expect(allowedManualBillingTypes('per_token')).toEqual(['per_token', 'per_call']);
    expect(allowedManualBillingTypes('per_call')).toEqual(['per_token', 'per_call']);
    expect(allowedManualBillingTypes('embedding')).toEqual(['per_token']);
    expect(allowedManualBillingTypes('per_image')).toEqual(['per_image']);
    expect(allowedManualBillingTypes('per_video')).toEqual(['per_video']);
    expect(allowedManualBillingTypes('per_audio_minute')).toEqual(['per_audio_minute']);
    expect(allowedManualBillingTypes('per_character')).toEqual(['per_character']);

    expect(
      resolvePriceModelKind({ modelKey: 'gpt-4o', catalogBillingType: 'per_token' }),
    ).toBe('per_token');
    expect(
      resolvePriceModelKind({ modelKey: 'dall-e-3', catalogBillingType: 'per_image' }),
    ).toBe('per_image');
    expect(
      resolvePriceModelKind({
        modelKey: 'text-embedding-3-large',
        catalogBillingType: 'per_token',
        capabilities: { audio: false, reasoning: false, embedding: true },
      }),
    ).toBe('embedding');
    // 价格表缺失时不当成「什么都能选」，按对话模型只给按量/按次
    expect(resolvePriceModelKind({ modelKey: 'claude-internal-preview' })).toBe('per_token');
  });
});
