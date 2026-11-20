import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RateBody } from '@yomi/common';
import { OneApiRatecardHttpAdapter } from '@/shared/api/adapters/oneapiRatecardAdapter';

import {
  applyItems,
  defaultPicked,
  describePublish,
  extraPriceParts,
  failureScope,
  failureText,
  failuresAfterFullPublish,
  failuresAfterWrite,
  formCapabilities,
  hasZeroPrice,
  isEmbeddingRow,
  mergeRate,
  needsTakeover,
  newModelFormCapabilities,
  parseImportText,
  priceRowView,
  priceSummary,
  readRateBody,
  relaySummary,
  syncRows,
} from '../model/ratecard';
import {
  ALL_MAKERS,
  ratecardRelayStatusSchema,
  type ModelPriceRow,
  type PricePublishResult,
  type RateJson,
} from '../model/ratecard.types';
import {
  MOCK_FAIL_MAKER,
  MOCK_OWNER_MAKER,
  OneApiRatecardMock,
  _resetOneApiRatecardMock,
} from '../services/mock/oneapiRatecardMock';

function priceRow(over: Partial<ModelPriceRow> = {}): ModelPriceRow {
  return {
    id: '1',
    modelKey: 'gpt-5.2',
    maker: 'openai',
    billingType: 'per_token',
    rate: { input: { perMToken: 1.25, cachedRead: 0.125 }, output: { perMToken: 10 } },
    currency: 'USD',
    capabilities: { audio: false, reasoning: true, embedding: false },
    source: 'models_dev',
    sourceRef: 'openai/gpt-5.2',
    fetchedAtUtc: 1763600000000,
    effectiveFromUtc: 1763600000000,
    ...over,
  };
}

function publish(over: Partial<PricePublishResult> = {}): PricePublishResult {
  return { ok: true, written: [], deleted: [], unchanged: 0, failures: [], ...over };
}

/**
 * 号池后台（OneApi.VaultCustody 的 `/v1/ratecard/*`）回的形状。平台网关直接把请求转给它（对外是 `/oneapi/vault/v1/ratecard/*`，
 * 不经 Bff），中间没有人改回包：不包信封、时间是 Unix 毫秒、值为 null 的字段不写出来。下面的样本照 `ModelPriceDtos.cs` / `ModelPriceSyncService.cs` / `IModelPricePublisher.cs` 写的；
 * 那边改了字段，这里先挂，而不是页面上某一格悄悄空着。
 */
