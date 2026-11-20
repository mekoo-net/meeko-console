import { afterEach, describe, expect, it } from 'vitest';

import {
  categoryPriceSlots,
  describeCompile,
  describeListPrice,
  describeModelPrice,
  followBlock,
  followBlockText,
  formatUsd,
  formulaRows,
  listBillingLabel,
  listPriceNote,
  multiplierText,
  pricingLabels,
  unmatchedLines,
} from '../model/channelPricing';
import { channelBoardSchema, channelDetailSchema, pointRateSchema, type ListPrice, type RateCompileResult } from '../model/jastalk.types';
import { JastalkAdminMock, setJastalkMockOutage } from '../services/mock/jastalkAdminMock';

const opus: ListPrice = {
  modelKey: 'claude-opus-5.5',
  maker: 'anthropic',
  billingType: 'per_token',
  rate: { input: { perMToken: 5 }, output: { perMToken: 25 } },
  usdInput: 5,
  usdOutput: 25,
  convertible: true,
  pointsInput: 3500,
  pointsOutput: 17500,
};

/** 牌价按字符算，语音在这边按秒计量：折不了。 */
const perCharacter: ListPrice = {
  modelKey: 'cosyvoice2-0.5b',
  maker: 'funaudiollm',
  billingType: 'per_character',
  rate: { pricePerKChar: 0.007 },
  usdInput: null,
  usdOutput: null,
  convertible: false,
  pointsInput: null,
  pointsOutput: null,
};

