import { beforeEach, describe, expect, it } from 'vitest';

import {
  BillingTypeLabel,
  MODEL_PRICE_CURRENCY,
  PRICE_CURRENCY,
  billingTypeValues,
  inferMaker,
  modelFamilyLabel,
  modelPriceSchema,
  rateBodySchema,
  rateSchema,
} from '@yomi/common';

import { describeCompile } from '../components/pricing/compileFeedback';
import { _resetYomiStore, getYomiStore } from '../services/mock/data';
import { allowedManualBillingTypes, priceDisplay, rateBodyDisplay, resolvePriceModelKind } from '../model/priceTable';
import { scaleRateBody } from '../model/rateScale';
import { providerGroupSchema } from '../model/catalog.types';
import {
  familyPricingOf,
  familyReadsPriceTable,
  formatFamilyPricing,
  formatFamilyPricingValue,
  routePricingChoice,
} from '../model/familyPricing';
import { OFFICIAL_USD_PRICES } from '../services/mock/officialUsdPrices';
import { YomiPricingMock } from '../services/mock/yomiPricingMock';
import { YomiRateMock } from '../services/mock/yomiRateMock';

/**
 * 价格表契约：这些用例是给后端看的验收标准，而不是前端的自娱自乐。
 *
 * - 价格表是美元，没有汇率设置项；
 * - 价格表是 OneApi 的（在「组件设置 → OneApi → 模型价格」里维护），悠米只按键查一行：
 *   端口上没有写基准价、删基准价、拉官方价、套用候选这四样，也没有整张表的列表；
 * - 有效价(CNY) = 基准价(USD) × 倍率，审计列只有 `sourceModelKey`（价格表的键，没有行号）/ `multiplierApplied`；
 * - 价格不在渠道上：渠道里每个模型家族一份分组定价（倍率 / 按次价 / 积分单价），
 *   别名可以设独立倍率顶掉它（二选一，不叠乘）；渠道行上没有任何定价字段；
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

  it('compile = USD catalog × family multiplier → CNY; a route multiplier replaces it instead of stacking', async () => {
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
    const family = inferMaker(route.vendorModel);
    const rateOf = () => store.rate.find((x) => x.modelId === route.routeKey)!;

    const setF = await port.setFamilyPricing({ vendorId: group.id, family, mode: 'multiplier', value: 1.5 });
    expect(setF.success).toBe(true);
    expect(setF.success && 'skipped' in setF.data).toBe(false);
    expect(rateOf().currency).toBe(PRICE_CURRENCY);
    expect(rateOf().sourceModelKey).toBe(price.modelKey);
    expect(rateOf().multiplierApplied).toBe(1.5);
    expect('fxApplied' in rateOf()).toBe(false);

    // 独立倍率顶掉分组倍率：×2，不是 1.5 × 2。
    const setR = await port.setRoutePricing({ routeId: route.uid, mode: 'compiled', multiplier: 2 });
    expect(setR.success).toBe(true);
    const own = rateOf();
    expect(own.multiplierApplied).toBe(2);
    if (price.billingType === 'per_token' && own.billingType === 'per_token') {
      expect(own.rate.input.perMToken).toBeCloseTo(price.rate.input.perMToken * 2, 6);
    }

    // 分组倍率再改，这条不跟着动；清掉独立倍率才回去继承分组。
    await port.setFamilyPricing({ vendorId: group.id, family, mode: 'multiplier', value: 4 });
    expect(rateOf().multiplierApplied).toBe(2);
    await port.setRoutePricing({ routeId: route.uid, mode: 'compiled', multiplier: null });
    expect(rateOf().multiplierApplied).toBe(4);
  });

  it('a vendor carrying two makers lists one family per maker, each with its own multiplier', async () => {
    const store = getYomiStore();
    const port = new YomiPricingMock();
    const group = store.providerGroups.find((g) => g.queueGroup === 'antigravity')!;

    const listed = await port.listVendorFamilies(group.id);
    expect(listed.success).toBe(true);
    if (!listed.success) return;
    // 按家族顺序；Gemini 组没设过倍率，照 1 出价但标着没设过。
    expect(listed.data).toEqual([
      { family: 'anthropic', mode: 'multiplier', value: 1.3, routeCount: 2, inheritingRouteCount: 2 },
      { family: 'google', mode: 'multiplier', value: 1, routeCount: 1, inheritingRouteCount: 1 },
    ]);
    expect(listed.data.map((f) => modelFamilyLabel(f.family))).toEqual(['Claude', 'Gemini']);

    const rateOf = (routeKey: string) => store.rate.find((x) => x.modelId === routeKey)!;
    expect(rateOf('ag-claude-sonnet').multiplierApplied).toBe(1.3);
    expect(rateOf('ag-gemini-pro').multiplierApplied).toBe(1);

    // 改 Gemini 组只动 gemini 的别名；认产品名（gemini 就是 google 这一组）。
    const set = await port.setFamilyPricing({ vendorId: group.id, family: 'Gemini', mode: 'multiplier', value: 0.9 });
    expect(set.success).toBe(true);
    expect(set.success && set.data.compiled).toBe(1);
    expect(rateOf('ag-gemini-pro').multiplierApplied).toBe(0.9);
    expect(rateOf('ag-claude-sonnet').multiplierApplied).toBe(1.3);

    const after = await port.listVendorFamilies(group.id);
    expect(after.success && after.data.find((f) => f.family === 'google')).toMatchObject({
      mode: 'multiplier',
      value: 0.9,
    });

    // 设了独立倍率的别名不再算继承分组的。
    const sonnet = store.vendorRoutes.find((v) => v.routeKey === 'ag-claude-sonnet')!;
    await port.setRoutePricing({ routeId: sonnet.uid, mode: 'compiled', multiplier: 1.1 });
    const counted = await port.listVendorFamilies(group.id);
    expect(counted.success && counted.data[0]).toMatchObject({ routeCount: 2, inheritingRouteCount: 1 });

    // 定价列表每一行带着家族，页面照它归组。
    const rows = await new YomiRateMock().listVendorModelGroups({
      page: 1,
      pageSize: 50,
      filter: { vendorKey: 'antigravity', keyword: '', billingType: 'all' },
    });
    expect(rows.success).toBe(true);
    if (!rows.success) return;
    expect(
      rows.data.groups.flatMap((g) => g.routeKeys.map((e) => [e.routeKey, e.family, e.priceMultiplier, e.chatVisible])),
    ).toEqual([
      ['ag-claude-opus', 'anthropic', null, true],
      ['ag-claude-sonnet', 'anthropic', 1.1, true],
      ['ag-gemini-pro', 'google', null, true],
    ]);
  });

  it('family pricing rejects unknown families and out-of-range values', async () => {
    const store = getYomiStore();
    const port = new YomiPricingMock();
    const group = store.providerGroups[0]!;
    const before = JSON.stringify(store.familyPricings);

    const set = (family: string, mode: 'multiplier' | 'per_call' | 'credit', value: number) =>
      port.setFamilyPricing({ vendorId: group.id, family, mode, value });
    expect((await set('not-a-family', 'multiplier', 1)).success).toBe(false);
    expect((await set('anthropic', 'multiplier', -1)).success).toBe(false);
    expect((await set('anthropic', 'multiplier', 1000.5)).success).toBe(false);
    expect((await set('anthropic', 'credit', -0.01)).success).toBe(false);
    expect((await set('anthropic', 'per_call', 10000.5)).success).toBe(false);
    expect(JSON.stringify(store.familyPricings)).toBe(before);
  });

  it('a family can charge per call or per credit instead of a multiplier; an own multiplier still overrides it', async () => {
    const store = getYomiStore();
    const port = new YomiPricingMock();
    const group = store.providerGroups.find((g) => g.queueGroup === 'antigravity')!;
    const rateOf = (routeKey: string) => store.rate.find((x) => x.modelId === routeKey)!;

    // Claude 组改成按次：继承它的两条别名每次调用一个价，没有基准价行、也没有倍率。
    const perCall = await port.setFamilyPricing({ vendorId: group.id, family: 'anthropic', mode: 'per_call', value: 0.35 });
    expect(perCall.success && perCall.data.compiled).toBe(2);
    for (const key of ['ag-claude-opus', 'ag-claude-sonnet']) {
      const r = rateOf(key);
      expect(r.billingType === 'per_call' && r.rate.pricePerCall).toBe(0.35);
      expect(r.sourceModelKey).toBeNull();
      expect(r.multiplierApplied).toBeNull();
    }
    // 别的家族不受影响。
    expect(rateOf('ag-gemini-pro').billingType).toBe('per_token');

    // 组里设了独立倍率的那条：顶掉的是分组的整个定价方式，回到牌价 × 自己的倍率。
    const opus = store.vendorRoutes.find((v) => v.routeKey === 'ag-claude-opus')!;
    await port.setRoutePricing({ routeId: opus.uid, mode: 'compiled', multiplier: 1.1 });
    expect(rateOf('ag-claude-opus').billingType).toBe('per_token');
    expect(rateOf('ag-claude-opus').multiplierApplied).toBe(1.1);
    expect(rateOf('ag-claude-sonnet').billingType).toBe('per_call');

    // 再改成按积分：还是只动继承分组的那一条。
    const credit = await port.setFamilyPricing({ vendorId: group.id, family: 'anthropic', mode: 'credit', value: 0.028 });
    expect(credit.success && credit.data.compiled).toBe(1);
    const sonnet = rateOf('ag-claude-sonnet');
    expect(sonnet.billingType === 'per_credit' && sonnet.rate.pricePerCredit).toBe(0.028);
    expect(rateOf('ag-claude-opus').multiplierApplied).toBe(1.1);

    const listed = await port.listVendorFamilies(group.id);
    expect(listed.success && listed.data[0]).toEqual({
      family: 'anthropic', mode: 'credit', value: 0.028, routeCount: 2, inheritingRouteCount: 1,
    });

    // 换回倍率：分组只存一个值，倍率要重新给。
    await port.setFamilyPricing({ vendorId: group.id, family: 'anthropic', mode: 'multiplier', value: 1.3 });
    expect(rateOf('ag-claude-sonnet').billingType).toBe('per_token');
    expect(rateOf('ag-claude-sonnet').multiplierApplied).toBe(1.3);
  });

  it('with no price table at hand, list-priced routes are left alone and the result says so', async () => {
    const store = getYomiStore();
    const port = new YomiPricingMock();
    // 两个家族的渠道：Claude 两条别名、Gemini 一条，都按牌价 × 倍率出价。
    const group = store.providerGroups.find((g) => g.queueGroup === 'antigravity')!;
    const before = JSON.stringify(store.rate);

    // 号池管理台还没发布 / 这次没读到：表是空的
    store.modelPrices.splice(0);
    const r = await port.setFamilyPricing({ vendorId: group.id, family: 'anthropic', mode: 'multiplier', value: 9 });
    expect(r.success).toBe(true);
    if (!r.success) return;
    // 不重算、不报「无基准价」（空表说明不了哪个模型缺价），现有的有效价一个字不动
    expect(r.data).toMatchObject({ compiled: 0, unmatchedModelKeys: [], newVersion: null, priceTableEmpty: true, invalidPriceKeys: [] });
    expect(JSON.stringify(store.rate)).toBe(before);

    // 按积分的分组不看价格表：没有牌价，Claude 那两条照样编得出来，也不算「没有牌价」。
    // 同渠道的 Gemini 组还是倍率、眼下没法算，但这次改的是 Claude 组，它不在重算范围里，不拿来说事。
    const credit = await port.setFamilyPricing({ vendorId: group.id, family: 'anthropic', mode: 'credit', value: 0.03 });
    expect(credit.success).toBe(true);
    if (!credit.success) return;
    expect(credit.data.compiled).toBe(2);
    expect(credit.data.priceTableEmpty).toBe(false);
  });

  it('changing one family recomputes only that family; changing one alias only that alias', async () => {
    const store = getYomiStore();
    const port = new YomiPricingMock();
    const group = store.providerGroups.find((g) => g.queueGroup === 'antigravity')!;
    const rateOf = (routeKey: string) => store.rate.find((x) => x.modelId === routeKey)!;

    // Gemini 的牌价变了，但还没人重算它：这时它的有效价是「过时」的。
    const gemini = store.modelPrices.find((p) => p.modelKey === 'gemini-2.5-pro')!;
    if (gemini.billingType === 'per_token') gemini.rate.input.perMToken *= 10;
    const geminiBefore = JSON.stringify(rateOf('ag-gemini-pro'));

    // 改 Claude 组：只算 Claude 的两条，Gemini 那条不在范围里——既不重算，也不计入「相同未动」。
    const set = await port.setFamilyPricing({ vendorId: group.id, family: 'anthropic', mode: 'multiplier', value: 2 });
    expect(set.success && set.data).toMatchObject({ compiled: 2, unchanged: 0 });
    expect(JSON.stringify(rateOf('ag-gemini-pro'))).toBe(geminiBefore);

    // 改一条别名：只算这一条，同组的另一条不动。
    const opus = store.vendorRoutes.find((v) => v.routeKey === 'ag-claude-opus')!;
    const sonnetBefore = JSON.stringify(rateOf('ag-claude-sonnet'));
    const own = await port.setRoutePricing({ routeId: opus.uid, mode: 'compiled', multiplier: 1.1 });
    expect(own.success && own.data).toMatchObject({ compiled: 1, unchanged: 0 });
    expect(JSON.stringify(rateOf('ag-claude-sonnet'))).toBe(sonnetBefore);
    expect(JSON.stringify(rateOf('ag-gemini-pro'))).toBe(geminiBefore);

    // 端口上没有「手动重算」这个口。
    expect('compile' in port).toBe(false);
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

  it('a vendor row carries no pricing: old pricing fields on the wire are dropped, not read', () => {
    const base = {
      id: 1,
      queueGroup: 'kiro',
      status: 'active',
      upstreamModelCount: 0,
      createdAtUtc: 0,
      updatedAtUtc: 0,
    };
    // 还没升级的后端会带着 pricingMode / pricingValue：照样读得进来，但读出来的渠道上没有这两样。
    const parsed = providerGroupSchema.parse({ ...base, pricingMode: 'credit', pricingValue: 0.028 });
    expect('pricingMode' in parsed).toBe(false);
    expect('pricingValue' in parsed).toBe(false);
    expect(providerGroupSchema.safeParse(base).success).toBe(true);
    // 端口上也没有给渠道定价的入口。
    expect('setVendorPricing' in new YomiPricingMock()).toBe(false);
  });
});

describe('family pricing display', () => {
  it('formats the value with its unit, by mode', () => {
    expect(formatFamilyPricing({ mode: 'multiplier', value: 1.2 })).toBe('×1.2');
    expect(formatFamilyPricing({ mode: 'per_call', value: 0.35 })).toBe('¥0.35 / 次');
    expect(formatFamilyPricing({ mode: 'credit', value: 0.028 })).toBe('¥0.028 / 积分');
    // 积分单价常见这种量级，不能四舍五入成 ¥0.0001。
    expect(formatFamilyPricing({ mode: 'credit', value: 0.000125 })).toBe('¥0.000125 / 积分');
    // 前面已经写了方式的地方用短写法，不带单位。
    expect(formatFamilyPricingValue({ mode: 'multiplier', value: 1.2 })).toBe('×1.2');
    expect(formatFamilyPricingValue({ mode: 'per_call', value: 0.35 })).toBe('¥0.35');
    expect(formatFamilyPricingValue({ mode: 'credit', value: 0.028 })).toBe('¥0.028');
  });

  it('only a multiplier-priced family needs a list price for the routes that inherit it', () => {
    expect(familyReadsPriceTable({ mode: 'multiplier', value: 1.2 })).toBe(true);
    expect(familyReadsPriceTable({ mode: 'per_call', value: 0.35 })).toBe(false);
    expect(familyReadsPriceTable({ mode: 'credit', value: 0.028 })).toBe(false);
  });

  it('a route follows its family unless it carries its own multiplier or a custom price', () => {
    expect(routePricingChoice('compiled', null)).toBe('family');
    expect(routePricingChoice('compiled', undefined)).toBe('family');
    expect(routePricingChoice('compiled', 0.9)).toBe('own');
    // 0 是免费，不是「没设」。
    expect(routePricingChoice('compiled', 0)).toBe('own');
    // 自定义了有效价，路由上留着的倍率就没人读了。
    expect(routePricingChoice('manual', 0.9)).toBe('manual');
  });

  it('a family nobody changed is priced at multiplier ×1, same as any other price', () => {
    const families = [
      { family: 'anthropic', mode: 'per_call' as const, value: 0.35, routeCount: 2, inheritingRouteCount: 2 },
      { family: 'google', mode: 'multiplier' as const, value: 1, routeCount: 1, inheritingRouteCount: 1 },
    ];
    expect(familyPricingOf(families, 'anthropic')).toMatchObject({ mode: 'per_call', value: 0.35 });
    // 列表里没有的家族（还没加载出来）按默认的倍率 1 算。
    expect(familyPricingOf(families, 'openai')).toEqual({ mode: 'multiplier', value: 1 });
    // 倍率 1 就是一个价，没有「未设置」这种说法。
    expect(formatFamilyPricing(families[1]!)).toBe('×1');
  });

  it('families are called by their product line where one is the usual name', () => {
    expect(modelFamilyLabel('anthropic')).toBe('Claude');
    expect(modelFamilyLabel('google')).toBe('Gemini');
    expect(modelFamilyLabel('openai')).toBe('OpenAI');
    expect(modelFamilyLabel('other')).toBe('其他');
  });
});