describe('oneapi ratecard adapter', () => {
  const adapter = new OneApiRatecardHttpAdapter();
  let calls: { url: string; method: string; body: unknown }[];

  /** 下一次请求回这个；记下请求打到了哪、带了什么。 */
  function reply(body: unknown, status = 200): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({
          url,
          method: init?.method ?? 'GET',
          body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
        });
        return new Response(JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
  }

  /** 请求的路径（.env 里配没配平台地址都一样：只看地址后面那一段）。 */
  const path = (i = 0): string => calls[i]!.url.replace(/^https?:\/\/[^/]+/, '');

  const wireRow = {
    id: '42',
    modelKey: 'claude-3-haiku-20240307',
    maker: 'anthropic',
    billingType: 'per_token',
    rate: { input: { perMToken: 0.25 }, output: { perMToken: 1.25 } },
    currency: 'USD',
    source: 'manual',
    effectiveFromUtc: 1763600000000,
  };
  const wirePublish = {
    ok: true,
    written: ['anthropic'],
    deleted: [],
    unchanged: 0,
    failures: [],
  };

  beforeEach(() => {
    calls = [];
  });
  afterEach(() => vi.unstubAllGlobals());

  it('lists the table by maker: no envelope, absent fields read as null', async () => {
    reply({ items: [{ maker: 'anthropic', items: [wireRow] }], total: 1 });

    const r = await adapter.listByMaker({ keyword: ' haiku ' });

    expect(path()).toBe('/oneapi/vault/v1/ratecard/catalog/by-maker?keyword=haiku');
    expect(r.success).toBe(true);
    if (!r.success) return;
    // capabilities / sourceRef / fetchedAtUtc 号池后台没写出来：读进来是 null，不是 undefined
    expect(r.data).toEqual([
      {
        maker: 'anthropic',
        items: [{ ...wireRow, capabilities: null, sourceRef: null, fetchedAtUtc: null }],
      },
    ]);
  });

  it('an empty keyword is not sent', async () => {
    reply({ items: [], total: 0 });
    await adapter.listByMaker({ keyword: '' });
    expect(path()).toBe('/oneapi/vault/v1/ratecard/catalog/by-maker');
  });

  it('says which interface is off when the shape changes, instead of rendering blanks', async () => {
    // 时间回成了 ISO 字符串
    reply({
      items: [
        {
          maker: 'anthropic',
          items: [{ ...wireRow, effectiveFromUtc: '2026-11-20T00:00:00Z' }],
        },
      ],
      total: 1,
    });
    const r = await adapter.listByMaker({ keyword: '' });
    expect(r.success).toBe(false);
    expect(!r.success && r.error).toEqual({
      code: 'validation',
      message: '模型价格响应格式错误',
    });
  });

  it('keeps a rate it does not recognise, so the row can still be listed and deleted', async () => {
    const odd = {
      ...wireRow,
      billingType: 'per_request_tier',
      rate: { tiers: [{ upTo: 1000, price: 1 }] },
    };
    reply({ items: [{ maker: 'anthropic', items: [odd] }], total: 1 });
    const r = await adapter.listByMaker({ keyword: '' });
    expect(r.success && r.data[0]?.items[0]?.rate).toEqual(odd.rate);
  });

  it('finds a row by name: slashes stay in the path, a 404 is "not there"', async () => {
    reply(wireRow);
    const hit = await adapter.find('anthropic/claude 3');
    // 斜杠原样留着、逐段转义：整个转成 %2F 号池后台的通配路由不还原
    expect(path()).toBe('/oneapi/vault/v1/ratecard/catalog/anthropic/claude%203');
    expect(hit.success && hit.data?.id).toBe('42');

    reply({ status: 404, code: 'GEN_02' }, 404);
    const miss = await adapter.find('no-such-model');
    expect(miss).toEqual({ success: true, data: null });

    // 别的失败不能当成「没有」：那样新建会把查重跳过去
    reply({ status: 502, code: 'GEN_07' }, 502);
    const down = await adapter.find('gpt-5.2');
    expect(down.success).toBe(false);
    expect(!down.success && down.error.code).toBe('upstream');
  });

  it('an empty name asks nothing', async () => {
    reply(wireRow);
    expect(await adapter.find('  ')).toEqual({ success: true, data: null });
    expect(calls).toHaveLength(0);
  });

  it('edits a row by its id and returns the publish result with it', async () => {
    reply({ price: wireRow, publish: wirePublish });

    const r = await adapter.upsert({
      id: '42',
      modelKey: 'claude-3-haiku-20240307',
      maker: 'anthropic',
      billingType: 'per_token',
      rate: { input: { perMToken: 0.3 }, output: { perMToken: 1.5 } },
    });

    expect(calls[0]!.method).toBe('PUT');
    expect(path()).toBe('/oneapi/vault/v1/ratecard/catalog');
    expect(calls[0]!.body).toMatchObject({
      id: '42',
      modelKey: 'claude-3-haiku-20240307',
      maker: 'anthropic',
      billingType: 'per_token',
      rate: { input: { perMToken: 0.3 }, output: { perMToken: 1.5 } },
    });
    expect(r.success && r.data.publish).toEqual(wirePublish);
    expect(r.success && r.data.price.id).toBe('42');
  });

  it('a new row carries no id', async () => {
    reply({ price: wireRow, publish: wirePublish });
    await adapter.upsert({
      modelKey: 'gpt-6',
      billingType: 'per_call',
      rate: { pricePerCall: 0.01 },
    });
    expect(calls[0]!.body).not.toHaveProperty('id');
    expect(calls[0]!.body).not.toHaveProperty('maker');
  });

  it('deletes by row id', async () => {
    reply({ id: '42', publish: { ...wirePublish, written: [], deleted: ['anthropic'] } });
    const r = await adapter.remove('42');
    expect(calls[0]!.method).toBe('DELETE');
    expect(path()).toBe('/oneapi/vault/v1/ratecard/catalog/42');
    expect(r.success && r.data.publish.deleted).toEqual(['anthropic']);
  });

  it('fetches candidates from models.dev, for one maker or all', async () => {
    const fetched = {
      sources: [
        {
          kind: 'models_dev',
          name: 'models.dev',
          ok: true,
          candidateCount: 1,
          elapsedMs: 420,
        },
        // 没拉到的来源带一句原因；error 只在失败时写出来
        {
          kind: 'openrouter',
          name: 'OpenRouter（补 1 小时缓存写）',
          ok: false,
          error: 'timed out after 20s.',
          candidateCount: 0,
          elapsedMs: 20000,
        },
      ],
      items: [
        {
          modelKey: 'gpt-5.2-pro',
          maker: 'openai',
          // 表里还没有：current 不写出来
          candidates: [
            {
              sourceKind: 'models_dev',
              sourceName: 'models.dev',
              sourceRef: 'openai/gpt-5.2-pro',
              maker: 'openai',
              modelId: 'gpt-5.2-pro',
              matchKind: 'exact',
              billingType: 'per_token',
              rate: { input: { perMToken: 21 }, output: { perMToken: 168 } },
              sourceCurrency: 'USD',
              fxApplied: 1,
              sameAsCurrent: false,
              capabilities: { audio: false, reasoning: true, embedding: false },
            },
          ],
        },
      ],
      fetchedAtUtc: 1763600000000,
    };
    reply(fetched);

    const one = await adapter.fetchCandidates({ maker: 'openai' });
    expect(calls[0]!.method).toBe('POST');
    expect(path()).toBe('/oneapi/vault/v1/ratecard/sync/fetch');
    expect(calls[0]!.body).toEqual({
      sources: [{ kind: 'models_dev', name: 'models.dev' }],
      makers: ['openai'],
    });
    expect(one.success && one.data.items[0]?.current).toBeNull();
    expect(one.success && one.data.sources.map((s) => s.error)).toEqual([
      null,
      'timed out after 20s.',
    ]);

    await adapter.fetchCandidates({ maker: null });
    expect(calls[1]!.body).toEqual({ sources: [{ kind: 'models_dev', name: 'models.dev' }] });
  });

  it('applies picked candidates and imports a pasted table', async () => {
    reply({ added: 1, updated: 2, publish: wirePublish });
    const item = {
      modelKey: 'gpt-5.2-pro',
      maker: 'openai',
      billingType: 'per_token',
      rate: { input: { perMToken: 21 }, output: { perMToken: 168 } },
      sourceKind: 'models_dev',
      sourceRef: 'openai/gpt-5.2-pro',
    };
    const applied = await adapter.applyCandidates([item]);
    expect(path()).toBe('/oneapi/vault/v1/ratecard/sync/apply');
    expect(calls[0]!.body).toMatchObject({ items: [item] });
    expect(applied.success && [applied.data.added, applied.data.updated]).toEqual([1, 2]);

    reply({ added: 3, overwritten: 1, skipped: 2, publish: wirePublish });
    const imported = await adapter.importPrices({ items: [wireRow], overwrite: true });
    expect(path(1)).toBe('/oneapi/vault/v1/ratecard/import');
    expect(calls[1]!.body).toEqual({ overwrite: true, items: [wireRow] });
    expect(imported.success && imported.data).toMatchObject({
      added: 3,
      overwritten: 1,
      skipped: 2,
    });
  });

  it('publishes; a takeover has to be asked for', async () => {
    const failed = {
      ok: false,
      written: [],
      deleted: [],
      unchanged: 0,
      failures: [
        {
          maker: '*',
          error: '这份价格表登记的主人是「a」，本实例连的库是「b」，没有发布。',
        },
      ],
    };
    reply(failed);
    const plain = await adapter.publish();
    expect(calls[0]!.method).toBe('POST');
    expect(path()).toBe('/oneapi/vault/v1/ratecard/publish');
    // 没发布出去不是请求失败：HTTP 200，原因在 failures 里
    expect(plain.success && plain.data).toEqual(failed);

    reply(wirePublish);
    await adapter.publish({ takeover: true });
    expect(path(1)).toBe('/oneapi/vault/v1/ratecard/publish?takeover=true');
    await adapter.publish({ takeover: false });
    expect(path(2)).toBe('/oneapi/vault/v1/ratecard/publish');
  });

  // 只有这一个还打平台的 Bff：订阅 OneApi 的 NATS、通知各产品的是它，号池后台不知道这份表到没到平台
  it('reads the relay status from the Bff, not from the vault', async () => {
    const relay = {
      configured: true,
      loaded: true,
      fingerprint: 'ab12cd34',
      documentCount: 7,
      receivedAtUtc: 1763600000000,
      error: null,
      subscribers: [{ service: 'yomi', notifiedAtUtc: 1763600001000, ok: true, error: null }],
    };
    reply(relay);
    const r = await adapter.relayStatus();
    expect(path()).toBe('/admin/components/oneapi/ratecard/relay');
    expect(r.success && r.data).toEqual(relay);

    // 还没配 / 还没收到：别的字段可以是 null，也可以干脆没有
    expect(ratecardRelayStatusSchema.parse({ configured: false, loaded: false })).toEqual({
      configured: false,
      loaded: false,
      fingerprint: null,
      documentCount: 0,
      receivedAtUtc: null,
      error: null,
      subscribers: [],
    });
    // 时间是 Unix 毫秒，不是 ISO 字符串
    expect(
      ratecardRelayStatusSchema.safeParse({ ...relay, receivedAtUtc: '2026-11-20T00:00:00Z' })
        .success,
    ).toBe(false);
  });
});

