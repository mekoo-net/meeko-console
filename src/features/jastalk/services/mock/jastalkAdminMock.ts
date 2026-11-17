import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { delay } from '@/shared/lib/delay';

import { ANY } from '../../model/jastalk.types';
import type {
  CatalogBoard,
  CatalogModel,
  CatalogModelEdit,
  JastalkUser,
  ModelCategory,
  PageQuery,
  Paged,
  PointAccount,
  PointAdjust,
  PointBalance,
  PointRate,
  PointRateEdit,
  PointTxn,
  RateUnit,
  UsageLine,
  UsageLog,
  UsageLogQuery,
  UserQuery,
} from '../../model/jastalk.types';
import { categoryUnits } from '../../model/jastalkFormat';
import type { JastalkAdminPort } from '../ports/jastalkAdminPort';

/**
 * Mock：规矩照后端（Meeko.Jastalk）写——找价格的顺序、调减最多扣到 0、重复提交只记一次、改目录改定价版本号加一、
 * 被拒时回的那句话——这样页面在 mock 下看到的反应和接了后端是一样的。数据在内存里，刷新就回到初始。
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = Date.now();

const round2 = (n: number) => Math.round(n * 100) / 100;

function page<T>(rows: T[], q: PageQuery): Paged<T> {
  return { items: rows.slice((q.p - 1) * q.pageSize, q.p * q.pageSize), total: rows.length };
}

// ---------- 定价、目录 ----------

let rateSeq = 0;
const rate = (vendorKey: string, modelName: string, unit: RateUnit, inputPrice: number, outputPrice: number, daysAgo: number): PointRate => ({
  id: ++rateSeq,
  vendorKey,
  modelName,
  unit,
  inputPrice,
  outputPrice,
  updatedAt: now - daysAgo * DAY,
});

const rates: PointRate[] = [
  rate(ANY, ANY, 'token', 300, 1500, 9),
  rate('kiro', 'claude-opus-5.5', 'token', 1500, 7500, 9),
  rate(ANY, 'claude-haiku-5-5', 'token', 100, 500, 6),
  rate('media', 'Kwai-Kolors/Kolors', 'image', 0, 6, 4),
  rate('media', 'FunAudioLLM/CosyVoice2-0.5B', 'audio_second', 0, 0.05, 4),
];

type ModelRow = Omit<CatalogModel, 'priced' | 'unit' | 'inputPrice' | 'outputPrice' | 'ratedBy'>;

let modelSeq = 0;
const model = (
  category: ModelCategory,
  vendorKey: string,
  vendorName: string,
  modelName: string,
  displayName: string,
  sort: number,
  enabled = true,
): ModelRow => ({ id: ++modelSeq, category, vendorKey, vendorName, modelName, displayName, enabled, sort, updatedAt: now - 5 * DAY });

const models: ModelRow[] = [
  model('chat', 'kiro', 'Kiro', 'claude-opus-5.5', 'Claude Opus 5.5', 10),
  model('chat', 'kiro', 'Kiro', 'claude-sonnet-5.5', 'Claude Sonnet 5.5', 20),
  model('chat', 'claude', 'Claude', 'claude-haiku-5-5', 'Claude Haiku 5.5', 30),
  model('chat', 'antigravity', 'Antigravity', 'gemini-3.8-flash', 'Gemini 3.8 Flash', 40, false),
  model('image', 'media', '媒体', 'Kwai-Kolors/Kolors', 'Kolors', 10),
  model('tts', 'media', '媒体', 'FunAudioLLM/CosyVoice2-0.5B', 'CosyVoice 2', 10),
  // 定价表里没有按秒的听写价、默认价又是按 token 的：没有价格，用户选不了
  model('stt', 'media', '媒体', 'FunAudioLLM/SenseVoiceSmall', 'SenseVoice', 10),
  model('embed', 'media', '媒体', 'BAAI/bge-m3', 'BGE M3', 10),
];

let version = 14;

/** 找价格：(渠道, 模型) → (`*`, 模型) → (`*`, `*`)，取第一个单位对得上的。不分大小写。 */
function findRate(vendorKey: string, modelName: string, unit: RateUnit): PointRate | undefined {
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const candidates = [
    rates.find((r) => same(r.vendorKey, vendorKey) && same(r.modelName, modelName)),
    rates.find((r) => r.vendorKey === ANY && same(r.modelName, modelName)),
    rates.find((r) => r.vendorKey === ANY && r.modelName === ANY),
  ];
  return candidates.find((r) => r?.unit === unit);
}

