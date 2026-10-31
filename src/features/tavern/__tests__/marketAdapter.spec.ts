import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ok } from '@/shared/api/httpTypes';
import * as http from '@/features/tavern/api/http';

import { TavernMarketHttpAdapter } from '../api/adapters/tavernMarketAdapter';

// 只替换传输，parseTavern 用真的：解析正是要测的东西。
vi.mock('@/features/tavern/api/http', async (importOriginal) => ({
  ...(await importOriginal<typeof http>()),
  requestTavern: vi.fn(),
}));

const request = vi.mocked(http.requestTavern);

/**
 * 钉住市场管理接口「后端真发什么」：两类商品按 `kind` 分形状、snake_case 枚举、epoch 毫秒、价格带币种、
 * 在卖的内容原样嵌着、不带版本。
 */
const ITEM_ID = '0193f5a0-7c1e-7d2a-9b3c-4e5f60718293';
const ACCOUNT = { uid: 100004120, displayName: '麻子', email: 'asako@example.com', phone: null };
const FACE = { name: '沈惟行', cover: null, tagline: '督察', description: null, tags: ['推理'] };
const CARD_LISTING = {
  kind: 'character_card',
  face: FACE,
  character: { avatar: null, greetings: [] },
  capabilities: { moments: false, mcpMemory: false, imageGen: false },
};
const TIME = { mode: 'turnbased', ratio: 1, turnMinutes: 30, storyStart: '1931-11-02T21:00:00' };

function wireItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    itemId: ITEM_ID,
    creator: ACCOUNT,
    listing: CARD_LISTING,
    price: { amount: 9.9, currency: 'CNY' },
    stats: { purchases: 128, rating: 4.4, ratingCount: 5 },
    state: 'listed',
    takedown: null,
    publishedAt: 1758600000000,
    updatedAt: 1761877649000,
    ...overrides,
  };
}

