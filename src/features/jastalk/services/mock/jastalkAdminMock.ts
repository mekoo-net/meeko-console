import { fail, ok, type AppFail, type AppResult } from '@/shared/api/httpTypes';
import { failureToAppError } from '@/shared/api/problemDetails';
import { delay } from '@/shared/lib/delay';

import { ANY, MULTIPLIER_MAX, modelCategories } from '../../model/jastalk.types';
import type {
  CatalogBoard,
  CatalogModel,
  CatalogModelEdit,
  Channel,
  ChannelBoard,
  ChannelDetail,
  ChannelEdit,
  ChannelPricing,
  ChannelSaved,
  JastalkUser,
  ListPrice,
  ModelCategory,
  ModelImport,
  ModelImportResult,
  PageQuery,
  Paged,
  PointAccount,
  PointAdjust,
  PointBalance,
  PointRate,
  PointRateEdit,
  PointTxn,
  RateCompileResult,
  RateUnit,
  UsageBasis,
  UsageLine,
  UsageLog,
  UsageLogQuery,
  UserQuery,
} from '../../model/jastalk.types';
import { categoryUnits } from '../../model/jastalkFormat';
import { groupUsageActions, type UsageAction } from '../../model/usageActions';
import type { JastalkAdminPort } from '../ports/jastalkAdminPort';

/**
 * Mock：规矩照后端（Meeko.Jastalk）写——找价格的顺序、牌价 × 渠道倍率怎么折成积分、什么时候重算、
 * 调减最多扣到 0、重复提交只记一次、改目录改价格版本号加一、被拒时回的那句话——
 * 这样页面在 mock 下看到的反应和接了后端是一样的。数据在内存里，刷新就回到初始。
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = Date.now();

const round2 = (n: number) => Math.round(n * 100) / 100;

function page<T>(rows: T[], q: PageQuery): Paged<T> {
  return { items: rows.slice((q.p - 1) * q.pageSize, q.p * q.pageSize), total: rows.length };
}

// ---------- 牌价、渠道 ----------

/** 牌价的一行：OneApi 的价格表（美元），全站一份，这边只读。键是归一过的模型键，`rate` 的形状随计价方式。 */
interface ListPriceRow {
  modelKey: string;
  maker: string;
  billingType: string;
  rate: Record<string, unknown>;
  /** 牌价上设的别名：渠道里对这个模型的别的叫法（号池后台发布的文档里的 `aliases`，Bff 原样转来）。 */
  aliases?: string[];
}

/** `cachedRead`：命中缓存的输入价，牌价的 `input.cachedRead`；没写的模型命中缓存的按输入价算。 */
const perToken = (modelKey: string, maker: string, input: number, output: number, cachedRead?: number): ListPriceRow => ({
  modelKey,
  maker,
  billingType: 'per_token',
  rate: { input: { perMToken: input, ...(cachedRead === undefined ? {} : { cachedRead }) }, output: { perMToken: output } },
});

const listPrices: ListPriceRow[] = [
  perToken('claude-opus-5.5', 'anthropic', 5, 25, 0.5),
  perToken('claude-sonnet-5.5', 'anthropic', 3, 15, 0.3),
  perToken('claude-haiku-5-5', 'anthropic', 1, 5, 0.1),
  perToken('gemini-3.8-flash', 'google', 0.3, 2.5, 0.075),
  perToken('gemini-3.8-pro', 'google', 1.25, 10, 0.3125),
  // 目录里是带 -preview 的名字；渠道叫 gemini-3.1-pro，比键短，按前缀对不上，靠别名
  { ...perToken('gemini-3.1-pro-preview', 'google', 2, 12, 0.2), aliases: ['gemini-3.1-pro'] },
  perToken('gpt-5.5', 'openai', 1.25, 10, 0.125),
  // 向量模型没有缓存这一说
  perToken('bge-m3', 'baai', 0.01, 0),
  {
    modelKey: 'kolors',
    maker: 'kwai',
    billingType: 'per_image',
    rate: { tiers: [{ size: '1024x1024', pricePerImage: 0.008 }, { size: '2048x2048', pricePerImage: 0.012 }] },
  },
  // 牌价按字符算，而语音在这边按秒计量：折不了，这种模型只能单独定价
  { modelKey: 'cosyvoice2-0.5b', maker: 'funaudiollm', billingType: 'per_character', rate: { pricePerKChar: 0.007 } },
  { modelKey: 'fish-speech-1.5', maker: 'fishaudio', billingType: 'per_character', rate: { pricePerKChar: 0.015 } },
  { modelKey: 'whisper-large-v3', maker: 'openai', billingType: 'per_audio_minute', rate: { pricePerMinute: 0.006 } },
];