function withPrice(m: ModelRow): CatalogModel {
  const unit = categoryUnits[m.category];
  const r = findRate(m.vendorKey, m.modelName, unit);
  return {
    ...m,
    priced: !!r,
    unit,
    inputPrice: r?.inputPrice ?? 0,
    outputPrice: r?.outputPrice ?? 0,
    ratedBy: r ? `${r.vendorKey}/${r.modelName}` : null,
  };
}

const categoryOrder: ModelCategory[] = ['chat', 'embed', 'image', 'rerank', 'stt', 'tts'];

// ---------- 用户、积分 ----------

interface UserRow {
  accountUid: number;
  joinedAt: number;
  lastSeenAt: number;
  blockedAt: number | null;
  balance: PointBalance;
  txns: PointTxn[];
}

let txnSeq = 5000;

function seedUser(i: number): UserRow {
  const accountUid = 100_200 + i * 37;
  const joinedAt = now - (40 - i * 3) * DAY;
  const txns: PointTxn[] = [];
  let available = 0;
  const add = (kind: PointTxn['kind'], amount: number, source: PointTxn['source'], note: string | null, at: number, held = 0) => {
    if (kind === 'exchange' || kind === 'grant' || kind === 'release') available = round2(available + amount);
    if (kind === 'hold' || kind === 'deduct') available = round2(available - amount);
    txns.push({ id: ++txnSeq, kind, amount, availableAfter: available, heldAfter: held, source, note, createdAt: at });
  };
  add('exchange', 1000 + i * 250, { kind: 'order', ref: `0c1f${i}a2e-8b1d-4f6a-9d3c-5e7a1b2c3d4e` }, `平台余额 ¥${(10 + i * 2.5).toFixed(2)}`, joinedAt + HOUR);
  for (let k = 0; k < 4 + (i % 3); k++) {
    const at = joinedAt + (k + 1) * 2 * DAY + i * HOUR;
    const key = `jastalk:${accountUid}:g${i}${k}`;
    const hold = round2(4.5 + k);
    const charge = round2(1.2 + k * 0.37 + i * 0.05);
    add('hold', hold, { kind: 'usage', ref: key }, null, at, hold);
    txns.push({ id: ++txnSeq, kind: 'charge', amount: charge, availableAfter: round2(available + hold - charge), heldAfter: 0, source: { kind: 'usage', ref: key }, note: null, createdAt: at + 4000 });
    add('release', round2(hold - charge), { kind: 'usage', ref: key }, null, at + 4000);
  }
  if (i % 4 === 1) add('grant', 200, { kind: 'staff', ref: '9001' }, '活动补偿', now - 2 * DAY);
  if (i % 5 === 2) add('deduct', 50, { kind: 'staff', ref: '9001' }, '重复发放，扣回', now - DAY);
  return {
    accountUid,
    joinedAt,
    lastSeenAt: now - i * 5 * HOUR - 12 * 60_000,
    blockedAt: i === 6 ? now - 3 * DAY : null,
    balance: { available, held: 0 },
    txns: txns.reverse(),
  };
}

const users: UserRow[] = Array.from({ length: 9 }, (_, i) => seedUser(i));

const toUser = (u: UserRow): JastalkUser => ({
  accountUid: u.accountUid,
  joinedAt: u.joinedAt,
  lastSeenAt: u.lastSeenAt,
  blockedAt: u.blockedAt,
  pointsAvailable: u.balance.available,
  pointsHeld: u.balance.held,
});

/** 调整积分时用过的 requestId → 当时的结果（重复提交回同一个，不再记一笔）。 */
const adjusted = new Map<string, PointBalance>();

// ---------- 用量明细 ----------

let usageSeq = 80_000;