describe('TavernMarketHttpAdapter', () => {
  beforeEach(() => request.mockReset());

  it('lists one kind of item with the filter the page gave', async () => {
    request.mockResolvedValueOnce(ok({ items: [wireItem()], total: 1, page: 1, pageSize: 20 }));
    const r = await new TavernMarketHttpAdapter().items(
      { kind: 'character_card', creatorUid: 100004120, state: 'taken_down' },
      { p: 1, pageSize: 20 },
    );
    expect(request).toHaveBeenCalledWith('/tavern/api/admin/market/items', {
      query: { p: 1, pageSize: 20, kind: 'character_card', creatorUid: 100004120, state: 'taken_down' },
    });
    expect(r.success && r.data.items[0]?.price).toEqual({ amount: 9.9, currency: 'CNY' });
  });

  it('reads a character card on sale with its preset and description', async () => {
    request.mockResolvedValueOnce(
      ok({
        item: wireItem({ state: 'taken_down', takedown: { reason: '侵权', staffUid: 1, atUtc: 1761877649000 } }),
        onSale: {
          face: FACE,
          kind: 'character_card',
          character: { avatar: null, greetings: ['又是你。'] },
          preset: { systemPrompt: '你是沈惟行。', personality: '克制' },
          worldBook: [{ keys: ['雾港'] }],
          capabilities: { moments: false, mcpMemory: false, imageGen: false },
        },
      }),
    );
    const r = await new TavernMarketHttpAdapter().item(ITEM_ID);
    expect(request).toHaveBeenCalledWith(`/tavern/api/admin/market/items/${ITEM_ID}`);
    expect(r.success && r.data.item.takedown?.reason).toBe('侵权');
    expect(r.success && r.data.onSale.kind === 'character_card' && r.data.onSale.preset.systemPrompt).toBe('你是沈惟行。');
  });

  it('reads a world book on sale as a whole world template', async () => {
    const book = { kind: 'world_book', face: { ...FACE, name: '雾港 1931' }, summary: { narratives: 1, settings: 1, rules: 0, time: TIME } };
    request.mockResolvedValueOnce(
      ok({
        item: wireItem({ listing: book }),
        onSale: {
          face: book.face,
          world: {
            time: TIME,
            narratives: [{ name: '基调', content: '冷硬派。' }],
            worldBook: { nodes: [{ id: 'rain', type: 'lore', title: '雨', content: '一直在下' }] },
            // 创作者的世界没写过规则书：服务端原样给空对象。
            rulebook: {},
          },
          kind: 'world_book',
        },
      }),
    );
    const r = await new TavernMarketHttpAdapter().item(ITEM_ID);
    expect(r.success).toBe(true);
    if (!r.success || r.data.onSale.kind !== 'world_book') return;
    expect(r.data.item.listing.kind).toBe('world_book');
    expect(r.data.onSale.world.time.mode).toBe('turnbased');
    expect(r.data.onSale.world.rulebook.rules).toEqual([]);
    expect(r.data.onSale.world.worldBook.nodes[0]).toMatchObject({ type: 'lore', enabled: true, audience: 'all' });
  });

  it('takes an item down with a reason and gets the changed row back', async () => {
    request.mockResolvedValueOnce(ok(wireItem({ state: 'taken_down', takedown: { reason: '侵权', staffUid: 1, atUtc: 1 } })));
    const r = await new TavernMarketHttpAdapter().takeDown(ITEM_ID, '侵权');
    expect(request).toHaveBeenCalledWith(`/tavern/api/admin/market/items/${ITEM_ID}/takedown`, {
      method: 'POST',
      body: { reason: '侵权' },
    });
    expect(r.success && r.data.state).toBe('taken_down');
  });

  it('reads an order with the kind of item and one status for it', async () => {
    request.mockResolvedValueOnce(
      ok({
        items: [
          {
            id: '0193f5a0-0000-7000-8000-000000000001',
            serialNo: 'MO20261031000000002',
            source: 'purchase',
            item: { id: ITEM_ID, kind: 'world_book', name: '雾港 1931' },
            buyer: ACCOUNT,
            seller: ACCOUNT,
            price: { amount: 9.9, currency: 'CNY' },
            stage: 'settling',
            createdAt: 1761877649000,
            updatedAt: 1761877649000,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      }),
    );
    const r = await new TavernMarketHttpAdapter().orders({ buyerUid: 100004120, kind: 'world_book' }, { p: 1, pageSize: 20 });
    expect(request).toHaveBeenCalledWith('/tavern/api/admin/market/orders', {
      query: { p: 1, pageSize: 20, buyerUid: 100004120, kind: 'world_book' },
    });
    expect(r.success && r.data.items[0]?.serialNo).toBe('MO20261031000000002');
    expect(r.success && r.data.items[0]?.item.kind).toBe('world_book');
    expect(r.success && r.data.items[0]?.stage).toBe('settling');
  });

  it('reads an order detail with how its money is split', async () => {
    request.mockResolvedValueOnce(
      ok({
        order: {
          id: '0193f5a0-0000-7000-8000-000000000001',
          serialNo: 'MO20261031000000002',
          source: 'purchase',
          item: { id: ITEM_ID, kind: 'character_card', name: '沈惟行' },
          buyer: ACCOUNT,
          seller: ACCOUNT,
          price: { amount: 9.9, currency: 'CNY' },
          stage: 'completed',
          createdAt: 1761877649000,
          updatedAt: 1761877649000,
        },
        itemVersion: 2,
        billSerialNo: 'BL20261031000000007',
        failureReason: null,
        settlement: { commissionRate: 0.3, platformAmount: 2.97, sellerAmount: 6.93, settlesAt: 1762482449000, settledAt: 1762482449000 },
        sellerTxns: [],
      }),
    );
    const r = await new TavernMarketHttpAdapter().order('0193f5a0-0000-7000-8000-000000000001');
    expect(request).toHaveBeenCalledWith('/tavern/api/admin/market/orders/0193f5a0-0000-7000-8000-000000000001');
    expect(r.success && r.data.settlement?.platformAmount).toBe(2.97);
    expect(r.success && r.data.billSerialNo).toBe('BL20261031000000007');
  });

  it('reviews a withdrawal and reads it back with its reason', async () => {
    request.mockResolvedValueOnce(
      ok({
        id: '0193f5a0-0000-7000-8000-0000000000aa',
        serialNo: 'MW20261031000000001',
        account: ACCOUNT,
        amount: 3,
        payout: { method: 'alipay', accountNo: 'asako@example.com', accountName: '麻子' },
        status: 'rejected',
        reason: '收款人对不上',
        steps: [{ action: 'reject', staffUid: 1, atUtc: 1761877649000, reason: '收款人对不上' }],
        appliedAt: 1761877649000,
        updatedAt: 1761877649000,
      }),
    );
    const r = await new TavernMarketHttpAdapter().rejectWithdrawal('0193f5a0-0000-7000-8000-0000000000aa', '收款人对不上');
    expect(request).toHaveBeenCalledWith('/tavern/api/admin/market/withdrawals/0193f5a0-0000-7000-8000-0000000000aa/reject', {
      method: 'POST',
      body: { reason: '收款人对不上' },
    });
    expect(r.success && r.data.status).toBe('rejected');
    expect(r.success && r.data.payout.method).toBe('alipay');
  });

  it('narrows reviews to one buyer and one sentiment', async () => {
    request.mockResolvedValueOnce(ok({ items: [], total: 0, page: 1, pageSize: 20 }));
    await new TavernMarketHttpAdapter().reviews(ITEM_ID, { accountUid: 100004120, sentiment: 'bad' }, { p: 1, pageSize: 20 });
    expect(request).toHaveBeenCalledWith(`/tavern/api/admin/market/items/${ITEM_ID}/reviews`, {
      query: { p: 1, pageSize: 20, accountUid: 100004120, sentiment: 'bad' },
    });
  });

  it('reads a seller ledger line with the balance after it', async () => {
    request.mockResolvedValueOnce(
      ok({
        items: [
          {
            id: 7,
            kind: 'withdraw_returned',
            amount: 1.2,
            balanceAfter: { pending: 20.86, available: 1.4, withdrawing: 0, withdrawn: 3 },
            source: { kind: 'withdrawal', ref: 'MW20261011000000001' },
            note: '收款人对不上',
            createdAt: 1761877649000,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      }),
    );
    const r = await new TavernMarketHttpAdapter().sellerTxns(100004120, { p: 1, pageSize: 20 });
    expect(request).toHaveBeenCalledWith('/tavern/api/admin/market/sellers/100004120/txns', { query: { p: 1, pageSize: 20 } });
    expect(r.success && r.data.items[0]?.balanceAfter.available).toBe(1.4);
  });
});
