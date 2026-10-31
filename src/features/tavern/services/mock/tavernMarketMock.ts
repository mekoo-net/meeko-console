import type { ItemsEnvelope } from '@/features/tavern/api/http';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { delay } from '@/shared/lib/delay';

import type { AccountRef, PageQuery } from '../../model/content.types';
import {
  marketItemContentSchema,
  type ItemFace,
  type MarketItemContent,
  type MarketItemDetail,
  type MarketItemQuery,
  type MarketItemRow,
  type MarketItemState,
  type MarketListing,
  type MarketOrderQuery,
  type MarketOrderRow,
  type MarketReview,
  type MarketSettings,
  type MarketSettingsView,
} from '../../model/market.types';
import type { TavernMarketPort } from '../ports/tavernMarketPort';
import { mockUuid } from './tavernContentMock';
import { ASAKO, LINXIA, PLAYER_0123 } from './tavernMockAccounts';
import { pageOf } from './tavernMeteringMockData';

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const NOW = Date.now();
const STAFF_UID = 1;

interface MockItem {
  id: string;
  creator: AccountRef;
  state: MarketItemState;
  price: number;
  /** 在卖的那一版。 */
  onSale: MarketItemContent;
  publishedAt: number;
  purchases: number;
  ratings: number[];
  takedown: { reason: string; staffUid: number; atUtc: number } | null;
  updatedAt: number;
}

function face(name: string, tagline: string, tags: string[]): ItemFace {
  return { name, cover: null, tagline, description: null, tags };
}

function card(f: ItemFace, greetings: string[], systemPrompt: string): MarketItemContent {
  return {
    kind: 'character_card',
    face: f,
    character: { avatar: null, greetings },
    preset: { systemPrompt },
    worldBook: [],
    capabilities: { moments: false, mcpMemory: false, imageGen: false },
  };
}

/** 世界书按服务端的样子写，再过一遍 schema 补齐节点、规则的默认值。 */
const FOG_HARBOR = marketItemContentSchema.parse({
  kind: 'world_book',
  face: {
    ...face('雾港 1931', '一座永远在下雨的港口城市，旧警署、码头帮派和失踪的货船。', ['悬疑', '民国', '黑色电影']),
    description: '从雾港警署的一个雨夜开始。适合推理、潜入和多方周旋。',
  },
  world: {
    narratives: [
      { name: '基调', content: '冷硬派侦探小说的笔调。少形容词，多动作和对白；雨和雾是常驻的背景。' },
      { name: '时代与地点', content: '1931 年深秋的雾港：租界、华界和码头三块地盘，各有各的规矩。' },
    ],
    worldBook: {
      nodes: [
        { id: 'geo', type: 'group', title: '地理' },
        { id: 'harbor', type: 'lore', parent: 'geo', title: '雾港', content: '港口城市，常年起雾，入夜后码头只认帮派的灯号。', activation: { mode: 'always' } },
        {
          id: 'old-station',
          type: 'lore',
          parent: 'geo',
          title: '旧警署',
          content: '三层灰楼，地下室有一间不在图纸上的档案室。',
          activation: { mode: 'keyword', keywords: ['警署', '档案室'] },
        },
        { id: 'powers', type: 'group', title: '势力' },
        {
          id: 'qingbang',
          type: 'lore',
          parent: 'powers',
          title: '青帮',
          content: '控制码头装卸。老大姓杜，从不在白天露面。',
          activation: { mode: 'keyword', keywords: ['青帮', '码头', '杜'] },
        },
        {
          id: 'culprit',
          type: 'lore',
          title: '货船失踪的真相',
          content: '货船没有沉，被改了船名停在三号船坞。',
          audience: 'director',
          when: 'world.chapter >= 2',
        },
      ],
    },
    rulebook: {
      variables: [
        { key: 'chapter', scope: 'world', type: 'int', label: '章节', min: 1, max: 5, default: 1 },
        { key: 'trust', scope: 'character', type: 'int', label: '信任', min: 0, max: 100, default: 50, actorAdjust: 10 },
      ],
      rules: [
        {
          id: 'midnight_bell',
          title: '午夜钟声',
          on: { clock: '00:00' },
          do: [{ narrate: '远处的海关大楼敲了十二下。' }],
        },
      ],
    },
    time: { mode: 'turnbased', ratio: 1, turnMinutes: 30, storyStart: '1931-11-02T21:00:00' },
  },
});