/** OneApi 发布的渠道目录：现在在线的 provider，和它们各自发布的模型。 */
const upstream: { providerId: string; models: string[] }[] = [
  { providerId: 'kiro', models: ['claude-opus-5.5', 'claude-sonnet-5.5', 'claude-haiku-5-5', 'claude-opus-5.5-thinking'] },
  { providerId: 'claude', models: ['claude-haiku-5-5', 'claude-sonnet-5.5', 'claude-opus-5.5'] },
  // gemini-3.1-pro：牌价里只有 gemini-3.1-pro-preview，靠那一行的别名对上
  { providerId: 'antigravity', models: ['gemini-3.8-flash', 'gemini-3.8-pro', 'gemini-3.1-pro', 'imagen-5'] },
  {
    providerId: 'media',
    models: [
      'Kwai-Kolors/Kolors',
      'FunAudioLLM/CosyVoice2-0.5B',
      'FunAudioLLM/SenseVoiceSmall',
      'BAAI/bge-m3',
      'BAAI/bge-reranker-v2-m3',
      'fishaudio/fish-speech-1.5',
      'openai/whisper-large-v3',
    ],
  },
];

/**
 * 读不到上游时的样子：`upstream` 是没读到 OneApi 的渠道目录，`listPrices` 是手上没有牌价。
 * 平时都读得到；测试和看页面时拨一下，看这两种情况页面有没有明说。
 */
const outage = { upstream: false, listPrices: false };

export function setJastalkMockOutage(next: Partial<typeof outage>): void {
  Object.assign(outage, next);
}

interface ChannelRow {
  vendorKey: string;
  vendorName: string;
  multiplier: number | null;
  updatedAt: number;
}

const channelRow = (vendorKey: string, vendorName: string, multiplier: number | null, daysAgo: number): [string, ChannelRow] => [
  vendorKey,
  { vendorKey, vendorName, multiplier, updatedAt: now - daysAgo * DAY },
];

/** 这边设置过的渠道。antigravity 没设置过：只因为目录里有它的模型、OneApi 那边在线才列出来，没有倍率。 */
const channelRows = new Map<string, ChannelRow>([
  channelRow('kiro', 'Kiro', 7, 9),
  channelRow('claude', 'Claude', 7.3, 9),
  channelRow('media', '媒体', 7.3, 4),
  channelRow('codex', 'Codex', 7, 20),
]);

/**
 * 上游的模型名对到牌价的键：去掉渠道前缀、不分大小写，相等或者是键后面接 `-` 的，取最长的那个键。
 * （后端的规则更细，还会折日期、点和横线；这里的名字用不到。）
 */
function findListPrice(modelName: string): ListPriceRow | undefined {
  if (outage.listPrices) return undefined;
  const name = modelName.trim().toLowerCase().split('/').pop() ?? '';
  let best: ListPriceRow | undefined;
  let bestLength = -1;
  for (const row of listPrices) {
    // 别名和键一样用：渠道里的名字等于它、或者是它后面接 `-…`，都算对上；几个都对得上取最长的
    for (const key of [row.modelKey, ...(row.aliases ?? [])]) {
      if (name !== key && !name.startsWith(`${key}-`)) continue;
      if (key.length > bestLength) {
        best = row;
        bestLength = key.length;
      }
    }
  }
  return best;
}

function numberAt(obj: unknown, ...path: string[]): number | null {
  let el = obj;
  for (const name of path) {
    if (typeof el !== 'object' || el === null) return null;
    el = (el as Record<string, unknown>)[name];
  }
  return typeof el === 'number' && Number.isFinite(el) && el >= 0 ? el : null;
}

/** 折算时取的数（美元）。`cachedInput` 只有按 token 的牌价写了缓存价才有，别的都是 null（命中缓存的按输入价算）。 */
interface UsdPrice {
  input: number;
  output: number;
  cachedInput: number | null;
}

/**
 * 牌价里折算时取的那几个数（美元）。牌价的计价方式和这边的计量单位对不上回 null：
 * 硬换算出来的数没有依据（按字符的语音牌价换不成按秒的）。
 */
function toUsd(price: ListPriceRow, unit: RateUnit): UsdPrice | null {
  if (unit === 'token' && price.billingType === 'per_token') {
    const input = numberAt(price.rate, 'input', 'perMToken');
    const output = numberAt(price.rate, 'output', 'perMToken');
    const cachedInput = numberAt(price.rate, 'input', 'cachedRead');
    return input !== null && output !== null ? { input, output, cachedInput } : null;
  }
  if (unit === 'image' && price.billingType === 'per_image') {
    // 牌价按尺寸分档，这边一张图只有一个价：取最贵的那一档
    const tiers: unknown[] = Array.isArray(price.rate.tiers) ? price.rate.tiers : [];
    const perImage = tiers.map((t) => numberAt(t, 'pricePerImage')).filter((p): p is number => p !== null);
    return perImage.length > 0 ? { input: 0, output: Math.max(...perImage), cachedInput: null } : null;
  }
  if (unit === 'audio_second' && price.billingType === 'per_audio_minute') {
    const perMinute = numberAt(price.rate, 'pricePerMinute');
    return perMinute !== null ? { input: perMinute / 60, output: perMinute / 60, cachedInput: null } : null;
  }
  return null;
}