describe('channel pricing wording', () => {
  it('labels the four price sources with words of one length', () => {
    expect(pricingLabels).toEqual({ compiled: '跟随渠道', manual: '单独定价', default: '默认价格', none: '尚未定价' });
    expect(new Set(Object.values(pricingLabels).map((label) => label.length)).size).toBe(1);
  });

  it('writes a multiplier as ×N and says so when a channel has none', () => {
    expect(multiplierText(7)).toBe('×7');
    expect(multiplierText(7.3)).toBe('×7.3');
    expect(multiplierText(1.23456)).toBe('×1.2346');
    expect(multiplierText(0)).toBe('×0');
    expect(multiplierText(null)).toBe('未设置');
  });

  it('writes a model price with only the numbers its category uses', () => {
    expect(describeModelPrice('chat', 3500, 17500)).toBe('输入 3,500 · 输出 17,500 / 百万 token');
    expect(describeModelPrice('image', 0, 8.76)).toBe('8.76 / 张');
    // 按秒的牌价折出来输入、输出是同一个数：合成只看输出价，听写只看输入价
    expect(describeModelPrice('tts', 0.073, 0.05)).toBe('0.05 / 秒');
    expect(describeModelPrice('stt', 0.073, 0.05)).toBe('0.073 / 秒');
  });

  it('writes a list price in dollars, or how it is billed when it cannot be converted', () => {
    expect(formatUsd(0.0001)).toBe('$0.0001');
    expect(describeListPrice(opus, 'token')).toBe('输入 $5 · 输出 $25 / 百万 token');
    expect(describeListPrice({ ...opus, usdInput: 0, usdOutput: 0.012 }, 'image')).toBe('$0.012 / 张');
    expect(describeListPrice(perCharacter, 'token')).toBe('按字符计价');
    // 这边不认识的计价方式原样显示
    expect(listBillingLabel('per_song')).toBe('per_song');
  });

  it('lists one formula row per number the category uses', () => {
    expect(formulaRows('chat', opus)).toEqual([
      { label: '输入', usd: 5, points: 3500 },
      { label: '输出', usd: 25, points: 17500 },
    ]);
    const perSecond = { ...opus, usdInput: 0.0001, usdOutput: 0.0001, pointsInput: 0.073, pointsOutput: 0.073 };
    expect(formulaRows('tts', perSecond)).toEqual([{ label: '合成', usd: 0.0001, points: 0.073 }]);
    expect(formulaRows('stt', perSecond)).toEqual([{ label: '听写', usd: 0.0001, points: 0.073 }]);
    expect(formulaRows('image', { ...opus, usdInput: 0, usdOutput: 0.012, pointsInput: 0, pointsOutput: 8.76 })).toEqual([{ label: '每张', usd: 0.012, points: 8.76 }]);
    expect(Object.keys(categoryPriceSlots).sort()).toEqual(['chat', 'embed', 'image', 'rerank', 'stt', 'tts']);
  });

  it('notes that a tiered image price takes the dearest tier', () => {
    const tiered = { ...opus, billingType: 'per_image', rate: { tiers: [{ pricePerImage: 0.008 }, { pricePerImage: 0.012 }] } };
    expect(listPriceNote(tiered)).toBe('牌价分 2 档，取最贵的一档');
    expect(listPriceNote({ ...tiered, rate: { tiers: [{ pricePerImage: 0.008 }] } })).toBeNull();
    expect(listPriceNote(opus)).toBeNull();
  });

  it('says why a model cannot follow its channel, list price first', () => {
    expect(followBlock({ multiplier: 7, listPrice: opus, listPricesLoaded: true })).toBeNull();
    expect(followBlock({ multiplier: null, listPrice: opus, listPricesLoaded: true })).toBe('no_multiplier');
    expect(followBlock({ multiplier: 7, listPrice: null, listPricesLoaded: true })).toBe('no_list_price');
    expect(followBlock({ multiplier: 7, listPrice: perCharacter, listPricesLoaded: true })).toBe('unit_mismatch');
    // 牌价里没有的模型，设了倍率也算不出价：先说牌价的事，不让人白设一次倍率
    expect(followBlock({ multiplier: null, listPrice: null, listPricesLoaded: true })).toBe('no_list_price');
    // 没读到牌价时每个模型的牌价都是空的，那不是「牌价里没有它」
    expect(followBlock({ multiplier: 7, listPrice: null, listPricesLoaded: false })).toBe('list_prices_missing');

    expect(followBlockText('unit_mismatch', perCharacter, 'audio_second')).toBe('牌价按字符计价，折不成按秒');
    expect(followBlockText('no_list_price', null, 'token')).toBe('牌价里没有这个模型');
    expect(followBlockText('list_prices_missing', null, 'token')).toBe('没读到牌价');
    expect(followBlockText('no_multiplier', opus, 'token')).toBe('渠道没设倍率');
  });

  it('sums up a recompile in one sentence and lists what found no list price', () => {
    const result = (over: Partial<RateCompileResult>): RateCompileResult => ({
      compiled: 0, unchanged: 0, removed: 0, unmatched: [], listPricesEmpty: false, newVersion: null, ...over,
    });
    expect(describeCompile(result({ compiled: 3, unchanged: 2, newVersion: 15 }))).toBe('重算了 3 个价格');
    expect(describeCompile(result({ unchanged: 5 }))).toBe('价格没有变化');
    expect(describeCompile(result({ removed: 2, newVersion: 16 }))).toBe('删掉 2 个算出来的价');
    // 没读到牌价是什么都没重算，不能说成「价格没有变化」
    expect(describeCompile(result({ listPricesEmpty: true }))).toBe('手上没有牌价，没法算新价');
    expect(describeCompile(result({ removed: 2, listPricesEmpty: true }))).toBe('删掉 2 个算出来的价，手上没有牌价，没法算新价');

    const unmatched = result({
      compiled: 1,
      unmatched: [
        { vendorKey: 'media', modelName: 'FunAudioLLM/SenseVoiceSmall', reason: 'no_list_price' },
        { vendorKey: 'media', modelName: 'fishaudio/fish-speech-1.5', reason: 'unit_mismatch' },
        { vendorKey: 'media', modelName: 'imagen-5', reason: 'no_list_price' },
      ],
    });
    expect(describeCompile(unmatched)).toBe('重算了 1 个价格，3 个对不上牌价');
    expect(unmatchedLines(unmatched)).toEqual([
      'FunAudioLLM/SenseVoiceSmall：牌价里没有',
      'fishaudio/fish-speech-1.5：计价方式对不上',
      'imagen-5：牌价里没有',
    ]);
    expect(unmatchedLines(unmatched, 2)).toEqual(['FunAudioLLM/SenseVoiceSmall：牌价里没有', 'fishaudio/fish-speech-1.5：计价方式对不上', '还有 1 个']);
  });
});