const ARK = marketItemContentSchema.parse({
  kind: 'world_book',
  face: face('方舟', '海平面上升后的最后一座浮城，配给、轮值和一台不该醒来的主机。', ['末日', '科幻', '生存']),
  world: {
    narratives: [{ name: '方舟', content: '你是方舟的新任轮值官。资源永远不够，每个决定都有人付出代价。' }],
    worldBook: {
      nodes: [{ id: 'ration', type: 'lore', title: '配给制', content: '每人每天两张餐票，黑市一张换一节电池。', activation: { mode: 'always' } }],
    },
    rulebook: {},
    time: { mode: 'realtime', ratio: 24, turnMinutes: 10, storyStart: null },
  },
});

const SHEN = face('沈惟行', '雾港警署的年轻督察，话少，记性好得吓人。', ['推理', '克制', '警察', '雾港']);
const SU = face('苏晚', '码头茶馆老板娘，消息比谁都灵通。', ['茶馆', '八卦', '温柔']);

/** 前两张角色卡与内容 mock 里林夏的市场联系人是同一张。 */
const items: MockItem[] = [
  {
    id: mockUuid(801),
    creator: ASAKO,
    state: 'listed',
    price: 9.9,
    onSale: card(SHEN, ['“又是你。”'], '你是沈惟行，雾港警署督察。说话简短，对细节过目不忘。'),
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
    onSale: card(SU, ['“来啦？”'], '你是苏晚，苏记茶馆的老板娘。'),
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
    onSale: card(face('某明星', '……', ['真人']), [], '你是某明星本人。'),
    publishedAt: NOW - 9 * DAY,
    purchases: 4,
    ratings: [],
    takedown: { reason: '冒充真人，侵犯肖像权。', staffUid: STAFF_UID, atUtc: NOW - 6 * DAY },
    updatedAt: NOW - 6 * DAY,
  },
  {
    id: mockUuid(811),
    creator: ASAKO,
    state: 'listed',
    price: 19.9,
    onSale: FOG_HARBOR,
    publishedAt: NOW - 30 * DAY,
    purchases: 57,
    ratings: [5, 4, 5],
    takedown: null,
    updatedAt: NOW - 2 * DAY,
  },
  {
    id: mockUuid(812),
    creator: LINXIA,
    state: 'listed',
    price: 0,
    onSale: ARK,
    publishedAt: NOW - 12 * DAY,
    purchases: 203,
    ratings: [4],
    takedown: null,
    updatedAt: NOW - 12 * DAY,
  },
];

interface MockOrder {
  id: string;
  source: MarketOrderRow['source'];
  itemId: string;
  buyer: AccountRef;
  price: number;
  status: MarketOrderRow['status'];
  failureReason: string | null;
  at: number;
}