// 和价格表那一列的精度一样（六位小数）
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** 牌价（美元）× 渠道倍率 = 人民币，再 × 100 折成积分。 */
function toPoints(price: ListPriceRow, unit: RateUnit, multiplier: number): UsdPrice | null {
  const usd = toUsd(price, unit);
  if (!usd) return null;
  const factor = multiplier * 100;
  return {
    input: round6(usd.input * factor),
    output: round6(usd.output * factor),
    cachedInput: usd.cachedInput === null ? null : round6(usd.cachedInput * factor),
  };
}

function listPriceOf(modelName: string, unit: RateUnit, multiplier: number | null): ListPrice | null {
  const price = findListPrice(modelName);
  if (!price) return null;
  const usd = toUsd(price, unit);
  const points = multiplier === null ? null : toPoints(price, unit, multiplier);
  return {
    modelKey: price.modelKey,
    maker: price.maker,
    billingType: price.billingType,
    rate: price.rate,
    usdInput: usd ? round6(usd.input) : null,
    usdOutput: usd ? round6(usd.output) : null,
    usdCachedInput: usd?.cachedInput == null ? null : round6(usd.cachedInput),
    convertible: usd !== null,
    pointsInput: points?.input ?? null,
    pointsOutput: points?.output ?? null,
    pointsCachedInput: points?.cachedInput ?? null,
  };
}

// ---------- 价格表、目录 ----------

let rateSeq = 0;
const manualRate = (
  vendorKey: string,
  modelName: string,
  unit: RateUnit,
  inputPrice: number,
  outputPrice: number,
  daysAgo: number,
  cachedInputPrice: number | null = null,
): PointRate => ({
  id: ++rateSeq,
  vendorKey,
  modelName,
  unit,
  inputPrice,
  outputPrice,
  cachedInputPrice,
  updatedAt: now - daysAgo * DAY,
  source: 'manual',
  sourceModelKey: null,
  multiplierApplied: null,
});

/** 人定的那几行；跟渠道算出来的行由下面的 `compile()` 填进来。 */
const rates: PointRate[] = [
  manualRate(ANY, ANY, 'token', 300, 1500, 9),
  // 单独定价：这个模型不跟 claude 渠道的倍率走，缓存价也是自己定的
  manualRate('claude', 'claude-haiku-5-5', 'token', 600, 3000, 6, 60),
  // 牌价按字符算、折不成按秒：只能单独定价
  manualRate('media', 'FunAudioLLM/CosyVoice2-0.5B', 'audio_second', 0, 0.05, 4),
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
  // 渠道没设倍率：落在默认价上
  model('chat', 'antigravity', 'Antigravity', 'gemini-3.8-flash', 'Gemini 3.8 Flash', 40, false),
  // provider 停了、渠道不在线：接进来的模型和算好的价都还在
  model('chat', 'codex', 'Codex', 'gpt-5.5', 'GPT-5.5', 50),
  model('image', 'media', '媒体', 'Kwai-Kolors/Kolors', 'Kolors', 10),
  model('tts', 'media', '媒体', 'FunAudioLLM/CosyVoice2-0.5B', 'CosyVoice 2', 10),
  // 牌价里没有它、默认价又是按 token 的：没有价格，用户选不了
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
    // 带着这个字段就是「分缓存价」：页面上才摆缓存那一档、让人填
    cachedInputPrice: r && unit === 'token' ? (r.cachedInputPrice ?? null) : null,
    ratedBy: r ? `${r.vendorKey}/${r.modelName}` : null,
  };
}

const categoryOrder: ModelCategory[] = ['chat', 'embed', 'image', 'rerank', 'stt', 'tts'];

const byCatalogOrder = (a: ModelRow, b: ModelRow) =>
  categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category) || a.sort - b.sort || a.id - b.id;

/** 和后端一样按码点排（不看语言环境）。 */
const ordinal = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * 按「牌价 × 渠道倍率」把价格表里跟渠道走的行重算一遍；只给一个渠道就只算它。规矩照后端的 PointRateCompiler：
 * - 单独定的价（manual）和通配的行不碰；
 * - 牌价里对不上、或者折不成这个单位的，记进 unmatched——已经算好的那一行原样留着接着用；
 * - 手上没有牌价时什么都不重算、也不报 unmatched（那是「不知道」，不是「都没有价格」）；
 * - 只有两种情况删一行算出来的价：目录里没有这个模型了，或者它的渠道不设倍率了；
 * - 真有改动版本号才加一。
 */
