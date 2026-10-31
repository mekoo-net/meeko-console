/**
 * 计量 Mock 的共享数据：调用与计费回合互相引用，三个 Mock 必须看同一份，
 * 否则从调用日志跳到计费明细会找不到回合。
 *
 * Mock 扮演服务端：折算、报价、汇总都按查询时的价目现算（同 `pricingPreview`），
 * 所以在计费配置页改了价，回到调用日志能看到折算跟着变。数据用固定种子生成，刷新页面不变。
 */
import type { ItemsEnvelope } from '@/features/tavern/api/http';

import type {
  CallLog,
  CallStatus,
  MeteredUsage,
  TurnStatus,
  UsageLog,
  UsageLogDetail,
} from '../../model/metering.types';
import type { PricingModel, PricingRules } from '../../model/meteringPricing.types';
import { applyProactive, quoteUsage, roundTo } from '../../model/pricingPreview';

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

// ─── 价目 ────────────────────────────────────────────────

/** 与线上现行价目一致。 */
const INITIAL_RULES: PricingRules = {
  baselines: [
    { unit: 'token', price: 0.000002 },
    { unit: 'image', price: 0.05 },
    { unit: 'audio_second', price: 0.002 },
    { unit: 'video_second', price: 0.08 },
  ],
  modelMultipliers: [],
  defaultModelMultiplier: 1,
  completionWeight: 3,
  proactiveRateMultiplier: 1,
};

/** 3 天前输出权重从 2 调到 3：更早的回合按旧价扣过费，详情里能看到「价目在扣费后改过」。 */
const PRICING_CHANGED_AT = NOW - 3 * DAY;
const LEGACY_RULES: PricingRules = { ...INITIAL_RULES, completionWeight: 2 };

let rules: PricingRules = structuredClone(INITIAL_RULES);
let version = 7;
let updatedAt = PRICING_CHANGED_AT;

export function currentPricing(): { rules: PricingRules; version: number; updatedAt: number } {
  return { rules: structuredClone(rules), version, updatedAt };
}

export function replacePricing(next: PricingRules): void {
  rules = structuredClone(next);
  version += 1;
  updatedAt = Date.now();
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

type MockCall = Omit<CallLog, 'cost' | 'bill'> & { usageLogId: number | null };
interface MockTurn {
  log: UsageLog;
  callIds: string[];
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

function rulesAt(t: number): PricingRules {
  return t < PRICING_CHANGED_AT ? LEGACY_RULES : INITIAL_RULES;
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

/** 一次调用按 token 计价（同服务端 `MeteredTokens.Of`：输出只取正文桶）。 */
function meteredTokens(c: Pick<CallLog, 'modelName' | 'vendorKey' | 'usage'>, kind = 'chat'): MeteredUsage {
  return {
    unit: 'token',
    modelName: c.modelName,
    vendorKey: c.vendorKey,
    kind,
    promptTokens: c.usage.input.tokens,
    completionTokens: c.usage.output.tokens,
  };
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
  const status: TurnStatus = last.status !== 'success' ? 'voided' : rand() < 0.04 ? 'failed' : 'charged';
  const usages: MeteredUsage[] = own.map((c) => meteredTokens(c));
  if (status === 'charged' && rand() < 0.06) {
    usages.push({ unit: 'image', ...NAI, kind: 'generation', quantity: 1 });
  }

  const chargedRules = rulesAt(start);
  const subtotal = roundTo(usages.reduce((s, u) => s + quoteUsage(chargedRules, u).amount, 0), 6);

  calls.push(...own);
  turns.push({
    log: {
      id: turnId,
      traceId: ctx.traceId,
      accountUid,
      sessionId: ctx.sessionId,
      proactive: ctx.proactive,
      status,
      // 作废 / 失败没收到钱，金额按设计为 0。
      amount: status === 'charged' ? applyProactive(chargedRules, subtotal, ctx.proactive) : 0,
      billSerialNo: status === 'charged' ? serialNo(t, turnId) : null,
      usages,
      createdAt: t,
    },
    callIds: own.map((c) => c.id),
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
  calls.push(makeCall(real, model, start, ctx, 0, true));
}

for (let t = NOW - SPAN_DAYS * DAY; t < NOW - 2 * MINUTE; t += between(4, 40) * MINUTE) {
  if (rand() < 0.68) generateTurn(t);
  else generateBackground(t);
}

calls.sort((a, b) => b.createdAt - a.createdAt);
turns.sort((a, b) => b.log.id - a.log.id);

const callById = new Map(calls.map((c) => [c.id, c]));
const turnById = new Map(turns.map((t) => [t.log.id, t]));

// ─── 服务端视图 ──────────────────────────────────────────

export function isBilled(c: MockCall): boolean {
  return c.usageLogId != null;
}

/** 调用按现行价目折算，不论是否收费；自主倍率只作用在回合上，这里不乘。 */
export function callCost(c: MockCall): CallLog['cost'] {
  return quoteUsage(rules, meteredTokens(c));
}

export function toCallLog(c: MockCall): CallLog {
  const { usageLogId, ...call } = c;
  const turn = usageLogId != null ? turnById.get(usageLogId) : undefined;
  return {
    ...call,
    cost: callCost(c),
    bill: turn ? { usageLogId: turn.log.id, status: turn.log.status, amount: turn.log.amount } : null,
  };
}

export function toUsageLogDetail(t: MockTurn): UsageLogDetail {
  const { log } = t;
  const lines = log.usages.map((usage) => ({ usage, quote: quoteUsage(rules, usage) }));
  const subtotal = roundTo(lines.reduce((s, l) => s + l.quote.amount, 0), 6);
  const amountAtCurrentPricing = applyProactive(rules, subtotal, log.proactive);
  return {
    turn: log,
    lines,
    amountAtCurrentPricing,
    repriced: log.status === 'charged' && log.amount !== amountAtCurrentPricing,
    calls: t.callIds
      .map((id) => callById.get(id))
      .filter((c): c is MockCall => c != null)
      .map(toCallLog),
  };
}

export function mockCalls(): readonly MockCall[] {
  return calls;
}

export function mockTurns(): readonly MockTurn[] {
  return turns;
}

export function findTurn(id: number): MockTurn | undefined {
  return turnById.get(id);
}

/** 同服务端 `AdminPageQuery`：p 从 1 起，pageSize 夹在 1..200。 */
export function pageOf<T>(rows: readonly T[], page: number, pageSize: number): ItemsEnvelope<T> {
  const size = Math.min(200, Math.max(1, pageSize));
  const p = Math.max(1, page);
  return { items: rows.slice((p - 1) * size, p * size), total: rows.length, page: p, pageSize: size };
}

export function mockModels(): PricingModel[] {
  const since = NOW - 30 * DAY;
  const byName = new Map<string, PricingModel>();
  const touch = (modelName: string, vendor: string | null, calls30d: number): void => {
    const hit = byName.get(modelName) ?? {
      modelName,
      vendors: [],
      inCatalog: !RETIRED_MODELS.has(modelName),
      calls30d: 0,
    };
    if (vendor && !hit.vendors.includes(vendor)) hit.vendors.push(vendor);
    hit.calls30d += calls30d;
    byName.set(modelName, hit);
  };
  for (const c of calls) if (c.createdAt >= since) touch(c.modelName, c.vendorKey, 1);
  for (const m of IDLE_CATALOG) for (const v of m.vendors) touch(m.modelName, v, 0);
  return [...byName.values()].sort((a, b) => b.calls30d - a.calls30d || a.modelName.localeCompare(b.modelName));
}
