import { describe, expect, it } from 'vitest';

import {
  catalogBoardSchema,
  channelBoardSchema,
  channelDetailSchema,
  channelSavedSchema,
  jastalkUserSchema,
  modelImportResultSchema,
  pointAccountSchema,
  pointRateSchema,
  rateCompileResultSchema,
  usageLogSchema,
} from '../model/jastalk.types';
import { describePrice, formatPoints, parseAccountUid, purposeLabel, txnAmountText } from '../model/jastalkFormat';
import { JastalkAdminMock } from '../services/mock/jastalkAdminMock';

/**
 * 后端（Meeko.Jastalk 的 jastalk/api/admin/*）回的形状：camelCase、枚举 snake_case、时间 Unix 毫秒。
 * 下面的样本照 C# 的 DTO 写的；后端改了字段，这里先挂，而不是页面上某一格悄悄空着。
 */
describe('jastalk admin wire shapes', () => {
  it('reads a user row (AdminUserDto)', () => {
    const row = { accountUid: 100237, joinedAt: 1763452800000, lastSeenAt: 1763539200000, blockedAt: null, pointsAvailable: 1250.5, pointsHeld: 4.5 };
    expect(jastalkUserSchema.parse(row)).toEqual(row);
    expect(jastalkUserSchema.parse({ ...row, blockedAt: 1763539200000 }).blockedAt).toBe(1763539200000);
  });

  it('reads a point account with its ledger (AdminPointAccountDto)', () => {
    const account = pointAccountSchema.parse({
      accountUid: 100237,
      balance: { available: 97.3, held: 0 },
      txns: {
        items: [
          { id: 3, kind: 'release', amount: 1.8, availableAfter: 97.3, heldAfter: 0, source: { kind: 'usage', ref: 'jastalk:100237:g1' }, note: null, createdAt: 1763539204000 },
          { id: 2, kind: 'charge', amount: 2.7, availableAfter: 97.3, heldAfter: 0, source: { kind: 'usage', ref: 'jastalk:100237:g1' }, note: null, createdAt: 1763539204000 },
          { id: 1, kind: 'grant', amount: 100, availableAfter: 100, heldAfter: 0, source: { kind: 'staff', ref: '9001' }, note: '补偿', createdAt: 1763539100000 },
        ],
        total: 3,
        page: 1,
        pageSize: 20,
      },
    });
    expect(account.txns.items.map((t) => t.kind)).toEqual(['release', 'charge', 'grant']);
    // 后端的枚举是 snake_case 小写；别的写法不认
    expect(() => pointAccountSchema.parse({ ...account, txns: { items: [{ ...account.txns.items[0], kind: 'Release' }], total: 1 } })).toThrow();
  });

  it('reads the catalog board and a rate row (CatalogBoardDto, PointRateDto)', () => {
    const board = catalogBoardSchema.parse({
      version: 14,
      models: [
        {
          id: 1, category: 'chat', vendorKey: 'kiro', vendorName: 'Kiro', modelName: 'claude-opus-5.5', displayName: 'Claude Opus 5.5',
          enabled: true, sort: 10, priced: true, unit: 'token', inputPrice: 1500, outputPrice: 7500, ratedBy: 'kiro/claude-opus-5.5', updatedAt: 1763452800000,
        },
        {
          id: 7, category: 'stt', vendorKey: 'media', vendorName: '媒体', modelName: 'SenseVoiceSmall', displayName: 'SenseVoice',
          enabled: true, sort: 10, priced: false, unit: 'audio_second', inputPrice: 0, outputPrice: 0, ratedBy: null, updatedAt: 1763452800000,
        },
      ],
    });
    expect(board.models[1]?.priced).toBe(false);

    // 人定的行没有牌价键和倍率；算出来的行两样都有
    const manual = { id: 5, vendorKey: '*', modelName: '*', unit: 'token', inputPrice: 300, outputPrice: 1500, updatedAt: 1763452800000, source: 'manual', sourceModelKey: null, multiplierApplied: null };
    const compiled = { id: 6, vendorKey: 'kiro', modelName: 'claude-opus-5.5', unit: 'token', inputPrice: 3500, outputPrice: 17500, updatedAt: 1763452800000, source: 'compiled', sourceModelKey: 'claude-opus-5.5', multiplierApplied: 7 };
    expect(pointRateSchema.parse(manual)).toEqual(manual);
    expect(pointRateSchema.parse(compiled)).toEqual(compiled);
    // 没带 source 的是改之前的后端：先挂，不把它当成单独定价悄悄显示
    expect(() => pointRateSchema.parse({ ...manual, source: undefined })).toThrow();
  });

  const channel = { vendorKey: 'kiro', vendorName: 'Kiro', multiplier: 7, online: true, upstreamModels: 4, models: 2, priced: 2, unpriced: 0, updatedAt: 1763452800000 };
  const compile = { compiled: 2, unchanged: 0, removed: 0, unmatched: [], listPricesEmpty: false, newVersion: 15 };

  it('reads the channel board (ChannelBoardDto)', () => {
    // 没在这边设置过的渠道：没有倍率、没有更新时间；不在线的照样在清单里
    const untouched = { vendorKey: 'antigravity', vendorName: 'antigravity', multiplier: null, online: false, upstreamModels: 0, models: 0, priced: 0, unpriced: 0, updatedAt: null };
    const board = { version: 15, channels: [channel, untouched], upstreamReachable: true, listPricesLoaded: false, listPriceCount: 0 };
    expect(channelBoardSchema.parse(board)).toEqual(board);
    // 页头要显示版本号：后端没带就先挂，不显示成「版本 undefined」
    expect(() => channelBoardSchema.parse({ ...board, version: undefined })).toThrow();
    // 时间是 Unix 毫秒，不是 ISO 字符串
    expect(() => channelBoardSchema.parse({ ...board, channels: [{ ...channel, updatedAt: '2026-11-19T17:43:42Z' }] })).toThrow();
  });

  it('reads a channel with its models and what can still be imported (ChannelDetailDto)', () => {
    const model = {
      id: 1, category: 'chat', vendorKey: 'kiro', vendorName: 'Kiro', modelName: 'claude-opus-5.5', displayName: 'Claude Opus 5.5',
      enabled: true, sort: 10, priced: true, unit: 'token', inputPrice: 3500, outputPrice: 17500, ratedBy: 'kiro/claude-opus-5.5', updatedAt: 1763452800000,
    };
    const listPrice = {
      modelKey: 'claude-opus-5.5', maker: 'anthropic', billingType: 'per_token', rate: { input: { perMToken: 5, cachedRead: 0.5 }, output: { perMToken: 25 } },
      usdInput: 5, usdOutput: 25, convertible: true, pointsInput: 3500, pointsOutput: 17500,
    };
    // 牌价按字符算、折不成按秒：美元和积分那四个数都是空的
    const unconvertible = {
      modelKey: 'cosyvoice2-0.5b', maker: 'funaudiollm', billingType: 'per_character', rate: { pricePerKChar: 0.007 },
      usdInput: null, usdOutput: null, convertible: false, pointsInput: null, pointsOutput: null,
    };
    const detail = channelDetailSchema.parse({
      channel,
      models: [
        { model, pricing: 'compiled', rateId: 6, listPrice, upstream: true },
        // 没有自己的价格行（没有价、或者落在通配价上）：编号是 null
        { model: { ...model, id: 2, category: 'tts', unit: 'audio_second', priced: false, inputPrice: 0, outputPrice: 0, ratedBy: null }, pricing: 'none', rateId: null, listPrice: unconvertible, upstream: false },
      ],
      available: [
        { modelName: 'claude-haiku-5-5', listPrice: { ...listPrice, modelKey: 'claude-haiku-5-5' } },
        { modelName: 'imagen-5', listPrice: null },
      ],
    });
    expect(detail.models.map((m) => [m.pricing, m.rateId])).toEqual([['compiled', 6], ['none', null]]);
    expect(detail.models[1]?.listPrice?.convertible).toBe(false);
    expect(detail.available[1]?.listPrice).toBeNull();
    // 来源只有四种；后端加了第五种，页面上的标签和「能不能跟渠道」都得跟着改
    expect(() => channelDetailSchema.parse({ channel, models: [{ model, pricing: 'inherited', rateId: 6, listPrice, upstream: true }], available: [] })).toThrow();
    // 切回跟渠道要靠 rateId 去删那一行：没带这个字段的是改之前的后端
    expect(() => channelDetailSchema.parse({ channel, models: [{ model, pricing: 'manual', listPrice, upstream: true }], available: [] })).toThrow();
  });

  it('reads what comes back from saving a channel, importing models and recompiling (ChannelSavedDto, ModelImportResult, RateCompileResult)', () => {
    const unmatched = [
      { vendorKey: 'media', modelName: 'FunAudioLLM/SenseVoiceSmall', reason: 'no_list_price' },
      { vendorKey: 'media', modelName: 'fishaudio/fish-speech-1.5', reason: 'unit_mismatch' },
    ];
    expect(channelSavedSchema.parse({ channel, compile })).toEqual({ channel, compile });
    expect(modelImportResultSchema.parse({ added: 2, skipped: 1, compile: { ...compile, unmatched } }).compile.unmatched).toEqual(unmatched);
    // 没有改动时版本号是 null；没读到牌价时什么都没重算
    const idle = { compiled: 0, unchanged: 0, removed: 0, unmatched: [], listPricesEmpty: true, newVersion: null };
    expect(rateCompileResultSchema.parse(idle)).toEqual(idle);
  });

  it('reads a usage log with its lines (AdminUsageLogDto)', () => {
    const log = usageLogSchema.parse({
      id: 80001, accountUid: 100237, actionId: 'a-1', purpose: 'chat', conversationId: 'c:xiaoman', traceId: null,
      status: 'charged', upstreamSuccess: true, amount: 2.7, createdAt: 1763539204000,
      lines: [
        {
          kind: 'chat', vendorKey: 'kiro', modelName: 'claude-opus-5.5', unit: 'token', inputTokens: 8000, outputTokens: 200, quantity: 0,
          estimated: false, ratedBy: 'kiro/claude-opus-5.5', inputPrice: 300, outputPrice: 1500, points: 2.7,
        },
      ],
    });
    expect(log.lines[0]?.points).toBe(2.7);
  });
});