describe('oneapi ratecard rows', () => {
  it('shows list prices as they are, not rounded to two places', () => {
    const view = priceRowView(
      priceRow({
        rate: {
          input: { perMToken: 0.075, cachedRead: 0.01875 },
          output: { perMToken: 0.3 },
        },
      }),
    );
    expect(view.kind).toBe('per_token');
    const texts = Object.fromEntries(view.cells!.columns.flat().map((p) => [p.kind, p.text]));
    // 这一页的数是各产品算钱的依据：0.075 写成 0.08、0.01875 写成 0.02 就是错的
    expect(texts.input).toMatch(/0\.075$/);
    expect(texts.cacheRead).toMatch(/0\.01875$/);
    expect(texts.output).toMatch(/0\.30$/);
    expect(view.hint).toBe('models.dev');
  });

  it('lists a row it cannot read without offering to edit it', () => {
    const odd = priceRowView(
      priceRow({ billingType: 'per_request_tier', rate: { tiers: [] }, source: 'manual' }),
    );
    expect(odd.body).toBeNull();
    expect(odd.kind).toBeNull();
    expect(odd.cells).toBeNull();
    // 旧行缺了必填的数也是读不出来，不是当成 0
    expect(readRateBody({ billingType: 'per_token', rate: { input: {} } })).toBeNull();
  });

  it('writes the tiers the price column has no place for under the model name', () => {
    const image = priceRow({
      rate: { input: { perMToken: 0.3, image: 0.5 }, output: { perMToken: 2.5, image: 30 } },
      source: 'manual',
    });
    expect(extraPriceParts(image)).toHaveLength(2);
    expect(priceRowView(image).hint).toMatch(/^图像入 .*0\.50 · 图像出 .*30\.00$/);
    expect(
      extraPriceParts({
        billingType: 'per_call',
        rate: { pricePerCall: 0.005, cachedPricePerCall: 0.001 },
      })[0],
    ).toMatch(/^缓存命中 .*0\.001$/);
    expect(extraPriceParts(priceRow())).toEqual([]);
  });

  it('a video row carries its duration limits and its source', () => {
    const view = priceRowView(
      priceRow({
        modelKey: 'sora-2',
        billingType: 'per_video',
        rate: {
          tiers: [{ resolution: '720p', pricePerSecond: 0.1 }],
          minSeconds: 4,
          maxSeconds: 12,
        },
        capabilities: null,
        source: 'openrouter',
      }),
    );
    expect(view.kind).toBe('per_video');
    expect(view.hint).toBe('时长 4–12 秒 · OpenRouter');
  });

  it('an embedding model is one the catalogue says so, or one named so that charges nothing for output', () => {
    const emb = { audio: false, reasoning: false, embedding: true };
    const named = priceRow({ modelKey: 'text-embedding-3-large', capabilities: null });
    expect(isEmbeddingRow(priceRow({ capabilities: emb }))).toBe(true);
    expect(isEmbeddingRow(priceRow({ modelKey: 'text-embedding-3-large' }))).toBe(false);
    expect(
      isEmbeddingRow({
        ...named,
        rate: { input: { perMToken: 0.13 }, output: { perMToken: 0 } },
      }),
    ).toBe(true);
    // 名字像、但带着出价：当成向量去改，表单会把出价存成 0
    expect(isEmbeddingRow(named)).toBe(false);
    expect(
      isEmbeddingRow(
        priceRow({
          modelKey: 'embed-x',
          billingType: 'per_call',
          rate: { pricePerCall: 1 },
          capabilities: null,
        }),
      ),
    ).toBe(false);

    // 表单没有能力信息时自己按键名猜：名字里带 embed 的要把结论明说给它
    expect(formCapabilities(priceRow())).toEqual(priceRow().capabilities);
    expect(formCapabilities(priceRow({ capabilities: null }))).toBeNull();
    expect(formCapabilities(named)).toEqual({ audio: true, reasoning: true, embedding: false });
    expect(
      formCapabilities({
        ...named,
        rate: { input: { perMToken: 0.13 }, output: { perMToken: 0 } },
      }),
    ).toEqual(emb);

    expect(newModelFormCapabilities('my-embed', true)).toEqual(emb);
    expect(newModelFormCapabilities('my-embed', false)).toEqual({
      audio: true,
      reasoning: true,
      embedding: false,
    });
    expect(newModelFormCapabilities('gpt-6', false)).toBeNull();
  });

  it('one line per price for the sync comparison: only the tiers that are set, with the unit', () => {
    expect(priceSummary(priceRow())).toMatch(/^入 .*1\.25 · 出 .*10\.00 · 读 .*0\.125 \/ 1M$/);
    expect(
      priceSummary(priceRow({ billingType: 'per_audio_minute', rate: { pricePerMinute: 0.006 } })),
    ).toMatch(/0\.006 \/ 分钟$/);
    expect(
      priceSummary(
        priceRow({
          billingType: 'per_image',
          rate: {
            tiers: [
              { size: '1024x1024', quality: 'low', pricePerImage: 0.011 },
              { size: '1024x1024', quality: 'medium', pricePerImage: 0.042 },
              { size: '1024x1024', quality: 'high', pricePerImage: 0.167 },
            ],
          },
        }),
      ),
    ).toMatch(/^3 档 · .*0\.011–.*0\.167 \/ 张$/);
    expect(priceSummary(priceRow({ billingType: 'per_request_tier', rate: {} }))).toBe(
      'per_request_tier',
    );
  });
});