function compile(vendorKey?: string, at = Date.now()): RateCompileResult {
  const inScope = (key: string) => vendorKey === undefined || key === vendorKey;
  const pair = (vendor: string, name: string) => `${vendor}\u0000${name}`;
  let compiled = 0;
  let unchanged = 0;
  let removed = 0;
  const unmatched: RateCompileResult['unmatched'] = [];
  const wanted = new Set<string>();
  const seen = new Set<string>();

  for (const m of models) {
    const key = pair(m.vendorKey, m.modelName);
    // 同一个模型可以在两类里各有一行，价格表里只有一行：按先碰到的那一类的单位算
    if (!inScope(m.vendorKey) || seen.has(key)) continue;
    seen.add(key);
    const multiplier = channelRows.get(m.vendorKey)?.multiplier ?? null;
    if (multiplier === null) continue;
    wanted.add(key);

    const existing = rates.find((r) => r.vendorKey === m.vendorKey && r.modelName === m.modelName);
    if (existing?.source === 'manual') continue;

    const unit = categoryUnits[m.category];
    const price = findListPrice(m.modelName);
    const points = price ? toPoints(price, unit, multiplier) : null;
    if (!price || !points) {
      if (!outage.listPrices) unmatched.push({ vendorKey: m.vendorKey, modelName: m.modelName, reason: price ? 'unit_mismatch' : 'no_list_price' });
      continue;
    }

    const next = {
      unit,
      inputPrice: points.input,
      outputPrice: points.output,
      cachedInputPrice: points.cachedInput,
      sourceModelKey: price.modelKey,
      multiplierApplied: multiplier,
    };
    if (!existing) {
      rates.push({ id: ++rateSeq, vendorKey: m.vendorKey, modelName: m.modelName, updatedAt: at, source: 'compiled', ...next });
      compiled++;
    } else if ((Object.keys(next) as (keyof typeof next)[]).some((k) => existing[k] !== next[k])) {
      Object.assign(existing, next, { updatedAt: at });
      compiled++;
    } else {
      unchanged++;
    }
  }

  for (let i = rates.length - 1; i >= 0; i--) {
    const r = rates[i]!;
    if (r.source !== 'compiled' || !inScope(r.vendorKey) || wanted.has(pair(r.vendorKey, r.modelName))) continue;
    rates.splice(i, 1);
    removed++;
  }

  const changed = compiled + removed > 0;
  if (changed) version++;
  return { compiled, unchanged, removed, unmatched, listPricesEmpty: outage.listPrices, newVersion: changed ? version : null };
}

// 初始的那几行算出来的价：和接了后端一样是算的，不是手写的数
compile(undefined, now - 4 * DAY);
version = 14;

function boardOf(): ChannelBoard {
  const published = outage.upstream ? null : upstream;
  const online = new Map((published ?? []).map((p) => [p.providerId, p.models.length]));
  const keys = [...new Set([...online.keys(), ...channelRows.keys(), ...models.map((m) => m.vendorKey)])];
  const rows: Channel[] = keys.map((key) => {
    const row = channelRows.get(key);
    const own = models.filter((m) => m.vendorKey === key);
    const priced = own.filter((m) => findRate(m.vendorKey, m.modelName, categoryUnits[m.category])).length;
    return {
      vendorKey: key,
      vendorName: row?.vendorName ?? own[0]?.vendorName ?? key,
      multiplier: row?.multiplier ?? null,
      online: online.has(key),
      upstreamModels: online.get(key) ?? 0,
      models: own.length,
      priced,
      unpriced: own.length - priced,
      updatedAt: row?.updatedAt ?? null,
    };
  });
  return {
    version,
    // 接了模型的在前，再按键排
    channels: rows.sort((a, b) => Number(b.models > 0) - Number(a.models > 0) || ordinal(a.vendorKey, b.vendorKey)),
    upstreamReachable: published !== null,
    listPricesLoaded: !outage.listPrices,
    listPriceCount: outage.listPrices ? 0 : listPrices.length,
  };
}

