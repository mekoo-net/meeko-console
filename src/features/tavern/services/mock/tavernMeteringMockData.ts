/**
 * 计量 Mock 的共享数据：调用、扣费回合、积分账户互相引用，几个 Mock 必须看同一份。
 *
 * Mock 扮演服务端：调用按现行积分价目现算（同服务端 `CreditRates.Quote`），所以在积分价目页改了价，
 * 回到调用日志能看到报价跟着变。三天前（同线上 2026-10-31）之前的回合是改积分之前从钱包扣的钱，
 * 没有调用明细、金额是元；之后的回合扣积分。数据用固定种子生成，刷新页面不变。
 */
import { billReverseCodeValues, type RateBody } from '@yomi/common';
import type { ItemsEnvelope } from '@/features/tavern/api/http';

import type { CreditModelRate, CreditPack, CreditRate, CreditTxn, CreditTxnKind } from '../../model/credits.types';
import { ANY } from '../../model/credits.types';
import type {
  CallBill,
  CallLog,
  CallStatus,
  CreditLine,
  MeteredUsage,
  TurnLog,
  TurnReversal,
} from '../../model/metering.types';
import { roundTo } from '../../model/meteringFormat';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const NOW = Date.now();
const SPAN_DAYS = 14;

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20261031);

function between(lo: number, hi: number): number {
  return Math.round(lo + rand() * (hi - lo));
}

function pick<T>(xs: readonly T[]): T {
  return xs[Math.floor(rand() * xs.length)]!;
}

function weighted<T extends string>(table: Readonly<Record<T, number>>): T {
  const entries = Object.entries(table) as Array<[T, number]>;
  let r = rand() * entries.reduce((s, [, w]) => s + w, 0);
  for (const [key, w] of entries) {
    r -= w;
    if (r <= 0) return key;
  }
  return entries[entries.length - 1]![0];
}

function hex(len: number): string {
  let s = '';
  for (let i = 0; i < len; i += 1) s += Math.floor(rand() * 16).toString(16);
  return s;
}

function uuid(): string {
  return `${hex(8)}-${hex(4)}-7${hex(3)}-${pick(['8', '9', 'a', 'b'])}${hex(3)}-${hex(12)}`;
}

// ─── 积分价目 ────────────────────────────────────────────

function perToken(input: number, output: number, cachedRead?: number): RateBody {
  return {
    billingType: 'per_token',
    rate: { input: { perMToken: input, ...(cachedRead != null ? { cachedRead } : {}) }, output: { perMToken: output } },
  };
}

let rateSeq = 0;
function rateRow(vendorKey: string, modelName: string, price: RateBody): CreditRate {
  rateSeq += 1;
  return { id: rateSeq, vendorKey, modelName, price, updatedAt: NOW - 2 * DAY };
}

const rates: CreditRate[] = [
  rateRow(ANY, ANY, perToken(200, 800)),
  rateRow('kiro', 'claude-opus-5.5', perToken(300, 1500, 30)),
  rateRow(ANY, 'gemini-4-argon', perToken(100, 400)),
  rateRow('neko', 'nai-diffusion-5-full', {
    billingType: 'per_image',
    rate: { tiers: [{ size: '1024x1024', quality: 'default', pricePerImage: 5 }] },
  }),
];

export function mockRates(): CreditRate[] {
  return rates.map((r) => structuredClone(r));
}

export function upsertMockRate(vendorKey: string, modelName: string, price: RateBody): CreditRate {
  const hit = rates.find((r) => same(r.vendorKey, vendorKey) && same(r.modelName, modelName));
  if (hit) {
    hit.price = structuredClone(price);
    hit.updatedAt = Date.now();
    return structuredClone(hit);
  }
  const row = rateRow(vendorKey, modelName, structuredClone(price));
  row.updatedAt = Date.now();
  rates.push(row);
  return structuredClone(row);
}

export function deleteMockRate(id: number): string | null {
  const i = rates.findIndex((r) => r.id === id);
  if (i < 0) return `价目 ${id} 不存在。`;
  if (rates[i]!.vendorKey === ANY && rates[i]!.modelName === ANY) return '默认价不能删，改成想要的价就行。';
  rates.splice(i, 1);
  return null;
}