const orders: MockOrder[] = [
  { id: mockUuid(901), source: 'creator', itemId: mockUuid(801), buyer: ASAKO, price: 0, status: 'active', failureReason: null, at: NOW - 50 * DAY },
  { id: mockUuid(902), source: 'purchase', itemId: mockUuid(801), buyer: LINXIA, price: 6, status: 'active', failureReason: null, at: NOW - 42 * DAY },
  { id: mockUuid(903), source: 'creator', itemId: mockUuid(802), buyer: ASAKO, price: 0, status: 'active', failureReason: null, at: NOW - 40 * DAY },
  { id: mockUuid(904), source: 'purchase', itemId: mockUuid(802), buyer: LINXIA, price: 0, status: 'active', failureReason: null, at: NOW - 40 * DAY },
  { id: mockUuid(905), source: 'purchase', itemId: mockUuid(803), buyer: LINXIA, price: 3, status: 'failed', failureReason: '钱包余额不足，请先充值。', at: NOW - 8 * DAY },
  { id: mockUuid(906), source: 'purchase', itemId: mockUuid(801), buyer: PLAYER_0123, price: 9.9, status: 'active', failureReason: null, at: NOW - 1 * DAY },
  { id: mockUuid(907), source: 'creator', itemId: mockUuid(811), buyer: ASAKO, price: 0, status: 'active', failureReason: null, at: NOW - 30 * DAY },
  { id: mockUuid(908), source: 'purchase', itemId: mockUuid(811), buyer: LINXIA, price: 19.9, status: 'active', failureReason: null, at: NOW - 3 * DAY },
  { id: mockUuid(909), source: 'creator', itemId: mockUuid(812), buyer: LINXIA, price: 0, status: 'active', failureReason: null, at: NOW - 12 * DAY },
  { id: mockUuid(910), source: 'purchase', itemId: mockUuid(812), buyer: PLAYER_0123, price: 0, status: 'active', failureReason: null, at: NOW - 5 * HOUR },
];

let settings: MarketSettingsView = { settings: { commissionRate: 0.3, creditsPerYuan: 100 }, updatedAt: null };

/** 同服务端的 `ToListing()`：角色卡露头像开场白和能力，世界书露规模和时间。 */
function listingOf(c: MarketItemContent): MarketListing {
  if (c.kind === 'character_card') return { kind: c.kind, face: c.face, character: c.character, capabilities: c.capabilities };
  return {
    kind: c.kind,
    face: c.face,
    summary: {
      narratives: c.world.narratives.length,
      settings: c.world.worldBook.nodes.filter((n) => n.type === 'lore').length,
      rules: c.world.rulebook.rules.length,
      time: c.world.time,
    },
  };
}

function row(i: MockItem): MarketItemRow {
  return {
    itemId: i.id,
    creator: i.creator,
    listing: listingOf(i.onSale),
    price: { amount: i.price, currency: 'CNY' },
    stats: {
      purchases: i.purchases,
      rating: i.ratings.length ? Math.round((i.ratings.reduce((a, b) => a + b, 0) / i.ratings.length) * 10) / 10 : 0,
      ratingCount: i.ratings.length,
    },
    state: i.state,
    takedown: i.takedown,
    publishedAt: i.publishedAt,
    updatedAt: i.updatedAt,
  };
}

/** 同服务端的 SerialNumbers：MO + 下单那天（UTC）+ 当天第几单，9 位。 */
const serialNos = new Map<string, string>();
{
  const perDay = new Map<string, number>();
  for (const o of [...orders].sort((a, b) => a.at - b.at)) {
    const day = new Date(o.at).toISOString().slice(0, 10).replaceAll('-', '');
    const n = (perDay.get(day) ?? 0) + 1;
    perDay.set(day, n);
    serialNos.set(o.id, `MO${day}${String(n).padStart(9, '0')}`);
  }
}

function orderRow(o: MockOrder): MarketOrderRow {
  const item = items.find((i) => i.id === o.itemId)!;
  const sellerCredits = Math.round(o.price * (1 - settings.settings.commissionRate) * settings.settings.creditsPerYuan * 100) / 100;
  return {
    id: o.id,
    serialNo: serialNos.get(o.id)!,
    source: o.source,
    item: { id: item.id, kind: item.onSale.kind, name: item.onSale.face.name },
    buyer: o.buyer,
    seller: item.creator,
    price: { amount: o.price, currency: 'CNY' },
    status: o.status,
    settlement: o.status === 'active' && o.source === 'purchase' ? { ...settings.settings, sellerCredits } : null,
    failureReason: o.failureReason,
    createdAt: o.at,
    updatedAt: o.at,
  };
}

/** 同服务端的说法：角色卡论张，世界书论本。 */
const thisOne = (i: MockItem) => (i.onSale.kind === 'world_book' ? '这本世界书' : '这张角色卡');