function usage(u: UserRow, n: number): UsageLog[] {
  const at = now - n * 7 * HOUR - (u.accountUid % 50) * 60_000;
  const action = `a-${u.accountUid}-${n}`;
  const chatModel = n % 3 === 0 ? ['claude', 'claude-haiku-5-5'] : ['kiro', 'claude-opus-5.5'];
  const chatRate = findRate(chatModel[0]!, chatModel[1]!, 'token')!;
  const input = 1800 + n * 420;
  const output = n % 5 === 4 ? 0 : 160 + n * 35;
  const line = (kind: string, vendorKey: string, modelName: string, r: PointRate | undefined, i: number, o: number, estimated = false): UsageLine => ({
    kind,
    vendorKey,
    modelName,
    unit: 'token',
    inputTokens: i,
    outputTokens: o,
    quantity: 0,
    estimated,
    ratedBy: r ? `${r.vendorKey}/${r.modelName}` : '-',
    inputPrice: r?.inputPrice ?? 0,
    outputPrice: r?.outputPrice ?? 0,
    points: r ? Math.round(((i * r.inputPrice + o * r.outputPrice) / 1_000_000) * 1e6) / 1e6 : 0,
  });
  const log = (lines: UsageLine[], ok: boolean, offset: number): UsageLog => {
    const amount = round2(lines.reduce((s, l) => s + l.points, 0));
    return {
      id: ++usageSeq,
      accountUid: u.accountUid,
      actionId: action,
      purpose: n % 6 === 5 ? 'moment' : 'chat',
      conversationId: n % 6 === 5 ? null : 'c:xiaoman',
      traceId: null,
      status: amount > 0 ? 'charged' : 'voided',
      upstreamSuccess: ok,
      lines,
      amount,
      createdAt: at + offset,
    };
  };
  const embedRate = findRate('media', 'BAAI/bge-m3', 'token');
  const rows = [log([line('chat', chatModel[0]!, chatModel[1]!, chatRate, input, output, n % 7 === 6)], n % 5 !== 4, 3000)];
  // 聊天的那几次先翻了记忆：向量是同一件事里的另一次结算
  if (n % 2 === 0) rows.push(log([line('embedding', 'media', 'BAAI/bge-m3', embedRate, 320, 0)], true, 0));
  return rows;
}

const usageLogs: UsageLog[] = users
  .flatMap((u, i) => Array.from({ length: 5 + (i % 4) }, (_, n) => usage(u, n)).flat())
  .sort((a, b) => b.createdAt - a.createdAt);

// ---------- 端口 ----------

export class JastalkAdminMock implements JastalkAdminPort {
  async listUsers(query: UserQuery, q: PageQuery): Promise<AppResult<Paged<JastalkUser>>> {
    await delay();
    const rows = users
      .filter((u) => query.accountUid === undefined || u.accountUid === query.accountUid)
      .filter((u) => query.blocked === undefined || (u.blockedAt !== null) === query.blocked)
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
      .map(toUser);
    return ok(page(rows, q));
  }

  async setBlocked(accountUid: number, blocked: boolean): Promise<AppResult<true>> {
    await delay(120);
    const u = users.find((x) => x.accountUid === accountUid);
    if (!u) return fail({ code: 'unknown', message: '这个账号没进过 Jastalk。' });
    // 已经停用的再停一次不改时间：留着第一次停用的时刻
    if (blocked) u.blockedAt ??= Date.now();
    else u.blockedAt = null;
    return ok(true);
  }

  async pointAccount(accountUid: number, q: PageQuery): Promise<AppResult<PointAccount>> {
    await delay();
    const u = users.find((x) => x.accountUid === accountUid);
    return ok({ accountUid, balance: u ? { ...u.balance } : { available: 0, held: 0 }, txns: page(u?.txns ?? [], q) });
  }

  async adjustPoints(accountUid: number, input: PointAdjust): Promise<AppResult<PointBalance>> {
    await delay(160);
    const delta = round2(input.delta);
    if (delta === 0) return fail({ code: 'unknown', message: '调整数不能为 0。' });
    if (!input.note.trim()) return fail({ code: 'unknown', message: '请填写调整原因。' });
    const u = users.find((x) => x.accountUid === accountUid);
    if (!u) return fail({ code: 'unknown', message: '这个账号没进过 Jastalk。' });
    const done = adjusted.get(input.requestId);
    if (done) return ok({ ...done });

    // 调减最多扣到 0
    const amount = delta > 0 ? delta : Math.min(-delta, u.balance.available);
    u.balance.available = round2(u.balance.available + (delta > 0 ? amount : -amount));
    if (amount > 0)
      u.txns.unshift({
        id: ++txnSeq,
        kind: delta > 0 ? 'grant' : 'deduct',
        amount,
        availableAfter: u.balance.available,
        heldAfter: u.balance.held,
        source: { kind: 'staff', ref: '9001' },
        note: input.note.trim(),
        createdAt: Date.now(),
      });
    adjusted.set(input.requestId, { ...u.balance });
    return ok({ ...u.balance });
  }