describe('oneapi ratecard edits', () => {
  it('keeps what the form does not know about when a price is edited', () => {
    const original: RateJson = {
      input: { perMToken: 0.3, cachedRead: 0.03, cachedWrite: 0.4, image: 0.5 },
      output: { perMToken: 2.5, image: 30 },
    };
    // 表单拼出来的：改了入价，清掉了缓存读，没有碰图像（它不认识）
    const draft: RateBody = {
      billingType: 'per_token',
      rate: {
        input: { perMToken: 0.35, cachedWrite: 0.4 },
        output: { perMToken: 2.5, reasoning: 3 },
      },
    };
    expect(mergeRate(original, draft)).toEqual({
      input: { perMToken: 0.35, cachedWrite: 0.4, image: 0.5 },
      output: { perMToken: 2.5, reasoning: 3, image: 30 },
    });
    // 原来的那份不被改动
    expect(original.input).toEqual({
      perMToken: 0.3,
      cachedRead: 0.03,
      cachedWrite: 0.4,
      image: 0.5,
    });
  });

  it('does the same for the other shapes', () => {
    expect(
      mergeRate(
        { pricePerCall: 0.005, cachedPricePerCall: 0.001 },
        { billingType: 'per_call', rate: { pricePerCall: 0.006 } },
      ),
    ).toEqual({ pricePerCall: 0.006, cachedPricePerCall: 0.001 });

    // 档位整个换成表单里的；时长限制清空了就拿掉
    expect(
      mergeRate(
        {
          tiers: [{ resolution: '720p', pricePerSecond: 0.1 }],
          minSeconds: 4,
          maxSeconds: 12,
        },
        {
          billingType: 'per_video',
          rate: { tiers: [{ resolution: '1080p', pricePerSecond: 0.3 }], maxSeconds: 20 },
        },
      ),
    ).toEqual({ tiers: [{ resolution: '1080p', pricePerSecond: 0.3 }], maxSeconds: 20 });
  });

  it('asks before saving a price of zero', () => {
    const perToken = (input: number, output: number): RateBody => ({
      billingType: 'per_token',
      rate: { input: { perMToken: input }, output: { perMToken: output } },
    });
    expect(hasZeroPrice(perToken(1, 2))).toBe(false);
    expect(hasZeroPrice(perToken(0, 2))).toBe(true);
    expect(hasZeroPrice(perToken(1, 0))).toBe(true);
    // 向量模型的出价本来就是 0
    expect(hasZeroPrice(perToken(0.13, 0), true)).toBe(false);
    expect(hasZeroPrice({ billingType: 'per_call', rate: { pricePerCall: 0 } })).toBe(true);
    expect(
      hasZeroPrice({
        billingType: 'per_image',
        rate: {
          tiers: [
            { size: '1024x1024', quality: 'standard', pricePerImage: 0.04 },
            { size: '1024x1024', quality: 'hd', pricePerImage: 0 },
          ],
        },
      }),
    ).toBe(true);
  });
});

