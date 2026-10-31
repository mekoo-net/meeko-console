import type { ItemsEnvelope } from '@/features/tavern/api/http';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { delay } from '@/shared/lib/delay';

import type { AccountRef, PageQuery } from '../../model/content.types';
import type {
  CardFace,
  CardVersionContent,
  MarketCardDetail,
  MarketCardQuery,
  MarketCardRow,
  MarketCardState,
  MarketOrderQuery,
  MarketOrderRow,
  MarketSettings,
  MarketSettingsView,
} from '../../model/market.types';
import type { TavernMarketPort } from '../ports/tavernMarketPort';
import { mockUuid } from './tavernContentMock';
import { ASAKO, LINXIA, PLAYER_0123 } from './tavernMockAccounts';
import { pageOf } from './tavernMeteringMockData';

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const NOW = Date.now();
const STAFF_UID = 1;

interface MockCard {
  id: string;
  creator: AccountRef;
  state: MarketCardState;
  price: number;
  /** 在卖的那一版。 */
  onSale: CardVersionContent;
  publishedAt: number;
  purchases: number;
  ratings: number[];
  takedown: { reason: string; staffUid: number; atUtc: number } | null;
  updatedAt: number;
}

function face(name: string, tagline: string, tags: string[], greetings: string[]): CardFace {
  return { name, avatar: null, cover: null, tagline, description: null, tags, greetings };
}

function content(f: CardFace, systemPrompt: string): CardVersionContent {
  return {
    face: f,
    preset: { systemPrompt },
    worldBook: [],
    capabilities: { moments: false, mcpMemory: false, imageGen: false },
  };
}

const SHEN = face('沈惟行', '雾港警署的年轻督察，话少，记性好得吓人。', ['推理', '克制', '警察', '雾港'], ['“又是你。”']);
const SU = face('苏晚', '码头茶馆老板娘，消息比谁都灵通。', ['茶馆', '八卦', '温柔'], ['“来啦？”']);

/** 前两张与内容 mock 里林夏的市场联系人是同一张卡。 */
const cards: MockCard[] = [
  {
    id: mockUuid(801),
    creator: ASAKO,
    state: 'listed',
    price: 9.9,
    onSale: content(SHEN, '你是沈惟行，雾港警署督察。说话简短，对细节过目不忘。'),
    publishedAt: NOW - 50 * DAY,
    purchases: 128,
    ratings: [5, 5, 4, 5, 3],
    takedown: null,
    updatedAt: NOW - 3 * HOUR,
  },
  {
    id: mockUuid(802),
    creator: ASAKO,
    state: 'listed',
    price: 0,
    onSale: content(SU, '你是苏晚，苏记茶馆的老板娘。'),
    publishedAt: NOW - 40 * DAY,
    purchases: 451,
    ratings: [4, 5],
    takedown: null,
    updatedAt: NOW - 40 * DAY,
  },
  {
    id: mockUuid(803),
    creator: PLAYER_0123,
    state: 'taken_down',
    price: 3,
    onSale: content(face('某明星', '……', ['真人'], []), '你是某明星本人。'),
    publishedAt: NOW - 9 * DAY,
    purchases: 4,
    ratings: [],
    takedown: { reason: '冒充真人，侵犯肖像权。', staffUid: STAFF_UID, atUtc: NOW - 6 * DAY },
    updatedAt: NOW - 6 * DAY,
  },
];

interface MockOrder {
  id: string;
  source: MarketOrderRow['source'];
  cardId: string;
  buyer: AccountRef;
  price: number;
  status: MarketOrderRow['status'];
  failureReason: string | null;
  at: number;
}

const orders: MockOrder[] = [
  { id: mockUuid(901), source: 'creator', cardId: mockUuid(801), buyer: ASAKO, price: 0, status: 'active', failureReason: null, at: NOW - 50 * DAY },
  { id: mockUuid(902), source: 'purchase', cardId: mockUuid(801), buyer: LINXIA, price: 6, status: 'active', failureReason: null, at: NOW - 42 * DAY },
  { id: mockUuid(903), source: 'creator', cardId: mockUuid(802), buyer: ASAKO, price: 0, status: 'active', failureReason: null, at: NOW - 40 * DAY },
  { id: mockUuid(904), source: 'purchase', cardId: mockUuid(802), buyer: LINXIA, price: 0, status: 'active', failureReason: null, at: NOW - 40 * DAY },
  { id: mockUuid(905), source: 'purchase', cardId: mockUuid(803), buyer: LINXIA, price: 3, status: 'failed', failureReason: '钱包余额不足，请先充值。', at: NOW - 8 * DAY },
  { id: mockUuid(906), source: 'purchase', cardId: mockUuid(801), buyer: PLAYER_0123, price: 9.9, status: 'active', failureReason: null, at: NOW - 1 * DAY },
];

