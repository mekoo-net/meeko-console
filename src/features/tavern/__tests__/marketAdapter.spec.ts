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

/** 钉住市场管理接口「后端真发什么」：snake_case 枚举、epoch 毫秒、价格带币种、在卖的内容原样嵌着、不带版本。 */
const CARD_ID = '0193f5a0-7c1e-7d2a-9b3c-4e5f60718293';
const ACCOUNT = { uid: 100004120, displayName: '麻子', email: 'asako@example.com', phone: null };
const FACE = { name: '沈惟行', avatar: null, cover: null, tagline: '督察', description: null, tags: ['推理'], greetings: [] };

function wireCard(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    cardId: CARD_ID,
    creator: ACCOUNT,
    face: FACE,
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

  it('lists cards with the filter the page gave', async () => {
    request.mockResolvedValueOnce(ok({ items: [wireCard()], total: 1, page: 1, pageSize: 20 }));
    const r = await new TavernMarketHttpAdapter().cards({ creatorUid: 100004120, state: 'listed' }, { p: 1, pageSize: 20 });
    expect(request).toHaveBeenCalledWith('/tavern/api/admin/market/cards', {
      query: { p: 1, pageSize: 20, creatorUid: 100004120, state: 'listed' },
    });
    expect(r.success && r.data.items[0]?.price).toEqual({ amount: 9.9, currency: 'CNY' });
  });

  it('reads what is on sale with its preset and world book', async () => {
    request.mockResolvedValueOnce(
      ok({
        card: wireCard({ state: 'taken_down', takedown: { reason: '侵权', staffUid: 1, atUtc: 1761877649000 } }),
        onSale: {
          face: FACE,
          preset: { systemPrompt: '你是沈惟行。', personality: '克制' },
          worldBook: [{ keys: ['雾港'] }],
          capabilities: { moments: false, mcpMemory: false, imageGen: false },
        },
        reviews: [],
      }),
    );
    const r = await new TavernMarketHttpAdapter().card(CARD_ID);
    expect(request).toHaveBeenCalledWith(`/tavern/api/admin/market/cards/${CARD_ID}`);
    expect(r.success && r.data.card.takedown?.reason).toBe('侵权');
    expect(r.success && r.data.onSale.preset.systemPrompt).toBe('你是沈惟行。');
  });

  it('takes a card down with a reason and gets the changed row back', async () => {
    request.mockResolvedValueOnce(ok(wireCard({ state: 'taken_down', takedown: { reason: '侵权', staffUid: 1, atUtc: 1 } })));
    const r = await new TavernMarketHttpAdapter().takeDown(CARD_ID, '侵权');
    expect(request).toHaveBeenCalledWith(`/tavern/api/admin/market/cards/${CARD_ID}/takedown`, {
      method: 'POST',
      body: { reason: '侵权' },
    });
    expect(r.success && r.data.state).toBe('taken_down');
  });

  it('reads an order with the seller share it settled at', async () => {
    request.mockResolvedValueOnce(
      ok({
        items: [
          {
            id: '0193f5a0-0000-7000-8000-000000000001',
            source: 'purchase',
            card: { id: CARD_ID, name: '沈惟行' },
            buyer: ACCOUNT,
            seller: ACCOUNT,
            price: { amount: 9.9, currency: 'CNY' },
            status: 'active',
            settlement: { commissionRate: 0.3, creditsPerYuan: 100, sellerCredits: 693 },
            failureReason: null,
            createdAt: 1761877649000,
            updatedAt: 1761877649000,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      }),
    );
    const r = await new TavernMarketHttpAdapter().orders({ buyerUid: 100004120 }, { p: 1, pageSize: 20 });
    expect(r.success && r.data.items[0]?.settlement?.sellerCredits).toBe(693);
  });
});