describe('jastalk formatting', () => {
  it('writes points with up to two decimals', () => {
    expect(formatPoints(1250.5)).toBe('1,250.5');
    expect(formatPoints(2.7)).toBe('2.7');
    expect(formatPoints(0)).toBe('0');
  });

  it('says what a price means for each unit', () => {
    expect(describePrice('token', 300, 1500)).toBe('输入 300 · 输出 1,500 / 百万 token');
    expect(describePrice('image', 0, 6)).toBe('6 / 张');
    expect(describePrice('audio_second', 0, 0.05)).toBe('合成 0.05 / 秒');
    expect(describePrice('audio_second', 0.02, 0)).toBe('听写 0.02 / 秒');
  });

  it('signs a ledger line by what it did to the available balance', () => {
    expect(txnAmountText({ kind: 'grant', amount: 100 })).toBe('+100');
    expect(txnAmountText({ kind: 'release', amount: 1.8 })).toBe('+1.8');
    expect(txnAmountText({ kind: 'hold', amount: 4.5 })).toBe('−4.5');
    expect(txnAmountText({ kind: 'deduct', amount: 50 })).toBe('−50');
  });

  it('accepts only digits as an account uid, and shows unknown purposes as they are', () => {
    expect(parseAccountUid(' 100237 ')).toEqual({ ok: true, value: 100237 });
    expect(parseAccountUid('')).toEqual({ ok: true, value: undefined });
    expect(parseAccountUid('abc')).toEqual({ ok: false });
    expect(purposeLabel('chat')).toBe('聊天回复');
    expect(purposeLabel('somethingNew')).toBe('somethingNew');
  });
});