function detailOf(vendorKey: string, previewCategory?: ModelCategory): ChannelDetail {
  // 还没接的不知道归哪一类：页面上选了打算接成哪一类就按那一类预览，不给（或者不认识）按对话
  const previewUnit = categoryUnits[previewCategory && modelCategories.includes(previewCategory) ? previewCategory : 'chat'];
  const channel: Channel = boardOf().channels.find((c) => c.vendorKey === vendorKey) ?? {
    vendorKey,
    vendorName: vendorKey,
    multiplier: null,
    online: false,
    upstreamModels: 0,
    models: 0,
    priced: 0,
    unpriced: 0,
    updatedAt: null,
  };
  const published = outage.upstream ? [] : (upstream.find((p) => p.providerId === vendorKey)?.models ?? []);
  const own = models.filter((m) => m.vendorKey === vendorKey).sort(byCatalogOrder);
  const taken = new Set(own.map((m) => m.modelName));
  return {
    channel,
    models: own.map((m) => {
      const unit = categoryUnits[m.category];
      const r = findRate(m.vendorKey, m.modelName, unit);
      const pricing: ChannelPricing = !r ? 'none' : r.vendorKey === ANY ? 'default' : r.source === 'compiled' ? 'compiled' : 'manual';
      return {
        model: withPrice(m),
        pricing,
        // 只有这个模型自己的那一行才给编号：落在通配价上的，那一行不归它
        rateId: r && (pricing === 'manual' || pricing === 'compiled') ? r.id : null,
        listPrice: listPriceOf(m.modelName, unit, channel.multiplier),
        upstream: published.includes(m.modelName),
      };
    }),
    available: published
      .filter((name) => !taken.has(name))
      .sort(ordinal)
      .map((name) => ({ modelName: name, listPrice: listPriceOf(name, previewUnit, channel.multiplier) })),
  };
}

/** 这个渠道给用户看的名字：渠道上定过就用它，没定过用同渠道已有模型身上的。 */
function channelNameOf(vendorKey: string): string | undefined {
  return channelRows.get(vendorKey)?.vendorName ?? models.find((m) => m.vendorKey === vendorKey)?.vendorName;
}

/**
 * 渠道这几个接口被拒时和接了后端一样：过线的只有种类和原因码，界面上那句话按码从共用的文案表里出
 * （表里还没有的码，出的是种类那一句）。
 */
const rejected = (kind: 'GEN_01' | 'GEN_02' | 'GEN_03', reason: string): AppFail =>
  fail(failureToAppError({ success: false, error: { code: kind, reason } }, 200));

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

/** 一行价格的来历，结算时抄进用量（照后端将来要记的样子；TODO(网关)）。 */
function basisOf(r: PointRate | undefined): UsageBasis | null {
  if (!r) return null;
  const none = { listModelKey: null, multiplier: null, usdInput: null, usdCachedInput: null, usdOutput: null };
  if (r.vendorKey === ANY) return { source: 'default', ...none };
  if (r.source === 'manual') return { source: 'manual', ...none };
  const price = listPrices.find((p) => p.modelKey === r.sourceModelKey);
  const usd = price ? toUsd(price, r.unit) : null;
  return {
    source: 'compiled',
    listModelKey: r.sourceModelKey,
    multiplier: r.multiplierApplied,
    usdInput: usd ? round6(usd.input) : null,
    usdCachedInput: usd?.cachedInput == null ? null : round6(usd.cachedInput),
    usdOutput: usd ? round6(usd.output) : null,
  };
}

/**
 * 结果重排的价。重排模型这份 mock 的目录里没接（接了渠道页的数都要跟着变），用量历史里照样会有：
 * 当时接着、后来移除的模型，账上还是那一次的单价。
 */
const rerankRate = manualRate('media', 'BAAI/bge-reranker-v2-m3', 'token', 73, 0, 30);

/** 一件事是一条调用链，链上一步一次结算。 */
interface ChainStep {
  line: UsageLine;
  /** 这一次上游成没成。 */
  ok: boolean;
  /** 离这件事开始过了多久（毫秒）：链上的先后。 */
  offset: number;
}

/**
 * 一个用户的第 n 件事。几种调用链轮着来，照用户在 Jastalk 里真会做的事：
 * 聊一句（先翻记忆：向量、重排，再是对话模型；角色这一句带语音、配图的还有语音合成、生图）、
 * 角色主动找上门（唤醒）、群聊里几个角色各回一句、发朋友圈、提炼记忆；
 * 也有链上某一步出错的（语音合成失败、对话中途断开只算已经写出来的、对话一个字没回出来）。
 */