function same(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** 同服务端：(渠道, 模型) → (*, 模型) → 默认价。 */
function findRate(vendorKey: string | null, modelName: string): CreditRate | undefined {
  return (
    (vendorKey ? rates.find((r) => same(r.vendorKey, vendorKey) && same(r.modelName, modelName)) : undefined) ??
    rates.find((r) => r.vendorKey === ANY && same(r.modelName, modelName)) ??
    rates.find((r) => r.vendorKey === ANY && r.modelName === ANY)
  );
}

/** 同服务端 `CreditPrice.Quote`：形状对不上返回 null。 */
function quoteWith(price: RateBody, usage: MeteredUsage): number | null {
  switch (price.billingType) {
    case 'per_token': {
      if (usage.unit !== 'token') return null;
      const { input: i, output: o } = usage.tokens;
      const { input: pi, output: po } = price.rate;
      return (
        (i.tokens * pi.perMToken +
          i.cachedReadTokens * (pi.cachedRead ?? pi.perMToken) +
          i.cachedWriteTokens * (pi.cachedWrite ?? pi.perMToken) +
          i.audioTokens * (pi.audio ?? pi.perMToken) +
          o.tokens * po.perMToken +
          o.reasoningTokens * (po.reasoning ?? po.perMToken) +
          o.audioTokens * (po.audio ?? po.perMToken) +
          o.imageTokens * po.perMToken) /
        1_000_000
      );
    }
    case 'per_call':
      return price.rate.pricePerCall;
    case 'per_image':
      return usage.unit === 'image' ? usage.quantity * (price.rate.tiers[0]?.pricePerImage ?? 0) : null;
    case 'per_video':
      return usage.unit === 'video_second' ? usage.quantity * (price.rate.tiers[0]?.pricePerSecond ?? 0) : null;
    case 'per_audio_minute':
      return usage.unit === 'audio_second' ? (usage.quantity / 60) * price.rate.pricePerMinute : null;
    default:
      return null;
  }
}

export function quoteCredits(usage: MeteredUsage): CreditLine {
  const line = (r: CreditRate, credits: number): CreditLine => ({
    ratedBy: `${r.vendorKey}/${r.modelName}`,
    price: structuredClone(r.price),
    credits: roundTo(credits, 6),
  });
  const rate = findRate(usage.vendorKey, usage.modelName);
  const direct = rate ? quoteWith(rate.price, usage) : null;
  if (rate && direct != null) return line(rate, direct);
  const fallback = findRate(null, ANY);
  const byDefault = fallback ? quoteWith(fallback.price, usage) : null;
  if (fallback && byDefault != null) return line(fallback, byDefault);
  return { ratedBy: '-', price: { billingType: 'per_call', rate: { pricePerCall: 0 } }, credits: 0 };
}

/** 改积分之前的钱包扣费：旧价目（token 基线 × 输出权重），只用来造历史。 */
function legacyCny(usages: readonly MeteredUsage[]): number {
  return roundTo(
    usages.reduce(
      (s, u) =>
        s + (u.unit === 'token' ? (u.tokens.input.tokens + 3 * u.tokens.output.tokens) * 0.000002 : u.quantity * 0.05),
      0,
    ),
    6,
  );
}

// ─── 模型与管线 ──────────────────────────────────────────

interface ModelRef {
  vendorKey: string;
  modelName: string;
}

const OPUS: ModelRef = { vendorKey: 'kiro', modelName: 'claude-opus-5.5' };
const OPUS_FACTORY: ModelRef = { vendorKey: 'factory', modelName: 'claude-opus-5.5' };
const OPUS_LEGACY: ModelRef = { vendorKey: 'kiro', modelName: 'claude-opus-5' };
const ARGON: ModelRef = { vendorKey: 'antigravity', modelName: 'gemini-4-argon' };
const FLASH: ModelRef = { vendorKey: 'antigravity', modelName: 'gemini-3.8-flash' };
const NAI: ModelRef = { vendorKey: 'neko', modelName: 'nai-diffusion-5-full' };

/** 目录里有、但调用日志里看不到的模型（这段时间没人用，或是生图这类不走调用日志的），配置页选模型时要能看到。 */
const IDLE_CATALOG: ReadonlyArray<{ modelName: string; vendors: string[] }> = [
  { modelName: 'nai-diffusion-5-full', vendors: ['neko'] },
  { modelName: 'claude-opus-4.6', vendors: ['kiro'] },
  { modelName: 'claude-sonnet-5', vendors: ['kiro'] },
  { modelName: 'gemini-2.5-pro', vendors: ['vertex'] },
  { modelName: 'deepseek/deepseek-v4-pro', vendors: ['cmdc'] },
  { modelName: 'gpt-5.4', vendors: ['factory'] },
];

/** 已从目录下架、近 30 天仍有调用的模型。 */
const RETIRED_MODELS = new Set(['claude-opus-5']);

const PIPELINE_LABELS: Readonly<Record<string, string>> = {
  dialogue: '角色对话',
  showrunner: '总导演',
  wake: '自主唤醒',
  summary: '滚动摘要',
  chronicle: '纪事生成',
  worldLogic: '世界逻辑',
};

/** 世界级管线不落在某个频道上。 */
const WORLD_LEVEL = new Set(['chronicle', 'worldLogic']);

interface PipelineProfile {
  models: (startedAt: number) => readonly ModelRef[];
  prompt: [number, number];
  completion: [number, number];
}

const PROFILES: Readonly<Record<string, PipelineProfile>> = {
  dialogue: { models: () => [OPUS, OPUS, OPUS_FACTORY, ARGON], prompt: [6_000, 22_000], completion: [180, 1_200] },
  showrunner: { models: () => [OPUS], prompt: [12_000, 36_000], completion: [300, 1_800] },
  wake: { models: () => [FLASH], prompt: [3_000, 9_000], completion: [60, 600] },
  summary: { models: () => [FLASH], prompt: [8_000, 30_000], completion: [400, 1_500] },
  chronicle: { models: () => [ARGON], prompt: [10_000, 40_000], completion: [600, 2_400] },
  worldLogic: {
    // 9 天前世界逻辑还跑在已下架的 claude-opus-5 上。
    models: (t) => (t < NOW - 9 * DAY ? [OPUS_LEGACY] : [OPUS, ARGON]),
    prompt: [5_000, 18_000],
    completion: [200, 900],
  },
};

const ERRORS: ReadonlyArray<{ code: string | null; message: string }> = [
  { code: 'upstream_5xx', message: 'Upstream HTTP 529: overloaded_error' },
  { code: null, message: 'stream interrupted: upstream closed connection before [DONE]' },
  { code: 'context_too_long', message: 'prompt is 212,344 tokens, limit 200,000' },
  { code: 'rate_limited', message: 'Upstream HTTP 429: rate limit exceeded for kiro pool' },
];

/** 上游终止原因原文：Claude 与 Gemini 各说各的，不归一。 */
function stopReasonOf(model: ModelRef, final: boolean, truncated: boolean): string {
  const claude = model.modelName.startsWith('claude');
  if (!final) return claude ? 'tool_use' : 'STOP';
  if (truncated) return claude ? 'max_tokens' : 'MAX_TOKENS';
  return claude ? 'end_turn' : 'STOP';
}

// ─── 账号 ────────────────────────────────────────────────

/** 前两个是重度用户，排行榜上要有明显头部。 */
const ACCOUNTS = [100000123, 100000457, 100001024, 100002333, 100004096, 100008848, 100012580, 100031415];
const ACCOUNT_WEIGHTS = [6, 4, 2, 2, 1, 1, 1, 1];

interface AccountWorld {
  worldId: string;
  sessions: string[];
}

const worlds = new Map<number, AccountWorld[]>(
  ACCOUNTS.map((uid) => [
    uid,
    Array.from({ length: between(1, 3) }, () => ({
      worldId: uuid(),
      sessions: Array.from({ length: between(1, 3) }, () => uuid()),
    })),
  ]),
);

function pickAccount(): number {
  const total = ACCOUNT_WEIGHTS.reduce((s, w) => s + w, 0);
  let r = rand() * total;
  for (let i = 0; i < ACCOUNTS.length; i += 1) {
    r -= ACCOUNT_WEIGHTS[i]!;
    if (r <= 0) return ACCOUNTS[i]!;
  }
  return ACCOUNTS[0]!;
}

// ─── 生成 ────────────────────────────────────────────────

type MockCall = Omit<CallLog, 'kind' | 'cost' | 'bill'> & { usageLogId: number | null };
export const MOCK_STAFF_UID = 900000001;

/** 调用日志和积分都从这一刻开始（同线上 2026-10-31）：之前的回合只有钱包扣费记录，没有调用明细。 */
const CREDITS_SINCE = NOW - 3 * DAY;

/** 服务端 `usage_logs` 一行。没有调用明细的回合另带列表行要的字段。 */
interface MockTurn {
  bill: CallBill;
  accountUid: number;
  traceId: string;
  createdAt: number;
  withoutCalls: Omit<TurnLog, 'kind' | 'bill'> | null;
}

const calls: MockCall[] = [];
const turns: MockTurn[] = [];
let turnSeq = 52_300_000;

interface CallContext {
  accountUid: number;
  worldId: string;
  sessionId: string | null;
  traceId: string;
  proactive: boolean;
}

function serialNo(t: number, id: number): string {
  const d = new Date(t);
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `TVB${ymd}${String(id % 1_000_000).padStart(6, '0')}`;
}

function makeCall(pipeline: string, model: ModelRef, start: number, ctx: CallContext, round: number, final: boolean): MockCall {
  const profile = PROFILES[pipeline]!;
  const roll = rand();
  const status: CallStatus = roll < 0.035 ? 'failure' : roll < 0.05 ? 'cancelled' : 'success';
  const input = between(...profile.prompt) + round * between(800, 3_000);
  // 工具轮次的后续请求大多命中前一轮的提示缓存。
  const cachedRead = round > 0 && model.modelName.startsWith('claude') ? between(4_000, input) : 0;
  const output =
    status === 'success' ? between(...profile.completion) : status === 'cancelled' ? between(20, 200) : 0;
  const reasoning =
    status === 'success' && model.modelName.startsWith('claude') && rand() < 0.4 ? between(100, 900) : 0;
  const latencyMs = status === 'failure' && rand() < 0.6 ? null : between(500, 3_800);
  const durationMs =
    latencyMs == null ? between(800, 30_000) : latencyMs + (output + reasoning) * between(8, 22) + between(50, 600);

  return {
    id: uuid(),
    traceId: ctx.traceId,
    accountUid: ctx.accountUid,
    pipeline: { id: pipeline, label: PIPELINE_LABELS[pipeline] ?? pipeline },
    vendorKey: model.vendorKey,
    modelName: model.modelName,
    status,
    content: {
      worldId: ctx.worldId,
      sessionId: ctx.sessionId,
      proactive: ctx.proactive,
      latencyMs,
      durationMs,
      toolCalls: !final && status === 'success' ? between(1, 2) : 0,
      stopReason: status === 'success' ? stopReasonOf(model, final, rand() < 0.04) : null,
      error: status === 'failure' ? pick(ERRORS) : null,
    },
    usage: {
      totalTokens: input + cachedRead + output + reasoning,
      input: { tokens: input, cachedReadTokens: cachedRead, cachedWriteTokens: 0, audioTokens: 0 },
      output: { tokens: output, reasoningTokens: reasoning, audioTokens: 0, imageTokens: 0 },
    },
    createdAt: start,
    usageLogId: null,
  };
}

/** 一次调用的用量，同服务端 `MeteredTokens`。 */
function meteredTokens(c: Pick<CallLog, 'modelName' | 'vendorKey' | 'usage'>, kind = 'chat'): MeteredUsage {
  return { unit: 'token', modelName: c.modelName, vendorKey: c.vendorKey, kind, tokens: c.usage };
}

function generateTurn(start: number): void {
  // 只有用户发起的回合（对话、导演席）向用户扣费；唤醒判定和角色自主开口都由平台承担，见 generateBackground。
  const pipeline = weighted({ dialogue: 75, showrunner: 25 });
  const accountUid = pickAccount();
  const world = pick(worlds.get(accountUid)!);
  const ctx: CallContext = {
    accountUid,
    worldId: world.worldId,
    sessionId: pick(world.sessions),
    traceId: hex(32),
    proactive: false,
  };
  const model = pick(PROFILES[pipeline]!.models(start));
  const rounds = 1 + (rand() < 0.3 ? 1 : 0) + (rand() < 0.1 ? 1 : 0);

  turnSeq += 1;
  const turnId = turnSeq;
  const own: MockCall[] = [];
  let t = start;
  for (let r = 0; r < rounds; r += 1) {
    const call = makeCall(pipeline, model, t, ctx, r, r === rounds - 1);
    call.usageLogId = turnId;
    own.push(call);
    t += call.content.durationMs + between(200, 1_500);
    // 失败 / 取消即回合结束，不会再有下一轮工具调用。
    if (call.status !== 'success') break;
  }

  const last = own[own.length - 1]!;
  const status = last.status !== 'success' ? 'voided' : rand() < 0.04 ? 'failed' : 'charged';
  const usages: MeteredUsage[] = own.map((c) => meteredTokens(c));
  if (status === 'charged' && rand() < 0.06) {
    usages.push({ unit: 'image', ...NAI, kind: 'generation', quantity: 1 });
  }

  const credits = start >= CREDITS_SINCE;
  const cost = credits ? roundTo(usages.reduce((s, u) => s + quoteCredits(u).credits, 0), 2) : legacyCny(usages);
  const amount = status === 'charged' ? cost : 0;
  if (credits) calls.push(...own);
  turns.push({
    accountUid,
    traceId: ctx.traceId,
    createdAt: t,
    bill: {
      usageLogId: turnId,
      currency: credits ? 'credits' : 'cny',
      status,
      // 作废 / 失败没收到钱，金额按设计为 0。
      amount,
      billSerialNo: !credits && status === 'charged' ? serialNo(t, turnId) : null,
      reversible: status === 'charged' && amount > 0,
      calls: credits ? own.length : 1,
    },
    withoutCalls: credits
      ? null
      : {
          id: turnId,
          traceId: ctx.traceId,
          accountUid,
          sessionId: ctx.sessionId,
          proactive: ctx.proactive,
          usages,
          createdAt: t,
        },
  });
}

function generateBackground(start: number): void {
  const pipeline = weighted({ summary: 30, worldLogic: 20, chronicle: 15, wake: 20, proactive: 15 });
  const accountUid = pickAccount();
  const world = pick(worlds.get(accountUid)!);
  // 自主开口用的是角色的 dialogue 模型，只是不是用户发起的。
  const proactive = pipeline === 'proactive';
  const real = proactive ? 'dialogue' : pipeline;
  const model = pick(PROFILES[real]!.models(start));
  const ctx: CallContext = {
    accountUid,
    worldId: world.worldId,
    sessionId: WORLD_LEVEL.has(real) ? null : pick(world.sessions),
    traceId: hex(32),
    proactive,
  };
  if (start >= CREDITS_SINCE) calls.push(makeCall(real, model, start, ctx, 0, true));
}

for (let t = NOW - SPAN_DAYS * DAY; t < NOW - 2 * MINUTE; t += between(4, 40) * MINUTE) {
  if (rand() < 0.68) generateTurn(t);
  else generateBackground(t);
}

calls.sort((a, b) => b.createdAt - a.createdAt);
const turnById = new Map(turns.map((t) => [t.bill.usageLogId, t]));

// ─── 积分账户 ────────────────────────────────────────────

interface MockAccount {
  available: number;
  held: number;
  txns: CreditTxn[];
  adjustRequests: Set<string>;
}

const accounts = new Map<number, MockAccount>();
let txnSeq = 0;

function accountOf(uid: number): MockAccount {
  let a = accounts.get(uid);
  if (!a) accounts.set(uid, (a = { available: 0, held: 0, txns: [], adjustRequests: new Set() }));
  return a;
}

function record(uid: number, kind: CreditTxnKind, amount: number, source: CreditTxn['source'], note: string | null, at: number): void {
  if (amount <= 0) return;
  const a = accountOf(uid);
  txnSeq += 1;
  a.txns.unshift({ id: txnSeq, kind, amount, availableAfter: a.available, source, note, createdAt: at });
}

/** 开账：每个账户在积分上线那天买过一包；之后按时间扣它的积分回合，不够扣到 0 为止（同服务端）。 */
for (const uid of ACCOUNTS) {
  const a = accountOf(uid);
  const pack = uid % 2 === 0 ? 3300 : 1100;
  a.available = pack;
  record(uid, 'purchase', pack, { kind: 'order', ref: uuid() }, pack === 3300 ? '3000 积分（送 300）' : '1000 积分（送 100）', CREDITS_SINCE - MINUTE);
}
for (const turn of [...turns].sort((x, y) => x.createdAt - y.createdAt)) {
  if (turn.bill.currency !== 'credits' || turn.bill.status !== 'charged') continue;
  const a = accountOf(turn.accountUid);
  const charged = roundTo(Math.min(turn.bill.amount, a.available), 2);
  a.available = roundTo(a.available - charged, 2);
  record(turn.accountUid, 'charge', charged, { kind: 'turn', ref: turn.traceId }, null, turn.createdAt);
  turn.bill = { ...turn.bill, amount: charged, reversible: charged > 0 };
}
for (const turn of turns) {
  if (turn.bill.status === 'charged' && turn.bill.reversible && rand() < 0.02) {
    markReversed(turn, {
      atUtc: Math.min(NOW, turn.createdAt + between(10, 600) * MINUTE),
      by: MOCK_STAFF_UID,
      code: pick(billReverseCodeValues),
      remark: rand() < 0.5 ? '工单 #' + between(1000, 9999) : null,
    });
  }
}

export function mockCreditAccount(uid: number): { available: number; held: number; txns: readonly CreditTxn[] } {
  const a = accountOf(uid);
  return { available: a.available, held: a.held, txns: a.txns };
}

/** 同服务端 `AdjustAsync`：正数发、负数扣（最多扣到 0），同一个 requestId 只记一次。 */
export function adjustMockCredits(uid: number, delta: number, note: string, requestId: string): void {
  const a = accountOf(uid);
  if (a.adjustRequests.has(requestId)) return;
  a.adjustRequests.add(requestId);
  const source = { kind: 'staff' as const, ref: String(MOCK_STAFF_UID) };
  if (delta > 0) {
    a.available = roundTo(a.available + delta, 2);
    record(uid, 'grant', delta, source, note, Date.now());
  } else {
    const deducted = roundTo(Math.min(-delta, a.available), 2);
    a.available = roundTo(a.available - deducted, 2);
    record(uid, 'deduct', deducted, source, note, Date.now());
  }
}

// ─── 积分包 ──────────────────────────────────────────────

let packSeq = 0;
function packRow(name: string, credits: number, bonusCredits: number, price: number, active = true): CreditPack {
  packSeq += 1;
  return { id: packSeq, name, credits, bonusCredits, price, active, sort: packSeq * 10, updatedAt: NOW - 5 * DAY };
}

const packs: CreditPack[] = [
  packRow('入门', 500, 0, 5),
  packRow('常用', 1000, 100, 10),
  packRow('畅玩', 3000, 300, 30),
  packRow('尝鲜（已下架）', 200, 0, 1, false),
];

export function mockPacks(): CreditPack[] {
  return [...packs].sort((a, b) => a.sort - b.sort || a.price - b.price).map((p) => ({ ...p }));
}

export function saveMockPack(edit: Omit<CreditPack, 'id' | 'updatedAt'> & { id: number | null }): CreditPack {
  const hit = edit.id != null ? packs.find((p) => p.id === edit.id) : undefined;
  if (hit) {
    Object.assign(hit, { ...edit, id: hit.id, updatedAt: Date.now() });
    return { ...hit };
  }
  packSeq += 1;
  const row: CreditPack = { ...edit, id: packSeq, updatedAt: Date.now() };
  packs.push(row);
  return { ...row };
}

export function deleteMockPack(id: number): boolean {
  const i = packs.findIndex((p) => p.id === id);
  if (i < 0) return false;
  packs.splice(i, 1);
  return true;
}

// ─── 服务端视图 ──────────────────────────────────────────

export function isBilled(c: MockCall): boolean {
  return c.usageLogId != null;
}

export function toCallLog(c: MockCall): CallLog {
  const { usageLogId, ...call } = c;
  const turn = usageLogId != null ? turnById.get(usageLogId) : undefined;
  return { kind: 'call', ...call, cost: quoteCredits(meteredTokens(c)), bill: turn?.bill ?? null };
}

/** 没有调用明细的回合，按现在的账单状态（驳回过的带驳回记录）。 */
export function mockTurnsWithoutCalls(): TurnLog[] {
  return turns.flatMap(({ bill, withoutCalls }) => (withoutCalls ? [{ kind: 'turn' as const, ...withoutCalls, bill }] : []));
}

export function mockCalls(): readonly MockCall[] {
  return calls;
}

export function findTurn(id: number): MockTurn | undefined {
  return turnById.get(id);
}

/** 同服务端驳回：状态改成已驳回，金额不动——退回的就是它；积分回合退回积分账户。 */
export function markReversed(t: MockTurn, reversal: TurnReversal): void {
  if (t.bill.currency === 'credits') {
    const a = accountOf(t.accountUid);
    a.available = roundTo(a.available + t.bill.amount, 2);
    record(t.accountUid, 'refund', t.bill.amount, { kind: 'turn', ref: t.traceId }, reversal.remark ?? reversal.code, reversal.atUtc);
  }
  t.bill = { ...t.bill, status: 'reversed', reversible: false, reversal };
}

/** 同服务端 `AdminPageQuery`：p 从 1 起，pageSize 夹在 1..200。 */
export function pageOf<T>(rows: readonly T[], page: number, pageSize: number): ItemsEnvelope<T> {
  const size = Math.min(200, Math.max(1, pageSize));
  const p = Math.max(1, page);
  return { items: rows.slice((p - 1) * size, p * size), total: rows.length, page: p, pageSize: size };
}

/** 积分价目表的行：目录里的、近 30 天调用过的、配过价的取并集（同服务端 `BoardAsync`）。 */
export function mockRateBoard(): { default: CreditRate | null; models: CreditModelRate[] } {
  const since = NOW - 30 * DAY;
  const rows = new Map<string, CreditModelRate>();
  const row = (vendorKey: string, modelName: string): CreditModelRate => {
    const key = `${vendorKey}/${modelName}`.toLowerCase();
    let r = rows.get(key);
    if (!r) rows.set(key, (r = { vendorKey, modelName, inCatalog: false, calls30d: 0, rate: null, modelRate: null }));
    return r;
  };
  for (const m of IDLE_CATALOG) for (const v of m.vendors) row(v, m.modelName).inCatalog = true;
  for (const c of calls) {
    const r = row(c.vendorKey, c.modelName);
    if (c.createdAt >= since) r.calls30d += 1;
    if (!RETIRED_MODELS.has(c.modelName)) r.inCatalog = true;
  }
  for (const r of rates) if (!(r.vendorKey === ANY && r.modelName === ANY)) row(r.vendorKey, r.modelName).rate = structuredClone(r);
  for (const r of rows.values()) {
    if (r.rate || r.vendorKey === ANY) continue;
    const byModel = rates.find((x) => x.vendorKey === ANY && same(x.modelName, r.modelName));
    r.modelRate = byModel ? structuredClone(byModel) : null;
  }
  const def = rates.find((r) => r.vendorKey === ANY && r.modelName === ANY);
  return {
    default: def ? structuredClone(def) : null,
    models: [...rows.values()].sort(
      (a, b) => b.calls30d - a.calls30d || a.vendorKey.localeCompare(b.vendorKey) || a.modelName.localeCompare(b.modelName),
    ),
  };
}