/** mock 的规矩要和后端一样，不然页面在 mock 下看着对、接上后端就不对。 */
describe('jastalk admin mock follows the backend rules', () => {
  const page = { p: 1, pageSize: 100 };

  it('marks a model unpriced when no rate of the right unit applies, and priced once one is added', async () => {
    const port = new JastalkAdminMock();
    const before = await port.catalog();
    if (!before.success) throw new Error('catalog failed');
    const stt = before.data.models.find((m) => m.category === 'stt')!;
    // 默认价是按 token 的，听写要的是按秒的：用不上
    expect(stt.priced).toBe(false);

    const saved = await port.saveRate({ vendorKey: '*', modelName: stt.modelName, unit: 'audio_second', inputPrice: 0.02, outputPrice: 0 });
    expect(saved.success).toBe(true);
    const after = await port.catalog();
    if (!after.success) throw new Error('catalog failed');
    expect(after.data.models.find((m) => m.id === stt.id)).toMatchObject({ priced: true, inputPrice: 0.02, ratedBy: `*/${stt.modelName}` });
    // 目录和定价每改一次，版本号加一
    expect(after.data.version).toBe(before.data.version + 1);
  });

  it('refuses a rate for "every model of one vendor", and a duplicate catalog row', async () => {
    const port = new JastalkAdminMock();
    const rate = await port.saveRate({ vendorKey: 'kiro', modelName: '*', unit: 'token', inputPrice: 1, outputPrice: 1 });
    expect(rate.success).toBe(false);
    const dup = await port.saveModel({ id: null, category: 'chat', vendorKey: 'kiro', modelName: 'claude-opus-5.5', vendorName: '', displayName: '', enabled: true, sort: 1 });
    expect(dup).toMatchObject({ success: false, error: { message: '这一类里已经有这个渠道的这个模型了。' } });
  });

  it('records a staff adjustment once per request id and never deducts below zero', async () => {
    const port = new JastalkAdminMock();
    const users = await port.listUsers({}, page);
    if (!users.success) throw new Error('users failed');
    const uid = users.data.items[0]!.accountUid;
    const start = users.data.items[0]!.pointsAvailable;

    const grant = { delta: 50, note: '补偿', requestId: 'r-1' };
    const first = await port.adjustPoints(uid, grant);
    const replay = await port.adjustPoints(uid, grant);
    expect(first).toMatchObject({ success: true, data: { available: start + 50 } });
    expect(replay).toEqual(first);

    const cut = await port.adjustPoints(uid, { delta: -1_000_000, note: '清零', requestId: 'r-2' });
    expect(cut).toMatchObject({ success: true, data: { available: 0 } });
    const account = await port.pointAccount(uid, page);
    if (!account.success) throw new Error('account failed');
    expect(account.data.txns.items.slice(0, 2).map((t) => [t.kind, t.amount])).toEqual([
      ['deduct', start + 50],
      ['grant', 50],
    ]);
  });

  it('filters users by blocked state and keeps the first blocked time', async () => {
    const port = new JastalkAdminMock();
    const blocked = await port.listUsers({ blocked: true }, page);
    if (!blocked.success) throw new Error('users failed');
    expect(blocked.data.items.length).toBeGreaterThan(0);
    const one = blocked.data.items[0]!;
    await port.setBlocked(one.accountUid, true);
    const again = await port.listUsers({ accountUid: one.accountUid }, page);
    if (!again.success) throw new Error('users failed');
    expect(again.data.items[0]!.blockedAt).toBe(one.blockedAt);
    await port.setBlocked(one.accountUid, false);
    const active = await port.listUsers({ accountUid: one.accountUid, blocked: false }, page);
    expect(active).toMatchObject({ success: true, data: { total: 1 } });
  });
});