let settings: MarketSettingsView = { settings: { commissionRate: 0.3, creditsPerYuan: 100 }, updatedAt: null };

function row(c: MockCard): MarketCardRow {
  return {
    cardId: c.id,
    creator: c.creator,
    face: c.onSale.face,
    price: { amount: c.price, currency: 'CNY' },
    stats: {
      purchases: c.purchases,
      rating: c.ratings.length ? Math.round((c.ratings.reduce((a, b) => a + b, 0) / c.ratings.length) * 10) / 10 : 0,
      ratingCount: c.ratings.length,
    },
    state: c.state,
    takedown: c.takedown,
    publishedAt: c.publishedAt,
    updatedAt: c.updatedAt,
  };
}

function orderRow(o: MockOrder): MarketOrderRow {
  const card = cards.find((c) => c.id === o.cardId)!;
  const sellerCredits = Math.round(o.price * (1 - settings.settings.commissionRate) * settings.settings.creditsPerYuan * 100) / 100;
  return {
    id: o.id,
    source: o.source,
    card: { id: card.id, name: row(card).face.name },
    buyer: o.buyer,
    seller: card.creator,
    price: { amount: o.price, currency: 'CNY' },
    status: o.status,
    settlement: o.status === 'active' && o.source === 'purchase' ? { ...settings.settings, sellerCredits } : null,
    failureReason: o.failureReason,
    createdAt: o.at,
    updatedAt: o.at,
  };
}

const notFound = () => fail({ code: 'not_found', message: '卡不存在。' });

export class TavernMarketMock implements TavernMarketPort {
  async cards(query: MarketCardQuery, page: PageQuery): Promise<AppResult<ItemsEnvelope<MarketCardRow>>> {
    await delay();
    const keyword = query.keyword?.trim().toLowerCase();
    const rows = cards
      .map(row)
      .filter((r) => query.creatorUid == null || r.creator.uid === query.creatorUid)
      .filter((r) => query.state == null || r.state === query.state)
      .filter((r) => !keyword || r.face.name.toLowerCase().includes(keyword) || r.face.tags.some((t) => t.includes(keyword)))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    return ok(pageOf(rows, page.p, page.pageSize));
  }

  async card(cardId: string): Promise<AppResult<MarketCardDetail>> {
    await delay();
    const c = cards.find((x) => x.id === cardId);
    if (!c) return notFound();
    return ok({
      card: row(c),
      onSale: c.onSale,
      reviews: c.ratings.map((rating, i) => ({
        id: i + 1,
        account: i % 2 ? PLAYER_0123 : LINXIA,
        rating,
        content: rating >= 4 ? '人设很稳，推理戏好看。' : null,
        updatedAt: NOW - (i + 1) * DAY,
      })),
    });
  }

  async takeDown(cardId: string, reason: string): Promise<AppResult<MarketCardRow>> {
    await delay();
    const c = cards.find((x) => x.id === cardId);
    if (!c) return notFound();
    if (c.state !== 'listed') return fail({ code: 'conflict', message: '这张卡没有在售。' });
    c.state = 'taken_down';
    c.takedown = { reason, staffUid: STAFF_UID, atUtc: Date.now() };
    c.updatedAt = Date.now();
    return ok(row(c));
  }

  async restore(cardId: string): Promise<AppResult<MarketCardRow>> {
    await delay();
    const c = cards.find((x) => x.id === cardId);
    if (!c) return notFound();
    if (c.state !== 'taken_down') return fail({ code: 'conflict', message: '这张卡没有被下架。' });
    c.state = 'listed';
    c.takedown = null;
    c.updatedAt = Date.now();
    return ok(row(c));
  }

  async orders(query: MarketOrderQuery, page: PageQuery): Promise<AppResult<ItemsEnvelope<MarketOrderRow>>> {
    await delay();
    const rows = orders
      .map(orderRow)
      .filter((o) => query.cardId == null || o.card.id === query.cardId)
      .filter((o) => query.buyerUid == null || o.buyer.uid === query.buyerUid)
      .filter((o) => query.sellerUid == null || o.seller.uid === query.sellerUid)
      .filter((o) => query.source == null || o.source === query.source)
      .sort((a, b) => b.createdAt - a.createdAt);
    return ok(pageOf(rows, page.p, page.pageSize));
  }

  async settings(): Promise<AppResult<MarketSettingsView>> {
    await delay();
    return ok(settings);
  }

  async saveSettings(next: MarketSettings): Promise<AppResult<MarketSettingsView>> {
    await delay();
    if (next.commissionRate < 0 || next.commissionRate > 1) return fail({ code: 'validation', message: '平台抽成在 0 到 100% 之间。' });
    if (next.creditsPerYuan <= 0) return fail({ code: 'validation', message: '每元换算的积分要大于 0。' });
    settings = { settings: next, updatedAt: Date.now() };
    return ok(settings);
  }
}