/**
 * mock 的规矩要和后端（ChannelAdminService、PointRateCompiler）一样，不然页面在 mock 下点得通、接上后端就不对。
 * 数据是这个文件独一份的（模块级），下面的用例按顺序跑，前面改过的后面接着用。
 */
describe('jastalk channel mock follows the backend rules', () => {
  const port = new JastalkAdminMock();

  afterEach(() => setJastalkMockOutage({ upstream: false, listPrices: false }));

  async function board() {
    const r = await port.channels();
    if (!r.success) throw new Error('channels failed');
    return channelBoardSchema.parse(r.data);
  }

  async function detail(vendorKey: string) {
    const r = await port.channel(vendorKey);
    if (!r.success) throw new Error('channel failed');
    // mock 回的也得过和真接口一样的校验
    return channelDetailSchema.parse(r.data);
  }

  async function rateRow(vendorKey: string, modelName: string) {
    const r = await port.rates();
    if (!r.success) throw new Error('rates failed');
    return r.data.map((row) => pointRateSchema.parse(row)).find((row) => row.vendorKey === vendorKey && row.modelName === modelName);
  }

  const priceOf = async (vendorKey: string, modelName: string) => {
    const row = (await detail(vendorKey)).models.find((m) => m.model.modelName === modelName);
    return row && { pricing: row.pricing, priced: row.model.priced, input: row.model.inputPrice, output: row.model.outputPrice };
  };

  it('lists every channel: online ones, ones with a multiplier here, ones with models in the catalog', async () => {
    const b = await board();
    expect(b).toMatchObject({ upstreamReachable: true, listPricesLoaded: true });
    expect(b.listPriceCount).toBeGreaterThan(0);
    // 页头上的版本号就是目录那一个
    const catalog = await port.catalog();
    expect(catalog).toMatchObject({ success: true, data: { version: b.version } });
    expect(b.channels.map((c) => c.vendorKey)).toEqual(['antigravity', 'claude', 'codex', 'kiro', 'media']);

    const by = Object.fromEntries(b.channels.map((c) => [c.vendorKey, c]));
    expect(by.kiro).toMatchObject({ vendorName: 'Kiro', multiplier: 7, online: true, upstreamModels: 4, models: 2, priced: 2, unpriced: 0 });
    // 没在这边设置过的渠道：因为 OneApi 在线、目录里有它的模型才列出来；名字取模型身上的
    expect(by.antigravity).toMatchObject({ vendorName: 'Antigravity', multiplier: null, online: true, updatedAt: null });
    // provider 停了：渠道照样在，标成不在线
    expect(by.codex).toMatchObject({ online: false, upstreamModels: 0, models: 1, priced: 1 });
    expect(by.media).toMatchObject({ models: 4, priced: 3, unpriced: 1 });
  });

  it('prices a model as list price × multiplier × 100 and says where each price comes from', async () => {
    const kiro = await detail('kiro');
    const opusRow = kiro.models.find((m) => m.model.modelName === 'claude-opus-5.5')!;
    expect(opusRow).toMatchObject({ pricing: 'compiled', upstream: true });
    expect(opusRow.model).toMatchObject({ priced: true, inputPrice: 3500, outputPrice: 17500, ratedBy: 'kiro/claude-opus-5.5' });
    expect(opusRow.listPrice).toMatchObject({ modelKey: 'claude-opus-5.5', usdInput: 5, usdOutput: 25, convertible: true, pointsInput: 3500, pointsOutput: 17500 });
    const opusRate = await rateRow('kiro', 'claude-opus-5.5');
    expect(opusRate).toMatchObject({ source: 'compiled', sourceModelKey: 'claude-opus-5.5', multiplierApplied: 7 });
    // 模型自己那一行价格的编号：算出来的、单独定的都有
    expect(opusRow.rateId).toBe(opusRate?.id);

    // 还没接的：按码点排；带后缀的名字对到最长的那个牌价键上
    expect(kiro.available.map((m) => m.modelName)).toEqual(['claude-haiku-5-5', 'claude-opus-5.5-thinking']);
    expect(kiro.available[1]?.listPrice).toMatchObject({ modelKey: 'claude-opus-5.5', pointsInput: 3500 });

    const media = await detail('media');
    const of = (name: string) => media.models.find((m) => m.model.modelName === name)!;
    // 按张的牌价分档，取最贵的一档：0.012 × 7.3 × 100
    expect(of('Kwai-Kolors/Kolors')).toMatchObject({ pricing: 'compiled', model: { unit: 'image', inputPrice: 0, outputPrice: 8.76 } });
    // 牌价按字符算、折不成按秒：只能单独定价
    expect(of('FunAudioLLM/CosyVoice2-0.5B')).toMatchObject({ pricing: 'manual', listPrice: { convertible: false, usdOutput: null, pointsOutput: null } });
    expect(of('FunAudioLLM/CosyVoice2-0.5B').rateId).toBe((await rateRow('media', 'FunAudioLLM/CosyVoice2-0.5B'))?.id);
    // 牌价里没有，默认价又是按 token 的：没有价格，也就没有价格行
    expect(of('FunAudioLLM/SenseVoiceSmall')).toMatchObject({ pricing: 'none', rateId: null, listPrice: null, model: { priced: false, ratedBy: null } });
    expect(media.available.find((m) => m.modelName === 'BAAI/bge-reranker-v2-m3')?.listPrice).toBeNull();
    // 还没接的一律按对话（token）预览：按分钟的牌价在这个预览里折不了
    expect(media.available.find((m) => m.modelName === 'openai/whisper-large-v3')?.listPrice).toMatchObject({ billingType: 'per_audio_minute', convertible: false });

    // 渠道没设倍率：落在默认价上；牌价有，但折不出积分。默认价那一行不归它，不给编号（不能让页面顺手删了）
    const flash = (await detail('antigravity')).models[0]!;
    expect(flash).toMatchObject({ pricing: 'default', rateId: null, model: { ratedBy: '*/*' }, listPrice: { usdInput: 0.3, convertible: true, pointsInput: null } });

    // 渠道不在线：读不到它发布了什么，接进来的都算「上游没有」，可接入的是空的
    const codex = await detail('codex');
    expect(codex.channel.online).toBe(false);
    expect(codex.available).toEqual([]);
    expect(codex.models[0]).toMatchObject({ pricing: 'compiled', upstream: false, model: { inputPrice: 875, outputPrice: 7000 } });
  });

  it('previews what can still be imported in the unit of the category it would be imported as', async () => {
    const preview = async (category?: 'chat' | 'image' | 'tts' | 'stt') => {
      const r = await port.channel('media', category);
      if (!r.success) throw new Error('channel failed');
      const d = channelDetailSchema.parse(r.data);
      return {
        whisper: d.available.find((m) => m.modelName === 'openai/whisper-large-v3')?.listPrice,
        fish: d.available.find((m) => m.modelName === 'fishaudio/fish-speech-1.5')?.listPrice,
        kolors: d.models.find((m) => m.model.modelName === 'Kwai-Kolors/Kolors')?.listPrice,
      };
    };

    // 不带类别就是对话：按分钟的牌价折不成按 token
    expect((await preview()).whisper).toMatchObject({ convertible: false, usdInput: null, pointsInput: null });
    expect((await preview('chat')).whisper).toMatchObject({ convertible: false });
    // 打算接成语音听写：按分钟 → 按秒，0.006 / 60 × 7.3 × 100
    expect((await preview('stt')).whisper).toMatchObject({ convertible: true, usdInput: 0.0001, pointsInput: 0.073, pointsOutput: 0.073 });
    // 按字符的牌价接成语音合成也折不了；接成生图更不行
    expect((await preview('tts')).fish).toMatchObject({ billingType: 'per_character', convertible: false });
    expect((await preview('image')).whisper).toMatchObject({ convertible: false });
    // 已经接进来的不看这个参数，各按自己那一类折
    expect((await preview('stt')).kolors).toMatchObject({ convertible: true, pointsOutput: 8.76 });
  });

  it('recompiles the channel when its multiplier changes, and reports models that found no list price', async () => {
    const before = await port.catalog();
    if (!before.success) throw new Error('catalog failed');

    const saved = await port.saveChannel('kiro', { vendorName: 'Kiro', multiplier: 8 });
    if (!saved.success) throw new Error('save failed');
    expect(saved.data.channel).toMatchObject({ vendorKey: 'kiro', multiplier: 8 });
    expect(saved.data.compile).toMatchObject({ compiled: 2, unchanged: 0, removed: 0, unmatched: [], listPricesEmpty: false, newVersion: before.data.version + 1 });
    expect(await priceOf('kiro', 'claude-opus-5.5')).toEqual({ pricing: 'compiled', priced: true, input: 4000, output: 20000 });
    expect(await rateRow('kiro', 'claude-sonnet-5.5')).toMatchObject({ inputPrice: 2400, outputPrice: 12000, multiplierApplied: 8 });

    // 再存一次一样的：什么都没变，版本号不动
    const again = await port.saveChannel('kiro', { vendorName: 'Kiro', multiplier: 8 });
    expect(again).toMatchObject({ success: true, data: { compile: { compiled: 0, unchanged: 2, newVersion: null } } });

    // 单独定过价的不算「对不上」（重算不碰它）；真没有牌价的才报
    const media = await port.saveChannel('media', { vendorName: '媒体', multiplier: 7.3 });
    expect(media).toMatchObject({
      success: true,
      data: { compile: { compiled: 0, unmatched: [{ vendorKey: 'media', modelName: 'FunAudioLLM/SenseVoiceSmall', reason: 'no_list_price' }] } },
    });
  });

  it('refuses a multiplier outside 0–1000 with a reason code, not a sentence of its own', async () => {
    for (const multiplier of [-0.1, 1000.5]) {
      const r = await port.saveChannel('kiro', { vendorName: 'Kiro', multiplier });
      expect(r).toMatchObject({ success: false, error: { code: 'validation', reason: 'channel_multiplier_invalid' } });
    }
    expect(await port.saveChannel('kiro', { vendorName: 'x'.repeat(65), multiplier: 8 })).toMatchObject({
      success: false,
      error: { reason: 'catalog_display_name_too_long' },
    });
    expect(await port.saveChannel('*', { vendorName: null, multiplier: 1 })).toMatchObject({ success: false, error: { reason: 'catalog_vendor_invalid' } });
    // 拒掉的没有存进去
    expect((await board()).channels.find((c) => c.vendorKey === 'kiro')?.multiplier).toBe(8);
    // 两头的边界值是能存的
    expect(await port.saveChannel('kiro', { vendorName: 'Kiro', multiplier: 1000 })).toMatchObject({ success: true });
    expect(await port.saveChannel('kiro', { vendorName: 'Kiro', multiplier: 8 })).toMatchObject({ success: true });
  });

  it('renames the channel on every model it has, and falls back to the key when the name is empty', async () => {
    await port.saveChannel('kiro', { vendorName: ' Kiro 反代 ', multiplier: 8 });
    expect((await detail('kiro')).models.map((m) => m.model.vendorName)).toEqual(['Kiro 反代', 'Kiro 反代']);
    const cleared = await port.saveChannel('kiro', { vendorName: null, multiplier: 8 });
    expect(cleared).toMatchObject({ success: true, data: { channel: { vendorName: 'kiro' } } });
    await port.saveChannel('kiro', { vendorName: 'Kiro', multiplier: 8 });
  });

  it('keeps a model priced on its own out of recompiles, and sends it back to the channel when that price is deleted', async () => {
    // 改一行算出来的价 = 单独定价
    const manual = await port.saveRate({ vendorKey: 'kiro', modelName: 'claude-opus-5.5', unit: 'token', inputPrice: 100, outputPrice: 200 });
    if (!manual.success) throw new Error('save rate failed');
    expect(manual.data).toMatchObject({ source: 'manual', sourceModelKey: null, multiplierApplied: null });
    expect(await priceOf('kiro', 'claude-opus-5.5')).toEqual({ pricing: 'manual', priced: true, input: 100, output: 200 });

    // 渠道改倍率：它不动，别的跟着变
    const saved = await port.saveChannel('kiro', { vendorName: 'Kiro', multiplier: 9 });
    expect(saved).toMatchObject({ success: true, data: { compile: { compiled: 1, unmatched: [] } } });
    expect(await priceOf('kiro', 'claude-opus-5.5')).toMatchObject({ pricing: 'manual', input: 100 });
    expect(await priceOf('kiro', 'claude-sonnet-5.5')).toMatchObject({ pricing: 'compiled', input: 2700 });

    // 删掉单独定的价（拿渠道详情里带的编号去删）：当场按现在的倍率算回来
    const rateId = (await detail('kiro')).models.find((m) => m.model.modelName === 'claude-opus-5.5')?.rateId;
    expect(rateId).toBe(manual.data.id);
    expect(await port.deleteRate(rateId!)).toMatchObject({ success: true });
    expect(await priceOf('kiro', 'claude-opus-5.5')).toEqual({ pricing: 'compiled', priced: true, input: 4500, output: 22500 });
    expect(await rateRow('kiro', 'claude-opus-5.5')).toMatchObject({ source: 'compiled', multiplierApplied: 9 });
  });

  it('drops the compiled prices of a channel that no longer has a multiplier, and brings them back when it has one again', async () => {
    const cleared = await port.saveChannel('kiro', { vendorName: 'Kiro', multiplier: null });
    expect(cleared).toMatchObject({ success: true, data: { channel: { multiplier: null }, compile: { compiled: 0, removed: 2, unmatched: [] } } });
    expect(await rateRow('kiro', 'claude-opus-5.5')).toBeUndefined();
    // 没有自己的价了：落到默认价上
    expect(await priceOf('kiro', 'claude-opus-5.5')).toEqual({ pricing: 'default', priced: true, input: 300, output: 1500 });

    const back = await port.saveChannel('kiro', { vendorName: 'Kiro', multiplier: 7 });
    expect(back).toMatchObject({ success: true, data: { compile: { compiled: 2, removed: 0 } } });
    expect(await priceOf('kiro', 'claude-opus-5.5')).toMatchObject({ pricing: 'compiled', input: 3500 });
  });

  it('imports models from what the channel publishes: skips what the category has, prices what the list covers', async () => {
    const r = await port.importModels('kiro', { category: 'chat', models: ['claude-haiku-5-5', ' claude-opus-5.5 ', 'claude-haiku-5-5'], enabled: true });
    if (!r.success) throw new Error('import failed');
    expect(r.data).toMatchObject({ added: 1, skipped: 1, compile: { compiled: 1, unmatched: [] } });

    const kiro = await detail('kiro');
    const haiku = kiro.models.find((m) => m.model.modelName === 'claude-haiku-5-5')!;
    // 名字先用模型名顶着；渠道名跟渠道；排在这一类现有的后面
    expect(haiku.model).toMatchObject({ category: 'chat', vendorName: 'Kiro', displayName: 'claude-haiku-5-5', enabled: true, inputPrice: 700, outputPrice: 3500 });
    expect(haiku.model.sort).toBeGreaterThan(Math.max(...kiro.models.filter((m) => m !== haiku).map((m) => m.model.sort)));
    expect(haiku.pricing).toBe('compiled');
    expect(kiro.available.map((m) => m.modelName)).toEqual(['claude-opus-5.5-thinking']);
    expect(kiro.channel).toMatchObject({ models: 3, priced: 3 });

    // 按分钟的牌价折成按秒：0.006 / 60 × 7.3 × 100，输入输出一样
    const stt = await port.importModels('media', { category: 'stt', models: ['openai/whisper-large-v3'], enabled: false });
    expect(stt).toMatchObject({ success: true, data: { added: 1 } });
    expect(await priceOf('media', 'openai/whisper-large-v3')).toEqual({ pricing: 'compiled', priced: true, input: 0.073, output: 0.073 });

    // 牌价按字符算的语音合成：接得进来，但算不出价，报出来让人去单独定价
    const tts = await port.importModels('media', { category: 'tts', models: ['fishaudio/fish-speech-1.5'], enabled: true });
    if (!tts.success) throw new Error('import failed');
    expect(tts.data.compile.unmatched).toContainEqual({ vendorKey: 'media', modelName: 'fishaudio/fish-speech-1.5', reason: 'unit_mismatch' });
    expect(await priceOf('media', 'fishaudio/fish-speech-1.5')).toMatchObject({ pricing: 'none', priced: false });

    expect(await port.importModels('kiro', { category: 'chat', models: [' '], enabled: true })).toMatchObject({
      success: false,
      error: { reason: 'catalog_model_invalid' },
    });
  });

  it('removes the compiled price of a model that leaves the catalog', async () => {
    const haiku = (await detail('kiro')).models.find((m) => m.model.modelName === 'claude-haiku-5-5')!;
    expect(await rateRow('kiro', 'claude-haiku-5-5')).toBeDefined();
    expect(await port.deleteModel(haiku.model.id)).toMatchObject({ success: true });
    expect(await rateRow('kiro', 'claude-haiku-5-5')).toBeUndefined();
    expect((await detail('kiro')).available.map((m) => m.modelName)).toContain('claude-haiku-5-5');
  });

  it('keeps compiled prices in use when no list prices are at hand, and recompiles once they are back', async () => {
    setJastalkMockOutage({ listPrices: true });
    expect(await board()).toMatchObject({ listPricesLoaded: false, listPriceCount: 0 });

    const saved = await port.saveChannel('codex', { vendorName: 'Codex', multiplier: 8 });
    // 没有牌价 = 不知道，不是「都没有价格」：不重算、不删、也不报对不上
    expect(saved).toMatchObject({
      success: true,
      data: { channel: { multiplier: 8 }, compile: { compiled: 0, removed: 0, unmatched: [], listPricesEmpty: true, newVersion: null } },
    });
    const stale = (await detail('codex')).models[0]!;
    expect(stale).toMatchObject({ pricing: 'compiled', listPrice: null, model: { priced: true, inputPrice: 875 } });

    setJastalkMockOutage({ listPrices: false });
    const recompiled = await port.compileRates('codex');
    expect(recompiled).toMatchObject({ success: true, data: { compiled: 1, listPricesEmpty: false } });
    expect(await priceOf('codex', 'gpt-5.5')).toMatchObject({ input: 1000, output: 8000 });

    // 不给渠道就全算；都算过了，没有变化
    expect(await port.compileRates()).toMatchObject({ success: true, data: { compiled: 0, removed: 0, newVersion: null } });
  });

  it('still lists the channels when the OneApi catalog cannot be read, with nothing to import', async () => {
    setJastalkMockOutage({ upstream: true });
    const b = await board();
    expect(b.upstreamReachable).toBe(false);
    expect(b.channels.map((c) => c.vendorKey)).toEqual(['antigravity', 'claude', 'codex', 'kiro', 'media']);
    expect(b.channels.every((c) => !c.online && c.upstreamModels === 0)).toBe(true);
    // 价格不受影响：价格表里的数还在
    expect(b.channels.find((c) => c.vendorKey === 'kiro')).toMatchObject({ multiplier: 7, priced: 2 });

    const kiro = await detail('kiro');
    expect(kiro.available).toEqual([]);
    expect(kiro.models.every((m) => !m.upstream)).toBe(true);
  });
});
