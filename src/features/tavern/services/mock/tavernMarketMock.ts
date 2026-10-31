import type { ItemsEnvelope } from '@/features/tavern/api/http';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { delay } from '@/shared/lib/delay';

import type { AccountRef, PageQuery } from '../../model/content.types';
import {
  marketItemContentSchema,
  type InventoryQuery,
  type InventoryRow,
  type ItemFace,
  type MarketItemContent,
  type MarketItemDetail,
  type MarketItemQuery,
  type MarketItemRow,
  type MarketItemState,
  type MarketListing,
  type MarketOrderDetail,
  type MarketOrderQuery,
  type MarketOrderRow,
  type MarketOrderStage,
  type OrderSettlement,
  type MarketReview,
  type MarketReviewQuery,
  type MarketSettings,
  type ReviewSentiment,
  type ReviewSummary,
  type MarketSettingsView,
  type SellerBalance,
  type SellerEarnings,
  type SellerTxn,
  type SellerTxnKind,
  type WithdrawalQuery,
  type WithdrawalRow,
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
    ratings: [5, 5, 4, 5, 3, 2, 5, 1],
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
    ratings: [5, 4, 5, 3, 2],
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
  /** 买家权益那一层（服务端的 MarketOrderStatus）；列表上的状态由它和结算合出来。 */
  status: 'pending' | 'charged' | 'active' | 'failed';
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

let settings: MarketSettingsView = { settings: { commissionRate: 0.3, settlementDays: 7 }, updatedAt: null };

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

const cents = (n: number) => Math.round(n * 100) / 100;

/** 同服务端的 MarketSettings.Settle：卖家所得抹到分。 */
const sellerAmountOf = (price: number) => Math.floor(price * (1 - settings.settings.commissionRate) * 100 + 1e-6) / 100;

/** 同服务端：买来的单生效时记下卖家所得；有钱可分的冻结期满转可提现，免费的没有结算时间。 */
function settlementOf(o: MockOrder): OrderSettlement | null {
  if (o.status !== 'active' || o.source !== 'purchase') return null;
  const sellerAmount = sellerAmountOf(o.price);
  const settlesAt = sellerAmount > 0 ? o.at + settings.settings.settlementDays * DAY : null;
  return {
    commissionRate: settings.settings.commissionRate,
    platformAmount: cents(o.price - sellerAmount),
    sellerAmount,
    settlesAt,
    settledAt: settlesAt != null && settlesAt <= NOW ? settlesAt : null,
  };
}

/** 同服务端 MarketOrder.Stage。 */
function stageOf(o: MockOrder): MarketOrderStage {
  if (o.status !== 'active') return o.status;
  const st = settlementOf(o);
  return st?.settlesAt != null && st.settledAt == null ? 'settling' : 'completed';
}

function orderRow(o: MockOrder): MarketOrderRow {
  const item = items.find((i) => i.id === o.itemId)!;
  return {
    id: o.id,
    serialNo: serialNos.get(o.id)!,
    source: o.source,
    item: { id: item.id, kind: item.onSale.kind, name: item.onSale.face.name },
    buyer: o.buyer,
    seller: item.creator,
    price: { amount: o.price, currency: 'CNY' },
    stage: stageOf(o),
    createdAt: o.at,
    updatedAt: o.at,
  };
}

// ---------- 卖家收益（人民币） ----------

interface MockSeller {
  balance: SellerBalance;
  txns: SellerTxn[];
}

const sellers = new Map<number, MockSeller>();
let txnSeq = 0;

function sellerOf(uid: number): MockSeller {
  let s = sellers.get(uid);
  if (!s) {
    s = { balance: { pending: 0, available: 0, withdrawing: 0, withdrawn: 0 }, txns: [] };
    sellers.set(uid, s);
  }
  return s;
}

/** 同服务端 SellerPosting：每种动作从哪格挪到哪格。 */
const MOVES: Readonly<Record<SellerTxnKind, [keyof SellerBalance | null, keyof SellerBalance]>> = {
  sale: [null, 'pending'],
  settle: ['pending', 'available'],
  withdraw: ['available', 'withdrawing'],
  withdraw_returned: ['withdrawing', 'available'],
  withdraw_paid: ['withdrawing', 'withdrawn'],
};

function post(uid: number, kind: SellerTxnKind, amount: number, source: SellerTxn['source'], note: string | null, at: number): void {
  const s = sellerOf(uid);
  const [from, to] = MOVES[kind];
  if (from) s.balance[from] = cents(s.balance[from] - amount);
  s.balance[to] = cents(s.balance[to] + amount);
  s.txns.push({ id: ++txnSeq, kind, amount, balanceAfter: { ...s.balance }, source, note, createdAt: at });
}

const withdrawals: WithdrawalRow[] = [];

function withdrawalSerial(at: number, n: number): string {
  return `MW${new Date(at).toISOString().slice(0, 10).replaceAll('-', '')}${String(n).padStart(9, '0')}`;
}

{
  // 卖出与结算从订单来；提现照「一笔已打款、一笔被驳回、一笔待审核」排一段历史。
  type Ev = { at: number; run: () => void };
  const events: Ev[] = [];
  for (const o of orders) {
    const st = settlementOf(o);
    if (!st || st.sellerAmount <= 0) continue;
    const item = items.find((i) => i.id === o.itemId)!;
    const serial = serialNos.get(o.id)!;
    events.push({ at: o.at, run: () => post(item.creator.uid, 'sale', st.sellerAmount, { kind: 'order', ref: serial }, item.onSale.face.name, o.at) });
    if (st.settledAt != null) {
      const at = st.settledAt;
      events.push({ at, run: () => post(item.creator.uid, 'settle', st.sellerAmount, { kind: 'order', ref: serial }, null, at) });
    }
  }
  const asako = ASAKO.uid;
  const apply = (at: number, n: number, amount: number, method: 'alipay' | 'bank', accountNo: string) => {
    const w: WithdrawalRow = {
      id: mockUuid(950 + n),
      serialNo: withdrawalSerial(at, 1),
      account: ASAKO,
      amount,
      payout: { method, accountNo, accountName: '麻子' },
      status: 'pending',
      reason: null,
      appliedAt: at,
      updatedAt: at,
    };
    events.push({ at, run: () => { withdrawals.push(w); post(asako, 'withdraw', amount, { kind: 'withdrawal', ref: w.serialNo }, null, at); } });
    return w;
  };
  const paid = apply(NOW - 30 * DAY, 1, 3, 'alipay', 'asako@example.com');
  events.push({ at: NOW - 29 * DAY, run: () => {
    paid.status = 'paid';
    paid.updatedAt = NOW - 29 * DAY;
    post(asako, 'withdraw_paid', 3, { kind: 'withdrawal', ref: paid.serialNo }, null, NOW - 29 * DAY);
  } });
  const rejected = apply(NOW - 20 * DAY, 2, 1.2, 'bank', '6222 0000 1234 5678');
  events.push({ at: NOW - 19 * DAY, run: () => {
    rejected.status = 'rejected';
    rejected.reason = '收款人和实名信息对不上，请核对后重新申请。';
    rejected.updatedAt = NOW - 19 * DAY;
    post(asako, 'withdraw_returned', 1.2, { kind: 'withdrawal', ref: rejected.serialNo }, rejected.reason, NOW - 19 * DAY);
  } });
  apply(NOW - 10 * HOUR, 3, 1, 'alipay', 'asako@example.com');
  for (const e of events.sort((a, b) => a.at - b.at)) e.run();
}

const withdrawalNotFound = () => fail({ code: 'not_found', message: '提现单不存在。' });

/** 同服务端 MarketPayoutAdminService：状态不对就拒，钱照四格挪。 */
async function actOnWithdrawal(
  id: string,
  allowed: readonly WithdrawalRow['status'][],
  what: string,
  next: WithdrawalRow['status'],
  money: SellerTxnKind | null,
  reason?: string,
): Promise<AppResult<WithdrawalRow>> {
  await delay();
  const w = withdrawals.find((x) => x.id === id);
  if (!w) return withdrawalNotFound();
  if (!allowed.includes(w.status)) return fail({ code: 'conflict', message: `提现单状态已变更，无法${what}，请刷新后重试。` });
  w.status = next;
  w.reason = reason ?? null;
  w.updatedAt = Date.now();
  if (money) post(w.account.uid, money, w.amount, { kind: 'withdrawal', ref: w.serialNo }, reason ?? null, w.updatedAt);
  return ok({ ...w });
}

/** 同服务端的说法：角色卡论张，世界书论本。 */
const thisOne = (i: MockItem) => (i.onSale.kind === 'world_book' ? '这本世界书' : '这张角色卡');

const notFound = () => fail({ code: 'not_found', message: '商品不存在。' });

/** 同服务端：好评 4–5 星、中评 3 星、差评 1–2 星。 */
const sentimentOf = (rating: number): ReviewSentiment => (rating >= 4 ? 'good' : rating === 3 ? 'neutral' : 'bad');

const REVIEW_TEXT: Readonly<Record<'character_card' | 'world_book', Record<ReviewSentiment, string | null>>> = {
  character_card: { good: '人设很稳，推理戏好看。', neutral: '还行，开场有点慢。', bad: '人设崩了，说话一点不像督察。' },
  world_book: { good: '设定扎实，开局就有戏。', neutral: null, bad: '规则太多，开出来的世界跑不动。' },
};

/** 每条评价轮流算在林夏、0123 名下，新的在前。 */
function reviewsOf(i: MockItem): MarketReview[] {
  return i.ratings.map((rating, n) => ({
    id: n + 1,
    account: n % 2 ? PLAYER_0123 : LINXIA,
    rating,
    content: REVIEW_TEXT[i.onSale.kind][sentimentOf(rating)],
    updatedAt: NOW - (n + 1) * DAY,
  }));
}

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

  async reviews(itemId: string, query: MarketReviewQuery, page: PageQuery): Promise<AppResult<ItemsEnvelope<MarketReview>>> {
    await delay();
    const i = items.find((x) => x.id === itemId);
    if (!i) return notFound();
    const rows = reviewsOf(i)
      .filter((r) => query.accountUid == null || r.account.uid === query.accountUid)
      .filter((r) => query.sentiment == null || sentimentOf(r.rating) === query.sentiment);
    return ok(pageOf(rows, page.p, page.pageSize));
  }

  async reviewSummary(itemId: string): Promise<AppResult<ReviewSummary>> {
    await delay();
    const i = items.find((x) => x.id === itemId);
    if (!i) return notFound();
    const all = reviewsOf(i);
    const count = (s: ReviewSentiment) => all.filter((r) => sentimentOf(r.rating) === s).length;
    return ok({ good: count('good'), neutral: count('neutral'), bad: count('bad') });
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
      .filter((o) => query.stage == null || o.stage === query.stage)
      .filter((o) => query.fromUtc == null || o.createdAt >= query.fromUtc)
      .filter((o) => query.toUtc == null || o.createdAt <= query.toUtc)
      .sort((a, b) => b.serialNo.localeCompare(a.serialNo));
    return ok(pageOf(rows, page.p, page.pageSize));
  }

  async inventory(accountUid: number, query: InventoryQuery, page: PageQuery): Promise<AppResult<ItemsEnvelope<InventoryRow>>> {
    await delay();
    const rows: InventoryRow[] = orders
      .filter((o) => o.buyer.uid === accountUid && o.status === 'active')
      .map((o) => {
        const item = items.find((i) => i.id === o.itemId)!;
        const listing = listingOf(item.onSale);
        return {
          item: { id: item.id, kind: item.onSale.kind, name: item.onSale.face.name },
          image: listing.kind === 'character_card' ? listing.character.avatar : listing.face.cover,
          itemState: item.state,
          creator: item.creator,
          source: o.source,
          orderId: o.id,
          serialNo: serialNos.get(o.id)!,
          acquiredAt: o.at,
        };
      })
      .filter((r) => query.kind == null || r.item.kind === query.kind)
      .filter((r) => query.source == null || r.source === query.source)
      .sort((a, b) => b.serialNo.localeCompare(a.serialNo));
    return ok(pageOf(rows, page.p, page.pageSize));
  }

  async order(orderId: string): Promise<AppResult<MarketOrderDetail>> {
    await delay();
    const o = orders.find((x) => x.id === orderId);
    if (!o) return fail({ code: 'not_found', message: '订单不存在。' });
    const row = orderRow(o);
    const sellerTxns = (sellers.get(row.seller.uid)?.txns ?? []).filter(
      (t) => t.source.kind === 'order' && t.source.ref === row.serialNo,
    );
    return ok({
      order: row,
      itemVersion: 1,
      billSerialNo: o.status !== 'pending' && o.price > 0 ? `BL${row.serialNo.slice(2)}` : null,
      failureReason: o.failureReason,
      settlement: settlementOf(o),
      sellerTxns,
    });
  }

  async settings(): Promise<AppResult<MarketSettingsView>> {
    await delay();
    return ok(settings);
  }

  async saveSettings(next: MarketSettings): Promise<AppResult<MarketSettingsView>> {
    await delay();
    if (next.commissionRate < 0 || next.commissionRate > 1) return fail({ code: 'validation', message: '平台抽成在 0 到 100% 之间。' });
    if (!Number.isInteger(next.settlementDays) || next.settlementDays < 0 || next.settlementDays > 90)
      return fail({ code: 'validation', message: '冻结天数在 0 到 90 天之间。' });
    settings = { settings: next, updatedAt: Date.now() };
    return ok(settings);
  }

  async withdrawals(query: WithdrawalQuery, page: PageQuery): Promise<AppResult<ItemsEnvelope<WithdrawalRow>>> {
    await delay();
    const rows = withdrawals
      .filter((w) => query.status == null || w.status === query.status)
      .filter((w) => query.accountUid == null || w.account.uid === query.accountUid)
      .filter((w) => query.serialNo == null || w.serialNo === query.serialNo)
      .filter((w) => query.fromUtc == null || w.appliedAt >= query.fromUtc)
      .filter((w) => query.toUtc == null || w.appliedAt <= query.toUtc)
      .sort((a, b) => b.serialNo.localeCompare(a.serialNo))
      .map((w) => ({ ...w }));
    return ok(pageOf(rows, page.p, page.pageSize));
  }

  approveWithdrawal(id: string): Promise<AppResult<WithdrawalRow>> {
    return actOnWithdrawal(id, ['pending'], '审核通过', 'approved', null);
  }

  rejectWithdrawal(id: string, reason: string): Promise<AppResult<WithdrawalRow>> {
    return actOnWithdrawal(id, ['pending', 'approved'], '驳回', 'rejected', 'withdraw_returned', reason);
  }

  markWithdrawalPaid(id: string): Promise<AppResult<WithdrawalRow>> {
    return actOnWithdrawal(id, ['approved'], '标记已打款', 'paid', 'withdraw_paid');
  }

  markWithdrawalFailed(id: string, reason: string): Promise<AppResult<WithdrawalRow>> {
    return actOnWithdrawal(id, ['approved'], '标记打款失败', 'failed', 'withdraw_returned', reason);
  }

  async seller(accountUid: number): Promise<AppResult<SellerEarnings>> {
    await delay();
    return ok({ balance: { ...sellerOf(accountUid).balance } });
  }

  async sellerTxns(accountUid: number, page: PageQuery): Promise<AppResult<ItemsEnvelope<SellerTxn>>> {
    await delay();
    return ok(pageOf([...sellerOf(accountUid).txns].reverse(), page.p, page.pageSize));
  }
}