describe('oneapi ratecard publish results', () => {
  const natsDown = { maker: ALL_MAKERS, error: 'nats: no servers available' };
  const openaiFailed = { maker: 'openai', error: 'wrong last sequence' };

  it('a write that did not publish is remembered until that maker publishes', () => {
    let failures = failuresAfterWrite([], publish({ ok: false, failures: [openaiFailed] }));
    expect(failures).toEqual([openaiFailed]);

    // 别的厂家发布成了，不关 openai 的事
    failures = failuresAfterWrite(failures, publish({ written: ['anthropic'] }));
    expect(failures).toEqual([openaiFailed]);

    // 同一家又失败：只留最新的原因
    const again = { maker: 'openai', error: 'timeout' };
    failures = failuresAfterWrite(failures, publish({ ok: false, failures: [again] }));
    expect(failures).toEqual([again]);

    failures = failuresAfterWrite(failures, publish({ written: ['openai'] }));
    expect(failures).toEqual([]);
  });

  it('a whole-table failure is only cleared by a whole-table publish', () => {
    let failures = failuresAfterWrite([], publish({ ok: false, failures: [natsDown] }));
    // 之后一次写操作发布成了一家，不代表之前没发出去的都补上了
    failures = failuresAfterWrite(failures, publish({ written: ['openai'] }));
    expect(failures).toEqual([natsDown]);

    expect(failuresAfterFullPublish(publish({ ok: false, failures: [openaiFailed] }))).toEqual([
      openaiFailed,
    ]);
    expect(failuresAfterFullPublish(publish({ written: ['openai'], unchanged: 6 }))).toEqual([]);
  });

  it('says which makers were published, and when nothing was', () => {
    expect(describePublish(publish({ written: ['openai'] }))).toBe('已发布 OpenAI');
    expect(describePublish(publish({ deleted: ['novelai'] }))).toBe('已撤下 NovelAI');
    expect(describePublish(publish({ written: ['openai', 'anthropic'], unchanged: 5 }))).toBe(
      '已发布 OpenAI、Anthropic，另 5 家没变',
    );
    expect(
      describePublish(publish({ written: ['openai', 'anthropic', 'google', 'deepseek'] })),
    ).toBe('已发布 OpenAI、Anthropic、Google 等 4 家');
    // 发布着的本来就和表里一样：没写不是没成
    expect(describePublish(publish({ unchanged: 7 }))).toBe('发布的没有变化');
    expect(
      describePublish(
        publish({ ok: false, failures: [openaiFailed, { maker: 'google', error: 'x' }] }),
      ),
    ).toBe('2 家没有发布出去');
    expect(describePublish(publish({ ok: false, failures: [natsDown] }))).toBe('没有发布出去');

    expect(failureScope(natsDown)).toBe('整张表');
    expect(failureScope(openaiFailed)).toBe('OpenAI');
    expect(failureScope({ maker: 'acme', error: 'x' })).toBe('Acme');
  });

  it('offers a takeover only for the failure the vault marks as an owner mismatch', () => {
    // 认的是码，不是那句话：连不上 NATS 的失败里就算出现「主人」两个字也不算
    expect(needsTakeover([])).toBe(false);
    expect(needsTakeover([{ maker: ALL_MAKERS, error: '读不到价格表的主人' }])).toBe(false);
    expect(needsTakeover([{ maker: 'openai', error: 'x', code: null }])).toBe(false);
    expect(
      needsTakeover([
        { maker: 'openai', error: 'x' },
        { maker: ALL_MAKERS, error: '登记的主人是别的库', code: 'owner_mismatch' },
      ]),
    ).toBe(true);
  });

  it('shows what the vault said when it is the vault that refused', () => {
    // 号池后台拒的：它的话在 errors 的 upstream 键下（它自己放的），界面上那句按种类出的通用文案说明不了问题
    expect(
      failureText({
        message: '提交的内容有误',
        reason: 'oneapi_vault_rejected',
        details: { upstream: ['第 3 行 broken-2：缺 input.perMToken'] },
      }),
    ).toBe('第 3 行 broken-2：缺 input.perMToken');
    // 请求体绑不上时是逐字段的错：带上是哪个字段
    expect(
      failureText({
        message: '提交的内容有误',
        reason: 'oneapi_vault_rejected',
        details: { '$.rate': ['The JSON value could not be converted.'] },
      }),
    ).toBe('$.rate：The JSON value could not be converted.');
    // 号池后台什么都没说：还是那句通用的
    expect(failureText({ message: '没有找到', reason: 'oneapi_vault_rejected' })).toBe('没有找到');
    expect(
      failureText({ message: '没有找到', reason: 'oneapi_vault_rejected', details: { upstream: [' '] } }),
    ).toBe('没有找到');
    // 别的失败照旧出通用的那句，不把 errors 里的东西翻出来。
    // 号池后台不在线：平台网关回的 502 / 503，没有原因码
    expect(
      failureText({ message: '依赖的服务暂时不可用', details: { upstream: ['x'] } }),
    ).toBe('依赖的服务暂时不可用');
    // 带着别的原因码的也一样（随手拿了一个平台的码，只要不是号池后台拒的那个）
    expect(
      failureText({
        message: '角色还在用着',
        reason: 'role_in_use',
        details: { upstream: ['x'] },
      }),
    ).toBe('角色还在用着');
    expect(failureText({ message: '没有权限' })).toBe('没有权限');
  });
});

describe('oneapi ratecard import text', () => {
  it('takes an array, an object with items, or a whole enveloped response', () => {
    const rows = [{ modelKey: 'a' }, { modelKey: 'b' }];
    expect(parseImportText(JSON.stringify(rows)).items).toEqual(rows);
    expect(parseImportText(JSON.stringify({ items: rows, total: 2 })).items).toEqual(rows);
    expect(parseImportText(JSON.stringify({ success: true, data: { items: rows } })).items).toEqual(
      rows,
    );
  });

  it('says why it cannot, and says nothing while the box is empty', () => {
    expect(parseImportText('   ')).toEqual({ items: null, problem: '' });
    expect(parseImportText('[{')).toEqual({ items: null, problem: '不是合法的 JSON' });
    expect(parseImportText('{"rows":[]}')).toEqual({
      items: null,
      problem: '要一个数组，或者带 items 的对象',
    });
    expect(parseImportText('"gpt"')).toEqual({
      items: null,
      problem: '要一个数组，或者带 items 的对象',
    });
    expect(parseImportText('[]')).toEqual({ items: null, problem: '里面一行都没有' });
  });
});

