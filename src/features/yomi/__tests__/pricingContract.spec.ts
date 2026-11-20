import { beforeEach, describe, expect, it } from 'vitest';

import {
  BillingTypeLabel,
  MODEL_PRICE_CURRENCY,
  PRICE_CURRENCY,
  billingTypeValues,
  inferMaker,
  modelPriceSchema,
  rateBodySchema,
  rateSchema,
} from '@yomi/common';

import { describeCompile } from '../components/pricing/compileFeedback';
import { _resetYomiStore, getYomiStore } from '../services/mock/data';
import { allowedManualBillingTypes, priceDisplay, rateBodyDisplay, resolvePriceModelKind } from '../model/priceTable';
import { scaleRateBody } from '../model/rateScale';
import { providerGroupSchema, type VendorPricingMode } from '../model/catalog.types';
import { formatVendorPricing, inheritOptionLabel, routeCreditPricing } from '../model/vendorPricing';
import { OFFICIAL_USD_PRICES } from '../services/mock/officialUsdPrices';
import { YomiPricingMock } from '../services/mock/yomiPricingMock';

/**
 * 价格表契约：这些用例是给后端看的验收标准，而不是前端的自娱自乐。
 *
 * - 价格表是美元，没有汇率设置项；
 * - 价格表是 OneApi 的（在「组件设置 → OneApi → 模型价格」里维护），悠米只按键查一行：
 *   端口上没有写基准价、删基准价、拉官方价、套用候选这四样，也没有整张表的列表；
 * - 有效价(CNY) = 基准价(USD) × 渠道倍率，审计列只有 `sourceModelKey`（价格表的键，没有行号）/ `multiplierApplied`；
 * - 重算结果带 `priceTableEmpty` / `invalidPriceKeys`：没有牌价、牌价有坏行都要明说，不能说成「无变化」；
 * - 不再另乘 7；`PriceCompileResult` 没有 `skipped`。
 */