function usage(u: UserRow, n: number, i: number): UsageLog[] {
  const at = now - n * 3 * HOUR - (u.accountUid % 50) * 60_000 - i * 11 * 60_000;
  const action = `a-${u.accountUid}-${n}`;

  const rate = (vendorKey: string, modelName: string, unit: RateUnit = 'token') => findRate(vendorKey, modelName, unit);
  const tokens = (
    kind: string,
    vendorKey: string,
    modelName: string,
    input: number,
    output: number,
    opts: { cached?: number; estimated?: boolean; r?: PointRate } = {},
  ): UsageLine => {
    const r = opts.r ?? rate(vendorKey, modelName);
    const cached = opts.cached ?? 0;
    const cachedPrice = r?.cachedInputPrice ?? null;
    return {
      kind,
      vendorKey,
      modelName,
      unit: 'token',
      inputTokens: input,
      cachedInputTokens: cached,
      outputTokens: output,
      quantity: 0,
      estimated: opts.estimated ?? false,
      ratedBy: r ? `${r.vendorKey}/${r.modelName}` : '-',
      inputPrice: r?.inputPrice ?? 0,
      outputPrice: r?.outputPrice ?? 0,
      cachedInputPrice: cachedPrice,
      basis: basisOf(r),
      points: r ? round6((input * r.inputPrice + cached * (cachedPrice ?? r.inputPrice) + output * r.outputPrice) / 1_000_000) : 0,
    };
  };
  // 语音合成按秒、生图按张，只有一个价
  const counted = (kind: string, vendorKey: string, modelName: string, unit: RateUnit, quantity: number): UsageLine => {
    const r = rate(vendorKey, modelName, unit);
    return {
      kind,
      vendorKey,
      modelName,
      unit,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      quantity,
      estimated: false,
      ratedBy: r ? `${r.vendorKey}/${r.modelName}` : '-',
      inputPrice: r?.inputPrice ?? 0,
      outputPrice: r?.outputPrice ?? 0,
      cachedInputPrice: null,
      basis: basisOf(r),
      points: r ? round6(quantity * (r.outputPrice || r.inputPrice)) : 0,
    };
  };

  // 对话：第一轮之后人设和前面的对话都命中缓存，输入的大头是缓存
  const [vendorKey, modelName] = ([
    ['kiro', 'claude-opus-5.5'],
    ['kiro', 'claude-sonnet-5.5'],
    ['claude', 'claude-haiku-5-5'],
    ['codex', 'gpt-5.5'],
  ] as const)[(n + i) % 4]!;
  const context = 6_000 + ((n * 1_370 + i * 610) % 14_000);
  const reply = 180 + ((n * 97 + i * 53) % 520);
  const chat = (output = reply, opts: { first?: boolean; estimated?: boolean; scale?: number } = {}) => {
    const total = Math.round(context * (opts.scale ?? 1));
    const cached = opts.first || opts.estimated ? 0 : Math.round(total * 0.85);
    return tokens('chat', vendorKey, modelName, total - cached, output, { cached, estimated: opts.estimated });
  };
  const recall = () => tokens('embedding', 'media', 'BAAI/bge-m3', 120 + (n % 5) * 40, 0);
  const rerank = () => tokens('rerank', 'media', 'BAAI/bge-reranker-v2-m3', 2_400 + (n % 4) * 600, 0, { r: rerankRate });
  const speech = (seconds = 4 + ((n + i) % 9)) => counted('speech', 'media', 'FunAudioLLM/CosyVoice2-0.5B', 'audio_second', seconds);
  const image = () => counted('image', 'media', 'Kwai-Kolors/Kolors', 'image', 1);
  // 出错又什么都没产出的一步：上游没报用量，这一步没扣（照后端：扣不扣看有没有用量）
  const step = (line: UsageLine, offset: number, ok = true): ChainStep => {
    const produced = line.outputTokens > 0 || line.quantity > 0 || line.kind === 'embedding' || line.kind === 'rerank';
    if (ok || produced) return { line, offset, ok };
    return { line: { ...line, inputTokens: 0, cachedInputTokens: 0, points: 0 }, offset, ok };
  };

  const chains: { purpose: string; steps: ChainStep[] }[] = [
    // 聊一句：翻记忆（向量 → 重排）→ 对话
    { purpose: 'chat', steps: [step(recall(), 0), step(rerank(), 400), step(chat(), 1_200)] },
    // 这一句带了语音
    { purpose: 'chat', steps: [step(recall(), 0), step(rerank(), 380), step(chat(), 1_100), step(speech(), 6_800)] },
    // 角色主动找上门（唤醒）：没有用户那一句，直接翻记忆、写一句、念出来
    { purpose: 'proactive', steps: [step(recall(), 0), step(chat(reply, { scale: 0.6 }), 900), step(speech(), 5_200)] },
    // 配了一张图
    { purpose: 'chat', steps: [step(recall(), 0), step(chat(), 1_000), step(image(), 9_500)] },
    // 对话里调了一次工具：对话模型来回两次，第二次几乎全命中缓存
    { purpose: 'chat', steps: [step(recall(), 0), step(rerank(), 420), step(chat(60), 1_300), step(chat(), 4_600)] },
    // 语音合成那一步出错：没念出来，这一步没扣；前面的照扣
    { purpose: 'chat', steps: [step(recall(), 0), step(chat(), 1_000), step(speech(0), 7_000, false)] },
    // 群聊：几个角色各回一句，各是一次对话
    {
      purpose: 'group',
      steps: [step(recall(), 0), step(chat(reply, { scale: 1.3 }), 1_400), step(chat(Math.round(reply * 0.7), { scale: 1.3 }), 5_100), step(chat(Math.round(reply * 0.5), { scale: 1.3 }), 8_900)],
    },
    // 用户中途停了：上游没报用量，按写出来的字数估，只算已经写出来的
    { purpose: 'chat', steps: [step(recall(), 0), step(rerank(), 360), step(chat(Math.round(reply * 0.4), { estimated: true }), 1_200, false)] },
    // 发朋友圈：写一段、配一张图
    { purpose: 'moment', steps: [step(chat(reply, { first: true, scale: 0.4 }), 0), step(image(), 8_200)] },
    // 主动找上门，但对话模型一个字都没回出来：这一步没扣，整件事只扣了翻记忆那一点
    { purpose: 'proactive', steps: [step(recall(), 0), step(chat(0, { scale: 0.6 }), 900, false)] },
    // 提炼记忆：把一段对话总结一遍，再写成向量存起来
    { purpose: 'memory', steps: [step(chat(reply, { first: true, scale: 1.6 }), 0), step(tokens('embedding', 'media', 'BAAI/bge-m3', 900, 0), 6_400)] },
    // 对话模型连不上，什么都没产出：整件事一点没扣
    { purpose: 'chat', steps: [step(chat(0, { first: true }), 0, false)] },
  ];
  const chain = chains[(n + i * 5) % chains.length]!;

  return chain.steps.map((s) => {
    const amount = round2(s.line.points);
    const id = ++usageSeq;
    return {
      id,
      accountUid: u.accountUid,
      actionId: action,
      purpose: chain.purpose,
      conversationId: chain.purpose === 'moment' || chain.purpose === 'memory' ? null : `c:${['xiaoman', 'linjia', 'qiuyue'][(n + i) % 3]}`,
      traceId: (id * 2654435761).toString(16).padStart(16, '0').slice(-16) + action.length.toString(16).padStart(16, '0'),
      status: amount > 0 ? 'charged' : 'voided',
      upstreamSuccess: s.ok,
      lines: [s.line],
      amount,
      createdAt: at + s.offset,
    };
  });
}