const notFound = () => fail({ code: 'not_found', message: '商品不存在。' });

export class TavernMarketMock implements TavernMarketPort {
  async items(query: MarketItemQuery, page: PageQuery): Promise<AppResult<ItemsEnvelope<MarketItemRow>>> {
    await delay();
    const keyword = query.keyword?.trim().toLowerCase();
    const rows = items
      .map(row)
      .filter((r) => query.kind == null || r.listing.kind === query.kind)
      .filter((r) => query.creatorUid == null || r.creator.uid === query.creatorUid)
      .filter((r) => query.state == null || r.state === query.state)
      .filter((r) => query.fromUtc == null || (r.publishedAt ?? 0) >= query.fromUtc)
      .filter((r) => query.toUtc == null || (r.publishedAt ?? 0) <= query.toUtc)
      .filter(
        (r) => !keyword || r.listing.face.name.toLowerCase().includes(keyword) || r.listing.face.tags.some((t) => t.includes(keyword)),
      )
      .sort((a, b) => b.updatedAt - a.updatedAt);
    return ok(pageOf(rows, page.p, page.pageSize));
  }

  async item(itemId: string): Promise<AppResult<MarketItemDetail>> {
    await delay();
    const i = items.find((x) => x.id === itemId);
    if (!i) return notFound();
    return ok({ item: row(i), onSale: i.onSale });
  }

  async reviews(itemId: string, page: PageQuery): Promise<AppResult<ItemsEnvelope<MarketReview>>> {
    await delay();
    const i = items.find((x) => x.id === itemId);
    if (!i) return notFound();
    const praise = i.onSale.kind === 'world_book' ? '设定扎实，开局就有戏。' : '人设很稳，推理戏好看。';
    const rows: MarketReview[] = i.ratings.map((rating, n) => ({
      id: n + 1,
      account: n % 2 ? PLAYER_0123 : LINXIA,
      rating,
      content: rating >= 4 ? praise : null,
      updatedAt: NOW - (n + 1) * DAY,
    }));
    return ok(pageOf(rows, page.p, page.pageSize));
  }

  async takeDown(itemId: string, reason: string): Promise<AppResult<MarketItemRow>> {
    await delay();
    const i = items.find((x) => x.id === itemId);
    if (!i) return notFound();
    if (i.state !== 'listed') return fail({ code: 'conflict', message: `${thisOne(i)}没有在售。` });
    i.state = 'taken_down';
    i.takedown = { reason, staffUid: STAFF_UID, atUtc: Date.now() };
    i.updatedAt = Date.now();
    return ok(row(i));
  }

  async restore(itemId: string): Promise<AppResult<MarketItemRow>> {
    await delay();
    const i = items.find((x) => x.id === itemId);
    if (!i) return notFound();
    if (i.state !== 'taken_down') return fail({ code: 'conflict', message: `${thisOne(i)}没有被下架。` });
    i.state = 'listed';
    i.takedown = null;
    i.updatedAt = Date.now();
    return ok(row(i));
  }

  async orders(query: MarketOrderQuery, page: PageQuery): Promise<AppResult<ItemsEnvelope<MarketOrderRow>>> {
    await delay();
    const rows = orders
      .map(orderRow)
      .filter((o) => query.serialNo == null || o.serialNo === query.serialNo)
      .filter((o) => query.itemId == null || o.item.id === query.itemId)
      .filter((o) => query.kind == null || o.item.kind === query.kind)
      .filter((o) => query.buyerUid == null || o.buyer.uid === query.buyerUid)
      .filter((o) => query.sellerUid == null || o.seller.uid === query.sellerUid)
      .filter((o) => query.source == null || o.source === query.source)
      .filter((o) => query.fromUtc == null || o.createdAt >= query.fromUtc)
      .filter((o) => query.toUtc == null || o.createdAt <= query.toUtc)
      .sort((a, b) => b.serialNo.localeCompare(a.serialNo));
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