  async catalog(): Promise<AppResult<CatalogBoard>> {
    await delay();
    const rows = [...models].sort(
      (a, b) => categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category) || a.sort - b.sort || a.id - b.id,
    );
    return ok({ version, models: rows.map(withPrice) });
  }

  async saveModel(input: CatalogModelEdit): Promise<AppResult<CatalogModel>> {
    await delay(160);
    const vendorName = input.vendorName.trim();
    const displayName = input.displayName.trim();
    if (input.id !== null) {
      const row = models.find((m) => m.id === input.id);
      if (!row) return fail({ code: 'unknown', message: '这个模型不在目录里了。' });
      Object.assign(row, {
        vendorName: vendorName || row.vendorKey,
        displayName: displayName || row.modelName,
        enabled: input.enabled,
        sort: input.sort,
        updatedAt: Date.now(),
      });
      version++;
      return ok(withPrice(row));
    }
    const vendorKey = input.vendorKey.trim();
    const modelName = input.modelName.trim();
    if (!vendorKey || !modelName) return fail({ code: 'unknown', message: '渠道和模型必填。' });
    if (vendorKey === ANY || modelName === ANY) return fail({ code: 'unknown', message: '目录里的渠道和模型不能写 *。' });
    if (models.some((m) => m.category === input.category && m.vendorKey === vendorKey && m.modelName === modelName))
      return fail({ code: 'unknown', message: '这一类里已经有这个渠道的这个模型了。' });
    const row = model(input.category, vendorKey, vendorName || vendorKey, modelName, displayName || modelName, input.sort, input.enabled);
    row.updatedAt = Date.now();
    models.push(row);
    version++;
    return ok(withPrice(row));
  }

  async deleteModel(id: number): Promise<AppResult<true>> {
    await delay(120);
    const i = models.findIndex((m) => m.id === id);
    if (i < 0) return fail({ code: 'unknown', message: '这个模型不在目录里了。' });
    models.splice(i, 1);
    version++;
    return ok(true);
  }

  async rates(): Promise<AppResult<PointRate[]>> {
    await delay();
    // 具体渠道的在前，通配的在后
    return ok(
      [...rates].sort(
        (a, b) =>
          Number(a.vendorKey === ANY) - Number(b.vendorKey === ANY) ||
          a.vendorKey.localeCompare(b.vendorKey) ||
          a.modelName.localeCompare(b.modelName),
      ),
    );
  }

  async saveRate(input: PointRateEdit): Promise<AppResult<PointRate>> {
    await delay(160);
    const vendorKey = input.vendorKey.trim();
    const modelName = input.modelName.trim();
    if (!vendorKey || !modelName) return fail({ code: 'unknown', message: '渠道和模型必填。' });
    if (modelName === ANY && vendorKey !== ANY) return fail({ code: 'unknown', message: '模型写 * 时渠道也得是 *（默认价）。' });
    if (input.inputPrice < 0 || input.outputPrice < 0) return fail({ code: 'unknown', message: '单价不能为负。' });
    let row = rates.find((r) => r.vendorKey === vendorKey && r.modelName === modelName);
    if (row) Object.assign(row, { unit: input.unit, inputPrice: input.inputPrice, outputPrice: input.outputPrice, updatedAt: Date.now() });
    else {
      row = rate(vendorKey, modelName, input.unit, input.inputPrice, input.outputPrice, 0);
      rates.push(row);
    }
    version++;
    return ok({ ...row });
  }

  async deleteRate(id: number): Promise<AppResult<true>> {
    await delay(120);
    const i = rates.findIndex((r) => r.id === id);
    if (i < 0) return fail({ code: 'unknown', message: '这一行价格已经不在了。' });
    rates.splice(i, 1);
    version++;
    return ok(true);
  }

  async usageLogs(query: UsageLogQuery, q: PageQuery): Promise<AppResult<Paged<UsageLog>>> {
    await delay();
    const rows = usageLogs
      .filter((l) => query.accountUid === undefined || l.accountUid === query.accountUid)
      .filter((l) => !query.purpose || l.purpose === query.purpose)
      .filter((l) => !query.status || l.status === query.status)
      .filter((l) => query.from === undefined || l.createdAt >= query.from)
      .filter((l) => query.to === undefined || l.createdAt < query.to);
    return ok(page(rows, q));
  }
}