describe('oneapi ratecard relay status', () => {
  const relay = ratecardRelayStatusSchema.parse({
    configured: true,
    loaded: true,
    fingerprint: 'ab12cd34',
    documentCount: 7,
    receivedAtUtc: 1763600000000,
    subscribers: [],
  });

  it('one word for where the table stands', () => {
    expect(relaySummary(relay, null)).toEqual({
      tone: 'success',
      text: '已收到 7 家',
      tip: '指纹 ab12cd34',
    });
    expect(relaySummary({ ...relay, loaded: false, documentCount: 0 }, null)).toMatchObject({
      tone: 'warning',
      text: '还没收到',
    });
    expect(relaySummary({ ...relay, configured: false, loaded: false }, null)).toMatchObject({
      tone: 'info',
      text: '未配置',
    });
    // 订阅出着错：手上还有上一份也先说出错，各产品接下来收不到新改的价
    expect(relaySummary({ ...relay, error: 'nats: connection closed' }, null)).toEqual({
      tone: 'danger',
      text: '订阅出错',
      tip: 'nats: connection closed；手上是 7 家的那一份',
    });
    expect(relaySummary(null, '没有权限')).toEqual({
      tone: 'danger',
      text: '读不到',
      tip: '没有权限',
    });
    expect(relaySummary(null, null).tone).toBe('info');
  });
});

/**
 * mock 下这一页的每个操作都要点得通，而且规矩和号池后台一样——页面在 mock 里看着对、接上后端才发现不对的事，先在这里拦。
 */