describe('pricing contract', () => {
  beforeEach(() => _resetYomiStore());

  it('catalog is USD and effective rates are CNY', () => {
    expect(MODEL_PRICE_CURRENCY).toBe('USD');
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
    expect(inferMaker('nai-diffusion-4-5-full')).toBe('novelai');
    expect(inferMaker('some-unknown-thing')).toBe('other');
  });

  it('the catalog spans every metering shape, not just per_token', () => {
    const store = getYomiStore();
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

  it('a price table row is what the pool console publishes: keyed by modelKey, USD, no row id or source', () => {
    const row = {
      modelKey: 'gpt-4o',
      maker: 'openai',
      billingType: 'per_token',
      rate: { input: { perMToken: 2.5 }, output: { perMToken: 10 } },
      currency: 'USD',
      capabilities: { audio: false, reasoning: false, embedding: false },
      routeCount: 2,
      updatedAtUtc: 1758200000000,
    };
    expect(modelPriceSchema.parse(row)).toEqual(row);
    expect(modelPriceSchema.safeParse({ ...row, capabilities: null }).success).toBe(true);
    expect(modelPriceSchema.safeParse({ ...row, currency: 'CNY' }).success).toBe(false);
    // 时间是 Unix 毫秒
    expect(modelPriceSchema.safeParse({ ...row, updatedAtUtc: '2026-11-19T00:00:00Z' }).success).toBe(false);

    // 改之前的行（有行号、来源、生效时间，没有 updatedAtUtc）不再认；多带的旧字段读进来也会被丢掉
    const legacy: Record<string, unknown> = { ...row, id: '20000001', source: 'models_dev', effectiveFromUtc: 1758200000000 };
    delete legacy.updatedAtUtc;
    expect(modelPriceSchema.safeParse(legacy).success).toBe(false);
    const parsed = modelPriceSchema.parse({ ...row, id: '20000001', source: 'models_dev' });
    expect('id' in parsed || 'source' in parsed).toBe(false);
  });

  it('vendor_rates wire row audit columns are sourceModelKey + multiplierApplied only', () => {
    const parsed = rateSchema.safeParse({
      id: '30000001',
      modelId: 'yomi-gpt-4o',
      billingType: 'per_token',
      rate: { input: { perMToken: 3 }, output: { perMToken: 12 } },
      currency: 'CNY',
      effectiveFromUtc: 1758200000000,
      updatedAtUtc: 1758200000000,
      sourceModelKey: 'gpt-4o',
      multiplierApplied: 1.2,
      // 改名之前的字段：价格表没有行号了，带过来也不读
      sourcePriceId: '20000001',
      // 后端若仍下发 fxApplied，zod 会静默丢掉——前端不再读它。
      fxApplied: 7,
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && 'fxApplied' in parsed.data).toBe(false);
    expect(parsed.success && parsed.data.sourceModelKey).toBe('gpt-4o');
    expect(parsed.success && 'sourcePriceId' in parsed.data).toBe(false);
  });

  it('the catalog is the whole official snapshot in USD, not a list of in-use models', () => {
    const store = getYomiStore();
    expect(store.modelPrices).toHaveLength(OFFICIAL_USD_PRICES.length);
    expect(store.modelPrices.filter((p) => p.billingType === 'per_token')).toHaveLength(
      OFFICIAL_USD_PRICES.filter((r) => r.kind === 'llm' || r.kind === 'embedding').length,
    );

    const gpt4o = store.modelPrices.find((p) => p.modelKey === 'gpt-4o');
    expect(gpt4o?.maker).toBe('openai');
    expect(gpt4o?.currency).toBe(MODEL_PRICE_CURRENCY);
    if (gpt4o?.billingType === 'per_token') {
      expect(gpt4o.rate.input.perMToken).toBeCloseTo(2.5, 6);
    }
    const gpt4oShow = priceDisplay(gpt4o!);
    expect(gpt4oShow.columns[0]![0]!.text).toMatch(/2\.50/);
    expect(gpt4oShow.columns[0]![0]!.text).not.toMatch(/¥/);

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
    const store = getYomiStore();
    const show = (key: string) => priceDisplay(store.modelPrices.find((p) => p.modelKey === key)!);

    // 入/写一列、出/读一列，左右对照；cache 留空的那档仍要列出来，取入价并标继承（契约：留空按入价计）。
    const gpt4 = show('gpt-4');
    expect(gpt4.typeLabel).toBe('LLM');
    expect(show('dall-e-3').typeLabel).toBe('图像');
    expect(show('veo-3').typeLabel).toBe('视频');
    expect(show('whisper-1').typeLabel).toBe('音频');
    expect(show('tts-1').typeLabel).toBe('语音');
    expect(gpt4.columns.map((c) => c.map((p) => p.label))).toEqual([
      ['入', '写 5m', '写 1h'],
      ['出', '读'],
    ]);
    expect(gpt4.columns.map((c) => c.map((p) => p.kind))).toEqual([
      ['input', 'cacheWrite', 'cacheWrite1h'],
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
      ['input', 'cacheWrite', 'cacheWrite1h'],
      ['output', 'cacheRead'],
    ]);
    expect(effective.columns.map((c) => c.map((p) => p.kind))).toEqual([
      ['input', 'cacheWrite', 'cacheWrite1h'],
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

  it('cache writes show both tiers; a blank 1-hour price is the 5-minute price × 1.6', () => {
    const write1h = (body: Parameters<typeof rateBodyDisplay>[0]) => rateBodyDisplay(body).columns[0]?.[2];

    // 配了专价：照填的数显示，不标继承。
    const priced = {
      billingType: 'per_token' as const,
      rate: {
        input: { perMToken: 10, cachedWrite: 12.5, cachedWrite1h: 22, cachedRead: 1 },
        output: { perMToken: 40 },
      },
    };
    expect(write1h(priced)).toMatchObject({ kind: 'cacheWrite1h', label: '写 1h' });
    expect(write1h(priced)?.inherited).toBeUndefined();
    expect(write1h(priced)?.text).toBe(
      rateBodyDisplay({ ...priced, rate: { ...priced.rate, input: { perMToken: 22 } } }).columns[0]?.[0]?.text,
    );

    // 留空：12.5 × 1.6 = 20，和后端实扣用的是同一个数，标继承并写明是照什么推的。
    const derived = {
      billingType: 'per_token' as const,
      rate: { input: { perMToken: 10, cachedWrite: 12.5 }, output: { perMToken: 40 } },
    };
    expect(write1h(derived)).toMatchObject({ kind: 'cacheWrite1h', inherited: true, inheritedNote: '5m × 1.6' });
    expect(write1h(derived)?.text).toBe(
      rateBodyDisplay({ ...derived, rate: { ...derived.rate, input: { perMToken: 20 } } }).columns[0]?.[0]?.text,
    );

    // 两档都没配：5 分钟档按入价，1 小时档在它上面乘 1.6。
    const bare = {
      billingType: 'per_token' as const,
      rate: { input: { perMToken: 10 }, output: { perMToken: 40 } },
    };
    expect(write1h(bare)?.text).toBe(
      rateBodyDisplay({ ...bare, rate: { ...bare.rate, input: { perMToken: 16 } } }).columns[0]?.[0]?.text,
    );

    // 缩放要带上专价：漏了的话渠道倍率一乘，1 小时价就从价格表里掉了，后端退回按比例推。
    const scaled = scaleRateBody(priced, 1.25);
    expect(scaled.billingType === 'per_token' && scaled.rate.input.cachedWrite1h).toBe(27.5);
    // 没配的不凭空长出来：留空是「按比例推」这个语义，缩放后仍然是留空。
    const scaledBare = scaleRateBody(derived, 1.25);
    expect(scaledBare.billingType === 'per_token' && 'cachedWrite1h' in scaledBare.rate.input).toBe(false);
  });

  it('the price table is not Yomi\'s: the port cannot write, delete, sync or list it', () => {
    const port: object = new YomiPricingMock();
    // 写、删、拉官方价、套用候选这四样对应的接口后端已经删了；整张表的列表页也搬到了「组件设置 → OneApi → 模型价格」。
    // 端口上再长出来就是有人又接了回去
    for (const gone of ['upsertModelPrice', 'deleteModelPrice', 'fetchPrices', 'applyPrices', 'listModelPricesByMaker']) {
      expect(gone in port).toBe(false);
    }
  });

  it('one list price can still be looked up by key, for the route pricing preview', async () => {
    const port = new YomiPricingMock();

    const exact = await port.getModelPrice('gemini-2.5-pro');
    expect(exact.success && exact.data.maker).toBe('google');
    expect(exact.success && exact.data.currency).toBe(MODEL_PRICE_CURRENCY);

    // 路由上的上游模型名可以带渠道前缀和日期钉：先收成价格表的键再找
    const decorated = await port.getModelPrice('anthropic/claude-sonnet-4-5-20250929');
    expect(decorated.success && decorated.data.modelKey).toBe('claude-sonnet-4-5');

    const missing = await port.getModelPrice('no-such-model');
    expect(missing.success).toBe(false);
    expect(!missing.success && missing.error.code).toBe('not_found');
  });

  it('compile = USD catalog × vendor multiplier → CNY', async () => {
    const store = getYomiStore();
    const port = new YomiPricingMock();

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
    const setV = await port.setVendorPricing({ vendorId: group.id, mode: 'multiplier', value: 1.5 });
    expect(setV.success).toBe(true);
    const setR = await port.setRoutePricing({ routeId: route.uid, mode: 'compiled', multiplier: 2 });
    expect(setR.success).toBe(true);
    expect(setR.success && 'skipped' in setR.data).toBe(false);

    const rate = store.rate.find((x) => x.modelId === route.routeKey)!;
    expect(rate.currency).toBe(PRICE_CURRENCY);
    expect(rate.sourceModelKey).toBe(price.modelKey);
    expect(rate.multiplierApplied).toBe(3);
    expect('fxApplied' in rate).toBe(false);
    if (price.billingType === 'per_token' && rate.billingType === 'per_token') {
      expect(rate.rate.input.perMToken).toBeCloseTo(price.rate.input.perMToken * 3, 6);
    }
  });

  it('with no price table at hand, list-priced routes are left alone and the result says so', async () => {
    const store = getYomiStore();
    const port = new YomiPricingMock();
    const multiplierGroup = store.providerGroups.find(
      (g) => g.pricingMode === 'multiplier' && store.vendorRoutes.some((v) => v.vendorKey === g.queueGroup && v.pricingMode === 'compiled'),
    )!;
    const before = JSON.stringify(store.rate);

    // 号池管理台还没发布 / 这次没读到：表是空的
    store.modelPrices.splice(0);
    const r = await port.setVendorPricing({ vendorId: multiplierGroup.id, mode: 'multiplier', value: 9 });
    expect(r.success).toBe(true);
    if (!r.success) return;
    // 不重算、不报「无基准价」（空表说明不了哪个模型缺价），现有的有效价一个字不动
    expect(r.data).toMatchObject({ compiled: 0, unmatchedModelKeys: [], newVersion: null, priceTableEmpty: true, invalidPriceKeys: [] });
    expect(JSON.stringify(store.rate)).toBe(before);

    // 积分渠道不看价格表：没有牌价照样编得出来，也不算「没有牌价」
    const credit = await port.setVendorPricing({ vendorId: multiplierGroup.id, mode: 'credit', value: 0.03 });
    expect(credit.success).toBe(true);
    if (!credit.success) return;
    expect(credit.data.compiled).toBeGreaterThan(0);
    expect(credit.data.priceTableEmpty).toBe(false);
  });

  it('the compile summary says "no list prices" instead of "nothing changed", and names the unusable price keys', () => {
    const result = (over: Partial<Parameters<typeof describeCompile>[0]>) => ({
      compiled: 0, unchanged: 0, unmatchedModelKeys: [], newVersion: null, priceTableEmpty: false, invalidPriceKeys: [], ...over,
    });
    expect(describeCompile(result({}))).toBe('有效价无变化');
    expect(describeCompile(result({ compiled: 3, unchanged: 2, unmatchedModelKeys: ['x'], newVersion: 7 }))).toBe(
      '已重算 3 条有效价，2 条数值相同未动，1 个模型无基准价，版本 → v7',
    );
    // 没有牌价是没法算，不是没有变化
    expect(describeCompile(result({ priceTableEmpty: true }))).toBe('手上没有牌价，没有重算');
    // 积分渠道不看价格表，没有牌价时也可能编出几条
    expect(describeCompile(result({ compiled: 2, priceTableEmpty: true, newVersion: 8 }))).toBe(
      '已重算 2 条有效价，手上没有牌价，按牌价出价的没有重算，版本 → v8',
    );
    expect(describeCompile(result({ compiled: 1, invalidPriceKeys: ['gpt-9', 'claude-x'], newVersion: 9 }))).toBe(
      '已重算 1 条有效价，2 行牌价用不了：gpt-9、claude-x，版本 → v9',
    );
    // 坏行多了只列前五个，报总数
    expect(describeCompile(result({ invalidPriceKeys: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }))).toBe(
      '有效价无变化，7 行牌价用不了：a、b、c、d、e 等 7 个',
    );
  });

  it('custom rates can only switch metering within the same product family — credits cross every family', () => {
    // 积分不是模态，是上游报的结算点数：除向量外每一类都能改挂 per_credit。
    expect(allowedManualBillingTypes('per_token')).toEqual(['per_token', 'per_call', 'per_credit']);
    expect(allowedManualBillingTypes('per_call')).toEqual(['per_token', 'per_call', 'per_credit']);
    expect(allowedManualBillingTypes('embedding')).toEqual(['per_token']);
    expect(allowedManualBillingTypes('per_image')).toEqual(['per_image', 'per_credit']);
    expect(allowedManualBillingTypes('per_video')).toEqual(['per_video', 'per_credit']);
    expect(allowedManualBillingTypes('per_audio_minute')).toEqual(['per_audio_minute', 'per_credit']);
    expect(allowedManualBillingTypes('per_character')).toEqual(['per_character', 'per_credit']);
    expect(allowedManualBillingTypes('per_credit')).toEqual(['per_credit']);

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
    expect(
      resolvePriceModelKind({ modelKey: 'nai-diffusion-4-5-full', catalogBillingType: 'per_credit' }),
    ).toBe('per_credit');
  });

  it('per_credit rate body is { pricePerCredit } and must be a non-negative number', () => {
    expect(billingTypeValues).toContain('per_credit');
    expect(BillingTypeLabel.per_credit).toBe('积分计费');

    const ok = rateBodySchema.safeParse({ billingType: 'per_credit', rate: { pricePerCredit: 0.01 } });
    expect(ok.success).toBe(true);
    expect(
      rateBodySchema.safeParse({ billingType: 'per_credit', rate: { pricePerCredit: -0.01 } }).success,
    ).toBe(false);
    expect(rateBodySchema.safeParse({ billingType: 'per_credit', rate: {} }).success).toBe(false);
    expect(
      rateBodySchema.safeParse({ billingType: 'per_credit', rate: { pricePerCredit: '0.01' } }).success,
    ).toBe(false);
  });

  it('per_credit renders as one 积分 price and scales like the other single-price types', () => {
    const body = { billingType: 'per_credit' as const, rate: { pricePerCredit: 0.002 } };
    const shown = rateBodyDisplay(body, false, MODEL_PRICE_CURRENCY);
    expect(shown.kind).toBe('per_credit');
    expect(shown.typeLabel).toBe('积分');
    expect(shown.columns.map((c) => c.map((p) => p.kind))).toEqual([['credit']]);
    expect(shown.compact).toBeNull();
    expect(shown.note).toBeNull();

    const scaled = scaleRateBody(body, 1.5);
    expect(scaled).toEqual({ billingType: 'per_credit', rate: { pricePerCredit: 0.003 } });
  });

  it('credit vendor: inheriting routes take its credit price, ignoring the catalog and multipliers', async () => {
    const store = getYomiStore();
    const port = new YomiPricingMock();

    // 挑价格表里有牌价的：换回倍率时要能编回价格表。没牌价的编不出新价，按编译器的规矩保留旧价、报未匹配。
    const route = store.vendorRoutes.find(
      (v) =>
        v.pricingMode === 'compiled' &&
        store.providerGroups.some((g) => g.queueGroup === v.vendorKey) &&
        store.modelPrices.some((p) => p.modelKey === v.vendorModel.trim().toLowerCase()),
    );
    expect(route).toBeDefined();
    if (!route) return;
    const group = store.providerGroups.find((g) => g.queueGroup === route.vendorKey)!;

    const set = await port.setVendorPricing({ vendorId: group.id, mode: 'credit', value: 0.028 });
    expect(set.success).toBe(true);
    expect(group.pricingMode).toBe('credit');
    expect(group.pricingValue).toBe(0.028);

    const rate = store.rate.find((x) => x.modelId === route.routeKey)!;
    expect(rate.billingType).toBe('per_credit');
    expect(rate.billingType === 'per_credit' && rate.rate.pricePerCredit).toBe(0.028);
    expect(rate.sourceModelKey).toBeNull();
    expect(rate.multiplierApplied).toBeNull();

    // 换回倍率：只存一个值，倍率要重新给；回到价格表 × 倍率。
    const back = await port.setVendorPricing({ vendorId: group.id, mode: 'multiplier', value: 1 });
    expect(back.success).toBe(true);
    expect(store.rate.find((x) => x.modelId === route.routeKey)!.billingType).not.toBe('per_credit');
  });

  it('vendor pricing rejects negative values', async () => {
    const store = getYomiStore();
    const port = new YomiPricingMock();
    const group = store.providerGroups[0]!;

    expect((await port.setVendorPricing({ vendorId: group.id, mode: 'credit', value: -0.01 })).success).toBe(false);
    expect(group.pricingMode).toBe('multiplier');
  });
});

describe('vendor pricing display', () => {
  const group = (pricingMode: VendorPricingMode, pricingValue: number) => ({ pricingMode, pricingValue });

  it('reads mode and value off the wire, defaulting old rows to multiplier ×1', () => {
    const base = {
      id: 1,
      queueGroup: 'kiro',
      status: 'active',
      upstreamModelCount: 0,
      createdAtUtc: 0,
      updatedAtUtc: 0,
    };
    const credit = providerGroupSchema.parse({ ...base, pricingMode: 'credit', pricingValue: 0.028 });
    expect(credit.pricingMode).toBe('credit');
    expect(credit.pricingValue).toBe(0.028);

    const legacy = providerGroupSchema.parse(base);
    expect(legacy.pricingMode).toBe('multiplier');
    expect(legacy.pricingValue).toBe(1);

    expect(providerGroupSchema.safeParse({ ...base, pricingMode: 'credit', pricingValue: -1 }).success).toBe(false);
    expect(providerGroupSchema.safeParse({ ...base, pricingMode: 'per_token', pricingValue: 1 }).success).toBe(false);
  });

  it('formats the value with its unit', () => {
    expect(formatVendorPricing(group('multiplier', 1.2))).toBe('×1.2');
    expect(formatVendorPricing(group('credit', 0.028))).toBe('¥0.028 / 积分');
    expect(formatVendorPricing(group('credit', 0.000125))).toBe('¥0.000125 / 积分');
  });

  it('a route inherits only when its vendor is credit-priced and the route follows the vendor', () => {
    expect(routeCreditPricing('compiled', group('multiplier', 1.2))).toEqual({ kind: 'none' });
    expect(routeCreditPricing('manual', group('multiplier', 1.2))).toEqual({ kind: 'none' });
    expect(routeCreditPricing('compiled', null)).toEqual({ kind: 'none' });
    expect(routeCreditPricing('compiled', group('credit', 0.028))).toEqual({ kind: 'inherit', creditPrice: 0.028 });
    expect(routeCreditPricing('manual', group('credit', 0.028))).toEqual({ kind: 'independent', creditPrice: 0.028 });
    // 0 是免费，不是「没设」：积分渠道照样继承。
    expect(routeCreditPricing('compiled', group('credit', 0))).toEqual({ kind: 'inherit', creditPrice: 0 });
  });

  it('names the inherit option by where the route stands now', () => {
    expect(inheritOptionLabel({ kind: 'none' })).toBe('渠道定价');
    expect(inheritOptionLabel({ kind: 'inherit', creditPrice: 1 })).toBe('继承渠道');
    expect(inheritOptionLabel({ kind: 'independent', creditPrice: 1 })).toBe('恢复继承渠道');
  });
});
