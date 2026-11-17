import { describe, expect, it } from 'vitest';

import {
  catalogBoardSchema,
  jastalkUserSchema,
  pointAccountSchema,
  pointRateSchema,
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
    expect(pointRateSchema.parse({ id: 5, vendorKey: '*', modelName: '*', unit: 'token', inputPrice: 300, outputPrice: 1500, updatedAt: 1763452800000 }).unit).toBe('token');
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