describe('oneapi ratecard mock', () => {
  const port = new OneApiRatecardMock();

  beforeEach(() => {
    vi.stubEnv('VITE_MOCK_DELAY_MS', '0');
    _resetOneApiRatecardMock();
  });
  afterEach(() => vi.unstubAllEnvs());

  async function table(keyword = ''): Promise<ModelPriceRow[]> {
    const r = await port.listByMaker({ keyword });
    if (!r.success) throw new Error(r.error.message);
    return r.data.flatMap((g) => g.items);
  }

  async function findRow(modelKey: string): Promise<ModelPriceRow> {
    const found = (await table()).find((p) => p.modelKey === modelKey);
    if (!found) throw new Error(`${modelKey} is not in the table`);
    return found;
  }

  const perToken = (input: number, output: number): RateJson => ({
    input: { perMToken: input },
    output: { perMToken: output },
  });

  it('lists every maker in order, each row under its own maker', async () => {
    const r = await port.listByMaker({ keyword: '' });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.map((g) => g.maker)).toEqual([
      'openai',
      'anthropic',
      'google',
      'deepseek',
      'novelai',
      'other',
    ]);
    for (const g of r.data) for (const p of g.items) expect(p.maker).toBe(g.maker);
    // 七种计价方式种子里都有，页面的每种行都看得到
    expect(new Set(r.data.flatMap((g) => g.items.map((p) => p.billingType)))).toEqual(
      new Set([
        'per_token',
        'per_image',
        'per_video',
        'per_audio_minute',
        'per_character',
        'per_credit',
        'per_call',
      ]),
    );
  });

  it('searches the model key and the source ref', async () => {
    expect((await table('haiku')).map((p) => p.modelKey)).toEqual([
      'claude-3-haiku',
      'claude-3-haiku-20240307',
      'claude-haiku-4-5',
    ]);
    // 来源标识里有厂家名：按 google/ 搜得到整家
    expect((await table('google/')).every((p) => p.maker === 'google')).toBe(true);
    expect(await table('no-such-thing')).toEqual([]);
  });

  it('editing by id changes that very row, even when its key would canonicalise to another', async () => {
    const dated = await findRow('claude-3-haiku-20240307');
    const clean = await findRow('claude-3-haiku');

    const r = await port.upsert({
      id: dated.id,
      modelKey: dated.modelKey,
      maker: dated.maker,
      billingType: 'per_token',
      rate: perToken(0.5, 2.5),
    });

    expect(r.success && r.data.price).toMatchObject({
      id: dated.id,
      modelKey: 'claude-3-haiku-20240307',
    });
    expect((await findRow('claude-3-haiku-20240307')).rate).toEqual(perToken(0.5, 2.5));
    // 干净名的那一行一个字没动
    expect(await findRow('claude-3-haiku')).toEqual(clean);
    // 手改过的价不再算是外部目录来的
    expect(r.success && r.data.price.source).toBe('manual');
  });

  it('without an id the same name lands on the clean row — which is why edits must carry the id', async () => {
    const clean = await findRow('claude-3-haiku');
    const r = await port.upsert({
      modelKey: 'anthropic/claude-3-haiku-20240307',
      billingType: 'per_token',
      rate: perToken(9, 9),
    });
    expect(r.success && r.data.price.id).toBe(clean.id);
    expect((await findRow('claude-3-haiku-20240307')).rate).toEqual(perToken(0.25, 1.25));
  });

  it('an id that is not there is "not found", not a new row', async () => {
    const before = await table();
    const r = await port.upsert({
      id: '99999',
      modelKey: 'gpt-5.2',
      billingType: 'per_token',
      rate: perToken(1, 2),
    });
    expect(!r.success && r.error.code).toBe('not_found');
    expect(await table()).toEqual(before);
  });

  it('refuses a rate that is not one of the known shapes', async () => {
    const r = await port.upsert({
      modelKey: 'gpt-6',
      billingType: 'per_token',
      rate: { input: { perMToken: 1 } },
    });
    expect(!r.success && r.error.code).toBe('validation');
    expect((await table()).some((p) => p.modelKey === 'gpt-6')).toBe(false);
  });

  it('a new model is published for its maker and reaches the platform', async () => {
    const before = await port.relayStatus();
    // 种子里留着一个没通知到的产品，页面上看得到失败长什么样
    expect(before.success && before.data.subscribers.map((s) => s.ok)).toEqual([true, false]);

    const r = await port.upsert({
      modelKey: 'gpt-6',
      maker: 'openai',
      billingType: 'per_token',
      rate: perToken(2, 16),
    });
    expect(r.success && r.data.publish).toEqual({
      ok: true,
      written: ['openai'],
      deleted: [],
      unchanged: 0,
      failures: [],
    });

    const after = await port.relayStatus();
    expect(after.success && before.success && after.data.fingerprint).not.toBe(
      before.success && before.data.fingerprint,
    );
    expect(after.success && after.data.subscribers.every((s) => s.ok && s.error === null)).toBe(
      true,
    );

    // 没带厂家的按模型键推
    const inferred = await port.upsert({
      modelKey: 'claude-next',
      billingType: 'per_token',
      rate: perToken(3, 15),
    });
    expect(inferred.success && inferred.data.price.maker).toBe('anthropic');
  });

  it('saving the same price again writes nothing', async () => {
    const row = await findRow('gpt-5.2');
    const r = await port.upsert({
      id: row.id,
      modelKey: row.modelKey,
      maker: row.maker,
      billingType: row.billingType,
      rate: row.rate,
    });
    expect(r.success && r.data.publish).toMatchObject({ ok: true, written: [], unchanged: 1 });
  });

  it('keeps the capabilities the catalogue gave when a price is edited without them', async () => {
    const row = await findRow('gpt-5.2');
    const r = await port.upsert({
      id: row.id,
      modelKey: row.modelKey,
      maker: row.maker,
      billingType: 'per_token',
      rate: perToken(2, 12),
    });
    expect(r.success && r.data.price.capabilities).toEqual(row.capabilities);
  });

  it('moving a row to another maker republishes both', async () => {
    const row = await findRow('deepseek-chat');
    const r = await port.upsert({
      id: row.id,
      modelKey: row.modelKey,
      maker: 'other',
      billingType: row.billingType,
      rate: row.rate,
    });
    // deepseek 一行都不剩了：它发布出去的那一份撤下
    expect(r.success && r.data.publish).toMatchObject({
      ok: true,
      written: ['other'],
      deleted: ['deepseek'],
    });
  });

  it('deleting the last row of a maker takes its document down', async () => {
    const row = await findRow('nai-diffusion-4-5-full');
    const r = await port.remove(row.id);
    expect(r.success && r.data).toEqual({
      id: row.id,
      publish: { ok: true, written: [], deleted: ['novelai'], unchanged: 0, failures: [] },
    });
    expect((await table()).some((p) => p.maker === 'novelai')).toBe(false);

    const gone = await port.remove(row.id);
    expect(!gone.success && gone.error.code).toBe('not_found');
  });

  it('finds an existing row by any spelling of its name, before a new one is created', async () => {
    const byPrefix = await port.find('anthropic/claude-sonnet-4-6');
    expect(byPrefix.success && byPrefix.data?.modelKey).toBe('claude-sonnet-4-6');
    // 点号和横线只是写法不同
    const byDots = await port.find('claude-sonnet-4.6');
    expect(byDots.success && byDots.data?.modelKey).toBe('claude-sonnet-4-6');
    expect(await port.find('gpt-6')).toEqual({ success: true, data: null });
  });

  it('sync: fetch compares without writing, apply writes what was picked', async () => {
    const before = await table();
    const fetched = await port.fetchCandidates({ maker: null });
    expect(fetched.success).toBe(true);
    if (!fetched.success) return;
    // 只读：拉完表没变
    expect(await table()).toEqual(before);

    const rows = syncRows(fetched.data);
    const status = Object.fromEntries(rows.map((r) => [r.item.modelKey, r.status]));
    expect(status['gpt-5.2-pro']).toBe('new');
    expect(status['gpt-5-mini']).toBe('changed');
    expect(status['gpt-5.2']).toBe('same');
    // 手工录的行上游没有：不在对比里
    expect(status['whisper-1']).toBeUndefined();

    const changed = rows.find((r) => r.item.modelKey === 'gpt-5-mini')!;
    expect(changed.currentText).not.toBe(changed.candidateText);
    expect(rows.find((r) => r.item.modelKey === 'gpt-5.2-pro')!.currentText).toBe('—');

    // 有差异的默认都勾上；和表里一致的勾不上
    const picked = defaultPicked(rows);
    expect([...picked].sort()).toEqual([
      'claude-haiku-4-5',
      'gemini-2.5-flash-lite',
      'gpt-5-mini',
      'gpt-5.2-pro',
    ]);
    expect(applyItems(rows, new Set(['gpt-5.2']))).toEqual([]);

    picked.delete('gemini-2.5-flash-lite');
    const items = applyItems(rows, picked);
    expect(items.map((i) => i.modelKey).sort()).toEqual([
      'claude-haiku-4-5',
      'gpt-5-mini',
      'gpt-5.2-pro',
    ]);
    expect(items[0]).toMatchObject({
      sourceKind: 'models_dev',
      capabilities: { reasoning: true },
    });

    const applied = await port.applyCandidates(items);
    expect(applied.success && applied.data).toMatchObject({ added: 1, updated: 2 });
    expect(applied.success && [...applied.data.publish.written].sort()).toEqual([
      'anthropic',
      'openai',
    ]);
    expect((await findRow('gpt-5.2-pro')).source).toBe('models_dev');

    // 再拉一遍：套用过的都一致了，只剩没勾的那一条
    const again = await port.fetchCandidates({ maker: null });
    expect(again.success && [...defaultPicked(syncRows(again.data))]).toEqual([
      'gemini-2.5-flash-lite',
    ]);
  });

  it('sync can be narrowed to one maker', async () => {
    const r = await port.fetchCandidates({ maker: 'google' });
    expect(r.success && r.data.items.every((i) => i.maker === 'google')).toBe(true);
    expect(r.success && r.data.items.length).toBeGreaterThan(0);
  });

  it('applying is all or nothing', async () => {
    const before = await table();
    const r = await port.applyCandidates([
      {
        modelKey: 'gpt-7',
        maker: 'openai',
        billingType: 'per_token',
        rate: perToken(1, 2),
        sourceKind: 'models_dev',
        sourceRef: 'openai/gpt-7',
      },
      {
        modelKey: 'gpt-8',
        maker: 'openai',
        billingType: 'per_token',
        rate: { input: {} },
        sourceKind: 'models_dev',
        sourceRef: 'openai/gpt-8',
      },
    ]);
    // 说哪一个模型不过的是号池后台的那句话，页面上显示的也是它（failureText），不是按种类出的通用文案
    expect(!r.success && failureText(r.error)).toContain('gpt-8');
    expect(await table()).toEqual(before);
  });

  it('import adds new rows, skips the ones already there unless told to overwrite, and keeps keys as given', async () => {
    const items = [
      {
        modelKey: 'gpt-5.2',
        maker: 'openai',
        billingType: 'per_token',
        rate: perToken(9, 9),
      },
      // 导入不收干净名：带日期钉的键原样进表
      {
        modelKey: 'GPT-4o-2024-08-06',
        billingType: 'per_token',
        rate: perToken(2.5, 10),
        source: 'models_dev',
        effectiveFromUtc: 1700000000000,
      },
      // 多出来的字段不认也不报错
      {
        modelKey: 'acme-x',
        maker: 'acme',
        billingType: 'per_call',
        rate: { pricePerCall: 0.01 },
        id: 'whatever',
        routeCount: 3,
      },
    ];

    const skipped = await port.importPrices({ items, overwrite: false });
    expect(skipped.success && skipped.data).toMatchObject({
      added: 2,
      overwritten: 0,
      skipped: 1,
    });
    expect((await findRow('gpt-5.2')).rate).not.toEqual(perToken(9, 9));
    expect(await findRow('gpt-4o-2024-08-06')).toMatchObject({
      maker: 'openai',
      source: 'models_dev',
      effectiveFromUtc: 1700000000000,
    });

    const overwritten = await port.importPrices({ items, overwrite: true });
    expect(overwritten.success && overwritten.data).toMatchObject({
      added: 0,
      overwritten: 3,
      skipped: 0,
    });
    expect((await findRow('gpt-5.2')).rate).toEqual(perToken(9, 9));
  });

  it('import is all or nothing, and names the row that is wrong', async () => {
    const before = await table();
    const r = await port.importPrices({
      items: [
        { modelKey: 'fine-1', billingType: 'per_token', rate: perToken(1, 2) },
        { modelKey: 'broken-2', billingType: 'per_image', rate: { tiers: [] } },
      ],
      overwrite: true,
    });
    expect(!r.success && r.error.code).toBe('validation');
    expect(!r.success && failureText(r.error)).toContain('broken-2');
    expect(await table()).toEqual(before);

    const dup = await port.importPrices({
      items: [
        { modelKey: 'twice', billingType: 'per_token', rate: perToken(1, 2) },
        { modelKey: 'Twice', billingType: 'per_token', rate: perToken(1, 2) },
      ],
      overwrite: false,
    });
    expect(!dup.success && failureText(dup.error)).toContain('重复');
  });

  it('publish: nothing to write when the table is already out there', async () => {
    const r = await port.publish();
    expect(r.success && r.data).toEqual({
      ok: true,
      written: [],
      deleted: [],
      unchanged: 6,
      failures: [],
    });
  });

  it(`a maker named ${MOCK_FAIL_MAKER} never publishes: saved, but not out`, async () => {
    const saved = await port.upsert({
      modelKey: 'flaky-1',
      maker: MOCK_FAIL_MAKER,
      billingType: 'per_call',
      rate: { pricePerCall: 1 },
    });
    // 表里是写成了的
    expect(saved.success && saved.data.price.maker).toBe(MOCK_FAIL_MAKER);
    expect(saved.success && saved.data.publish.ok).toBe(false);
    expect(saved.success && saved.data.publish.failures.map((f) => f.maker)).toEqual([
      MOCK_FAIL_MAKER,
    ]);

    // 整张表再发布一遍也还是它不成，别的厂家不受影响
    const all = await port.publish();
    expect(all.success && all.data).toMatchObject({ ok: false, unchanged: 6 });

    // 把那一行删了，整张表才发布得出去
    if (saved.success) await port.remove(saved.data.price.id);
    const clean = await port.publish();
    expect(clean.success && clean.data.ok).toBe(true);
  });

  it(`a maker named ${MOCK_OWNER_MAKER} hands the table to another database, until a takeover`, async () => {
    const saved = await port.upsert({
      modelKey: 'moved-1',
      maker: MOCK_OWNER_MAKER,
      billingType: 'per_call',
      rate: { pricePerCall: 1 },
    });
    // 登记的主人是别的库：没到哪一个厂家就失败了，整张表都没发布
    expect(saved.success && saved.data.publish).toMatchObject({
      ok: false,
      written: [],
      failures: [{ maker: ALL_MAKERS }],
    });

    const blocked = await port.upsert({
      modelKey: 'gpt-6',
      maker: 'openai',
      billingType: 'per_token',
      rate: perToken(2, 16),
    });
    expect(blocked.success && blocked.data.publish.ok).toBe(false);
    expect((await port.publish()).success).toBe(true);
    const plain = await port.publish();
    expect(plain.success && plain.data.ok).toBe(false);

    // 接管：登记改过来，再把攒着没发出去的全发了
    const taken = await port.publish({ takeover: true });
    expect(taken.success && taken.data.ok).toBe(true);
    expect(taken.success && [...taken.data.written].sort()).toEqual(
      ['openai', MOCK_OWNER_MAKER].sort(),
    );

    const after = await port.publish();
    expect(after.success && after.data).toMatchObject({ ok: true, written: [] });
  });
});