const usageLogs: UsageLog[] = users
  .flatMap((u, i) => Array.from({ length: 9 + (i % 5) }, (_, n) => usage(u, n, i)).flat())
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

  async channels(): Promise<AppResult<ChannelBoard>> {
    await delay();
    return ok(boardOf());
  }

  async channel(vendorKey: string, previewCategory?: ModelCategory): Promise<AppResult<ChannelDetail>> {
    await delay();
    return ok(detailOf(vendorKey, previewCategory));
  }

  async saveChannel(vendorKey: string, input: ChannelEdit): Promise<AppResult<ChannelSaved>> {
    await delay(160);
    const key = vendorKey.trim();
    const name = input.vendorName?.trim() ?? '';
    if (!key || key.length > 64 || key === ANY) return rejected('GEN_01', 'catalog_vendor_invalid');
    if (name.length > 64) return rejected('GEN_01', 'catalog_display_name_too_long');
    if (input.multiplier !== null && !(input.multiplier >= 0 && input.multiplier <= MULTIPLIER_MAX))
      return rejected('GEN_01', 'channel_multiplier_invalid');

    const row: ChannelRow = { vendorKey: key, vendorName: name || key, multiplier: input.multiplier, updatedAt: Date.now() };
    channelRows.set(key, row);
    // 渠道的名字只有这一个出处：目录里这个渠道的每个模型身上那份跟着改
    const renamed = models.filter((m) => m.vendorKey === key && m.vendorName !== row.vendorName);
    for (const m of renamed) Object.assign(m, { vendorName: row.vendorName, updatedAt: row.updatedAt });
    if (renamed.length > 0) version++;

    const result = compile(key);
    return ok({ channel: boardOf().channels.find((c) => c.vendorKey === key)!, compile: result });
  }

  async importModels(vendorKey: string, input: ModelImport): Promise<AppResult<ModelImportResult>> {
    await delay(200);
    const vendor = vendorKey.trim();
    const names = [...new Set(input.models.map((n) => n.trim()).filter(Boolean))];
    if (names.length === 0) return rejected('GEN_01', 'catalog_model_invalid');
    if (!modelCategories.includes(input.category)) return rejected('GEN_01', 'catalog_category_invalid');
    if (!vendor || vendor.length > 64) return rejected('GEN_01', 'catalog_vendor_invalid');
    if (names.some((n) => n.length > 128)) return rejected('GEN_01', 'catalog_model_invalid');
    if (vendor === ANY || names.includes(ANY)) return rejected('GEN_01', 'catalog_wildcard_not_allowed');

    const existing = new Set(models.filter((m) => m.category === input.category && m.vendorKey === vendor).map((m) => m.modelName));
    const fresh = names.filter((n) => !existing.has(n));
    if (fresh.length > 0) {
      const vendorName = channelNameOf(vendor) ?? vendor;
      // 排在这一类现有的后面
      let sort = Math.max(0, ...models.filter((m) => m.category === input.category).map((m) => m.sort));
      for (const name of fresh) {
        // 名字先用模型名顶着，之后可以改
        const row = model(input.category, vendor, vendorName, name, name, ++sort, input.enabled);
        row.updatedAt = Date.now();
        models.push(row);
      }
      version++;
    }
    // 接完把这个渠道的价重算一遍，对得上牌价的当场就有价
    const result = compile(vendor);
    return ok({ added: fresh.length, skipped: names.length - fresh.length, compile: result });
  }

  async compileRates(vendorKey?: string): Promise<AppResult<RateCompileResult>> {
    await delay(200);
    return ok(compile(vendorKey?.trim() || undefined));
  }

  async catalog(): Promise<AppResult<CatalogBoard>> {
    await delay();
    return ok({ version, models: [...models].sort(byCatalogOrder).map(withPrice) });
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
    const row = model(
      input.category,
      vendorKey,
      vendorName || channelNameOf(vendorKey) || vendorKey,
      modelName,
      displayName || modelName,
      input.sort,
      input.enabled,
    );
    row.updatedAt = Date.now();
    models.push(row);
    version++;
    // 新接的模型当场有价：把它的渠道重算一遍
    compile(vendorKey);
    return ok(withPrice(row));
  }

  async deleteModel(id: number): Promise<AppResult<true>> {
    await delay(120);
    const i = models.findIndex((m) => m.id === id);
    if (i < 0) return fail({ code: 'unknown', message: '这个模型不在目录里了。' });
    const [gone] = models.splice(i, 1);
    version++;
    // 模型不在目录里了，按牌价给它算的那一行也不该留着
    if (gone) compile(gone.vendorKey);
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
    if (input.inputPrice < 0 || input.outputPrice < 0 || (input.cachedInputPrice ?? 0) < 0)
      return fail({ code: 'unknown', message: '单价不能为负。' });
    let row = rates.find((r) => r.vendorKey === vendorKey && r.modelName === modelName);
    // 不带缓存价是没摆那一档：原来有的留着，不是清掉
    const cachedInputPrice = input.cachedInputPrice === undefined ? (row?.cachedInputPrice ?? null) : input.cachedInputPrice;
    // 人改过的价从此是单独定的：算出来的行改了也一样，不再跟渠道倍率走
    if (row)
      Object.assign(row, {
        unit: input.unit,
        inputPrice: input.inputPrice,
        outputPrice: input.outputPrice,
        cachedInputPrice,
        updatedAt: Date.now(),
        source: 'manual',
        sourceModelKey: null,
        multiplierApplied: null,
      } satisfies Partial<PointRate>);
    else {
      row = manualRate(vendorKey, modelName, input.unit, input.inputPrice, input.outputPrice, 0, cachedInputPrice);
      rates.push(row);
    }
    version++;
    return ok({ ...row });
  }

  async deleteRate(id: number): Promise<AppResult<true>> {
    await delay(120);
    const i = rates.findIndex((r) => r.id === id);
    if (i < 0) return fail({ code: 'unknown', message: '这一行价格已经不在了。' });
    const [gone] = rates.splice(i, 1);
    version++;
    // 删的是单独定的价：这个模型跟回渠道的倍率，当场给它算一行出来
    if (gone && gone.source === 'manual' && gone.vendorKey !== ANY) compile(gone.vendorKey);
    return ok(true);
  }

  async usageActions(query: UsageLogQuery, q: PageQuery): Promise<AppResult<Paged<UsageAction>>> {
    await delay();
    const logs = usageLogs
      .filter((l) => query.accountUid === undefined || l.accountUid === query.accountUid)
      .filter((l) => !query.purpose || l.purpose === query.purpose)
      .filter((l) => query.from === undefined || l.createdAt >= query.from)
      .filter((l) => query.to === undefined || l.createdAt < query.to);
    // 「结果」看的是一件事整条链扣没扣，归并以后再筛
    const rows = groupUsageActions(logs).filter((a) => !query.status || a.status === query.status);
    return ok(page(rows, q));
  }
}
