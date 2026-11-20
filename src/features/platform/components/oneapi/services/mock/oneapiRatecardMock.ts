/**
 * 模型价格的 mock：一张记在内存里的表，增删改、同步、接管都有副作用，
 * 不连后端也能把这一页整套点一遍。刷新页面回到种子数据。种子和规矩借自号池管理台原来的那份 mock。
 *
 * 和号池后台一样的地方：带行号是改那一行（键不动、行号不存在是没找到），不带行号才按干净名录入；
 * 同步先整批验完再动表；每个写操作带发布结果；
 * 发布是拿表里的和「发布着的那一份」比，不一样的才写。
 * 简化的地方：厂家只按模型键猜，rate 只按那七种形状查。
 *
 * 想看平时碰不到的两种情况，把模型建在这两个厂家下面：
 * - `fail-demo`：这个厂家的发布总是失败（存了但没发布出去）；
 * - `owner-demo`：写进这个厂家以后，这份表登记的主人变成别的库，之后的写操作一律发布不出去，直到点「接管发布」。
 */
import {
  MAKER_OTHER,
  canonicalizeModelKey,
  compactModelKey,
  compareMakers,
  normalizeMaker,
  rateBodySchema,
  type ModelCapabilities,
} from '@yomi/common';

import { fail, ok, type AppFail, type AppResult } from '@/shared/api/httpTypes';
import { delay } from '@/shared/lib/delay';

import {
  ALL_MAKERS,
  OWNER_MISMATCH,
  type ApplyPriceItem,
  type ModelPriceRow,
  type PriceApplyResult,
  type PriceCandidate,
  type PriceDeleteResult,
  type PriceFetchItem,
  type PriceFetchResult,
  type PriceMakerGroup,
  type PricePublishFailure,
  type PricePublishResult,
  type PriceWriteResult,
  type RateJson,
  type UpsertPriceInput,
} from '../../model/ratecard.types';
import { VAULT_REJECTED } from '../../model/ratecard';
import type { OneApiRatecardPort } from '../ports/oneapiRatecardPort';

export const MOCK_FAIL_MAKER = 'fail-demo';
export const MOCK_OWNER_MAKER = 'owner-demo';

const DAY = 86_400_000;

// ---------- 种子 ----------
// 一份「上游目录」加一张「表」：inTable=false 的只在上游有（同步时是新增），
// upstream 给了的是上游已经改过价（同步时是变价），upstream=null 的上游没有（手工录的行）。

interface PriceBody {
  billingType: string;
  rate: RateJson;
}

interface Seed {
  maker: string;
  modelKey: string;
  body: PriceBody;
  capabilities?: ModelCapabilities;
  inTable?: boolean;
  upstream?: PriceBody | null;
}

const LLM: ModelCapabilities = { audio: false, reasoning: true, embedding: false };

function perToken(
  input: number,
  output: number,
  extra: {
    cachedRead?: number;
    cachedWrite?: number;
    cachedWrite1h?: number;
    image?: number;
  } = {},
): PriceBody {
  const { image, ...cache } = extra;
  return {
    billingType: 'per_token',
    rate: {
      input: { perMToken: input, ...cache },
      output: image === undefined ? { perMToken: output } : { perMToken: output, image },
    },
  };
}

const SEEDS: readonly Seed[] = [
  {
    maker: 'openai',
    modelKey: 'gpt-5.2',
    body: perToken(1.25, 10, { cachedRead: 0.125 }),
    capabilities: LLM,
  },
  {
    maker: 'openai',
    modelKey: 'gpt-5-mini',
    capabilities: LLM,
    body: perToken(0.25, 2, { cachedRead: 0.025 }),
    upstream: perToken(0.3, 2.4, { cachedRead: 0.03 }),
  },
  {
    maker: 'openai',
    modelKey: 'gpt-5.2-pro',
    body: perToken(21, 168),
    capabilities: LLM,
    inTable: false,
  },
  {
    maker: 'openai',
    modelKey: 'text-embedding-3-large',
    body: perToken(0.13, 0),
    capabilities: { audio: false, reasoning: false, embedding: true },
  },
  {
    maker: 'openai',
    modelKey: 'gpt-image-1',
    upstream: null,
    body: {
      billingType: 'per_image',
      rate: {
        tiers: [
          { size: '1024x1024', quality: 'low', pricePerImage: 0.011 },
          { size: '1024x1024', quality: 'medium', pricePerImage: 0.042 },
          { size: '1024x1024', quality: 'high', pricePerImage: 0.167 },
          { size: '1536x1024', quality: 'high', pricePerImage: 0.25 },
        ],
      },
    },
  },
  {
    maker: 'openai',
    modelKey: 'sora-2',
    upstream: null,
    body: {
      billingType: 'per_video',
      rate: {
        tiers: [
          { resolution: '720p', pricePerSecond: 0.1 },
          { resolution: '1080p', pricePerSecond: 0.3 },
        ],
        minSeconds: 4,
        maxSeconds: 12,
      },
    },
  },
  {
    maker: 'openai',
    modelKey: 'whisper-1',
    upstream: null,
    body: { billingType: 'per_audio_minute', rate: { pricePerMinute: 0.006 } },
  },
  {
    maker: 'openai',
    modelKey: 'tts-1',
    upstream: null,
    body: { billingType: 'per_character', rate: { pricePerKChar: 0.015 } },
  },

  {
    maker: 'anthropic',
    modelKey: 'claude-opus-4-8',
    capabilities: LLM,
    body: perToken(5, 25, { cachedRead: 0.5, cachedWrite: 6.25, cachedWrite1h: 10 }),
  },
  {
    maker: 'anthropic',
    modelKey: 'claude-sonnet-4-6',
    capabilities: LLM,
    body: perToken(3, 15, { cachedRead: 0.3, cachedWrite: 3.75, cachedWrite1h: 6 }),
  },
  {
    maker: 'anthropic',
    modelKey: 'claude-haiku-4-5',
    capabilities: LLM,
    body: perToken(0.8, 4, { cachedRead: 0.08, cachedWrite: 1 }),
    upstream: perToken(1, 5, { cachedRead: 0.1, cachedWrite: 1.25, cachedWrite1h: 2 }),
  },
  // 同一个模型的两行：干净名的，和一行带日期钉的旧键（导入不收干净名，从 Yomi 搬过来的表里会有这种）。
  // 留着这一对是为了能点出「改带日期钉的那行，改到的必须是它自己、不是干净名那行」。
  {
    maker: 'anthropic',
    modelKey: 'claude-3-haiku',
    body: perToken(0.25, 1.25, { cachedRead: 0.03, cachedWrite: 0.3 }),
    capabilities: LLM,
  },
  {
    maker: 'anthropic',
    modelKey: 'claude-3-haiku-20240307',
    upstream: null,
    body: perToken(0.25, 1.25),
  },

  {
    maker: 'google',
    modelKey: 'gemini-2.5-pro',
    body: perToken(1.25, 10, { cachedRead: 0.125 }),
    capabilities: LLM,
  },
  {
    maker: 'google',
    modelKey: 'gemini-2.5-flash',
    body: perToken(0.3, 2.5, { cachedRead: 0.03 }),
    capabilities: LLM,
  },
  // 带着改价表单里没有的档（图像出价）：改它别的价，这一档不能丢
  {
    maker: 'google',
    modelKey: 'gemini-2.5-flash-image',
    body: perToken(0.3, 2.5, { image: 30 }),
    capabilities: LLM,
  },
  {
    maker: 'google',
    modelKey: 'gemini-2.5-flash-lite',
    body: perToken(0.1, 0.4, { cachedRead: 0.01 }),
    capabilities: LLM,
    inTable: false,
  },

  {
    maker: 'deepseek',
    modelKey: 'deepseek-chat',
    body: perToken(0.28, 0.42, { cachedRead: 0.028 }),
    capabilities: LLM,
  },

  {
    maker: 'novelai',
    modelKey: 'nai-diffusion-4-5-full',
    upstream: null,
    body: { billingType: 'per_credit', rate: { pricePerCredit: 0.002 } },
  },
  {
    maker: MAKER_OTHER,
    modelKey: 'acme-search',
    upstream: null,
    body: { billingType: 'per_call', rate: { pricePerCall: 0.005 } },
  },
];

// ---------- 内存里的那张表 ----------

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

interface MockState {
  rows: ModelPriceRow[];
  nextId: number;
  /** 发布着的那一份：厂家 → 这一家的行（序列化以后的），发布就是拿表里的和它比。 */
  published: Map<string, string>;
  /** 这份表登记的主人是不是别的库。是的话发布一律不写，直到接管。 */
  ownedByOther: boolean;
}

function makerDocument(rows: readonly ModelPriceRow[], maker: string): string | null {
  const items = rows
    .filter((r) => r.maker === maker)
    .sort((a, b) => a.modelKey.localeCompare(b.modelKey))
    .map((r) => ({
      modelKey: r.modelKey,
      billingType: r.billingType,
      rate: r.rate,
      capabilities: r.capabilities,
    }));
  return items.length > 0 ? JSON.stringify(items) : null;
}

function seedState(): MockState {
  const startedAt = Date.now();
  let nextId = 1;
  const rows = SEEDS.filter((s) => s.inTable !== false).map((s, index): ModelPriceRow => {
    const official = s.upstream !== null;
    const at = startedAt - (index + 2) * DAY;
    return {
      id: String(nextId++),
      modelKey: s.modelKey,
      maker: s.maker,
      billingType: s.body.billingType,
      rate: clone(s.body.rate),
      currency: 'USD',
      capabilities: s.capabilities ? { ...s.capabilities } : null,
      source: official ? 'models_dev' : 'manual',
      sourceRef: official ? `${s.maker}/${s.modelKey}` : null,
      fetchedAtUtc: official ? at : null,
      effectiveFromUtc: at,
    };
  });

  const published = new Map<string, string>();
  for (const maker of new Set(rows.map((r) => r.maker)))
    published.set(maker, makerDocument(rows, maker)!);

  return { rows, nextId, published, ownedByOther: false };
}

let state: MockState = seedState();

/** 测试用：回到种子数据。 */
export function _resetOneApiRatecardMock(): void {
  state = seedState();
}

// ---------- 归一、校验 ----------

// 照真的来：拒掉请求的是号池后台，它回的失败到了界面上，那句话是按种类出的通用文案，
// 号池后台自己的说明在 errors 的 upstream 键下——页面要是只显示 message，在 mock 里就看得出来漏了。
const rejected = (code: 'validation' | 'not_found', generic: string, said: string): AppFail =>
  fail({ code, message: generic, reason: VAULT_REJECTED, details: { upstream: [said] } });
const invalid = (message: string): AppFail => rejected('validation', '提交的内容有误', message);
const notFound = (message: string): AppFail => rejected('not_found', '没有找到', message);

/** 表里和这个键是同一个模型的那一行：键全等，或者去掉横线点号以后相等（claude-opus-4.8 对 claude-opus-4-8）。 */
function findByKey(key: string): ModelPriceRow | undefined {
  const exact = state.rows.find((r) => r.modelKey === key);
  if (exact) return exact;
  const compact = compactModelKey(key);
  return compact ? state.rows.find((r) => compactModelKey(r.modelKey) === compact) : undefined;
}

/** 照那七种形状查 rate；不过回一句话，过了回 null。 */
function rateProblem(billingType: string, rate: unknown): string | null {
  const r = rateBodySchema.safeParse({ billingType, rate });
  if (r.success) return null;
  const issue = r.error.issues[0];
  const where = issue && issue.path.length > 0 ? issue.path.join('.') : 'billingType';
  return `价格格式不对（${where}）`;
}

interface WriteInput {
  modelKey: string;
  maker: string;
  billingType: string;
  rate: RateJson;
  capabilities?: ModelCapabilities | null;
  source?: string | null;
  sourceRef?: string | null;
  fetchedAtUtc?: number | null;
  effectiveFromUtc?: number | null;
}

/**
 * 写进表里（已经验过）。`target` 给了就是改那一行，没给是新加一行。
 * 碰到的厂家记进 `touched`：改了厂家的，原来那一家发布出去的也要跟着变。
 */
function write(
  input: WriteInput,
  touched: Set<string>,
  target: ModelPriceRow | undefined,
): ModelPriceRow {
  const row: ModelPriceRow = {
    id: target?.id ?? String(state.nextId++),
    modelKey: input.modelKey,
    maker: input.maker,
    billingType: input.billingType,
    rate: clone(input.rate),
    currency: 'USD',
    // 改价不带能力时留着这一行原来的
    capabilities: input.capabilities ?? target?.capabilities ?? null,
    source: input.source?.trim().toLowerCase() || 'manual',
    sourceRef: input.sourceRef?.trim() || null,
    fetchedAtUtc: input.fetchedAtUtc ?? null,
    effectiveFromUtc: input.effectiveFromUtc ?? Date.now(),
  };
  if (target) {
    touched.add(target.maker);
    state.rows[state.rows.indexOf(target)] = row;
  } else {
    state.rows.push(row);
  }
  touched.add(row.maker);
  if (row.maker === MOCK_OWNER_MAKER) state.ownedByOther = true;
  return row;
}

// ---------- 发布 ----------

const OWNER_FAILURE: PricePublishFailure = {
  maker: ALL_MAKERS,
  error:
    'mock：这份价格表登记的主人是「pg-old:5432/vault」，号池后台现在连的库是「pg-new:5432/vault」，没有发布。确实要由这个库接管，用「接管发布」再发布一次。',
  code: OWNER_MISMATCH,
};

/** 把这几个厂家和发布着的对一遍：不一样的写，表里一行都不剩的撤下，一样的不动。 */
function publishMakers(makers: Iterable<string>): PricePublishResult {
  const result: PricePublishResult = {
    ok: true,
    written: [],
    deleted: [],
    unchanged: 0,
    failures: [],
  };
  const list = [...new Set(makers)];
  if (list.length === 0) return result;
  if (state.ownedByOther) return { ...result, ok: false, failures: [OWNER_FAILURE] };

  for (const maker of list) {
    if (maker === MOCK_FAIL_MAKER) {
      result.failures.push({ maker, error: 'mock：模拟这个厂家发布失败。' });
      continue;
    }
    const doc = makerDocument(state.rows, maker);
    if (doc === null) {
      if (state.published.delete(maker)) result.deleted.push(maker);
    } else if (state.published.get(maker) === doc) {
      result.unchanged += 1;
    } else {
      state.published.set(maker, doc);
      result.written.push(maker);
    }
  }
  result.ok = result.failures.length === 0;
  return result;
}

/** 接管：登记改回本库，再把整张表和发布着的对一遍（攒着没发出去的这时一起发）。 */
function takeOver(): PricePublishResult {
  state.ownedByOther = false;
  // 发布着的厂家也要算进来：表里已经没有行的厂家，只有从这边才看得见、才撤得掉
  return publishMakers([...state.rows.map((r) => r.maker), ...state.published.keys()]);
}

// ---------- 端口 ----------

export class OneApiRatecardMock implements OneApiRatecardPort {
  async listByMaker(input: { keyword: string }): Promise<AppResult<PriceMakerGroup[]>> {
    await delay();
    const keyword = input.keyword.trim().toLowerCase();
    const byMaker = new Map<string, ModelPriceRow[]>();
    for (const row of state.rows) {
      if (
        keyword &&
        !row.modelKey.includes(keyword) &&
        !row.sourceRef?.toLowerCase().includes(keyword)
      )
        continue;
      const list = byMaker.get(row.maker) ?? [];
      list.push(clone(row));
      byMaker.set(row.maker, list);
    }
    return ok(
      [...byMaker.entries()]
        .sort(([a], [b]) => compareMakers(a, b))
        .map(([maker, items]) => ({
          maker,
          items: items.sort((a, b) => a.modelKey.localeCompare(b.modelKey)),
        })),
    );
  }

  async find(modelKey: string): Promise<AppResult<ModelPriceRow | null>> {
    await delay();
    const key = canonicalizeModelKey(modelKey);
    const row = key ? findByKey(key) : undefined;
    return ok(row ? clone(row) : null);
  }

  async upsert(input: UpsertPriceInput): Promise<AppResult<PriceWriteResult>> {
    await delay();
    let target: ModelPriceRow | undefined;
    let modelKey: string;
    if (input.id !== undefined) {
      // 带行号：改的就是那一行，键原样不动——请求里的 modelKey 不拿来找行，也不把行改名
      target = state.rows.find((r) => r.id === input.id);
      if (!target) return notFound(`没有行号是 ${input.id} 的牌价`);
      modelKey = target.modelKey;
    } else {
      // 不带行号：键先收成干净名，表里已经有这个名字（或者它的另一种写法）就改那一行，没有就加
      modelKey = canonicalizeModelKey(input.modelKey);
      if (!modelKey) return invalid('模型名不能为空');
      target = findByKey(modelKey);
    }
    const problem = rateProblem(input.billingType, input.rate);
    if (problem) return invalid(problem);

    const touched = new Set<string>();
    const row = write(
      {
        modelKey,
        maker: normalizeMaker(input.maker, modelKey),
        billingType: input.billingType,
        rate: input.rate,
        capabilities: input.capabilities,
      },
      touched,
      target,
    );
    return ok({ price: clone(row), publish: publishMakers(touched) });
  }

  async remove(id: string): Promise<AppResult<PriceDeleteResult>> {
    await delay();
    const row = state.rows.find((r) => r.id === id);
    if (!row) return notFound(`没有行号是 ${id} 的牌价`);
    state.rows = state.rows.filter((r) => r !== row);
    return ok({ id, publish: publishMakers([row.maker]) });
  }

  async fetchCandidates(input: { maker: string | null }): Promise<AppResult<PriceFetchResult>> {
    await delay();
    const only = input.maker?.trim().toLowerCase() || null;
    const items: PriceFetchItem[] = [];
    for (const seed of SEEDS) {
      if (seed.upstream === null) continue;
      if (only && seed.maker !== only) continue;
      const offered = seed.upstream ?? seed.body;
      const current = findByKey(seed.modelKey) ?? null;
      const candidate: PriceCandidate = {
        sourceKind: 'models_dev',
        sourceName: 'models.dev',
        sourceRef: `${seed.maker}/${seed.modelKey}`,
        maker: seed.maker,
        modelId: seed.modelKey,
        matchKind: 'exact',
        billingType: offered.billingType,
        rate: clone(offered.rate),
        sourceCurrency: 'USD',
        fxApplied: 1,
        sameAsCurrent:
          current !== null &&
          current.billingType === offered.billingType &&
          JSON.stringify(current.rate) === JSON.stringify(offered.rate),
        capabilities: seed.capabilities ? { ...seed.capabilities } : null,
      };
      items.push({
        modelKey: seed.modelKey,
        maker: current?.maker ?? seed.maker,
        current: current ? clone(current) : null,
        candidates: [candidate],
      });
    }
    items.sort((a, b) => compareMakers(a.maker, b.maker) || a.modelKey.localeCompare(b.modelKey));
    return ok({
      sources: [
        {
          kind: 'models_dev',
          name: 'models.dev',
          ok: true,
          error: null,
          candidateCount: items.length,
          elapsedMs: 420,
        },
      ],
      items,
      fetchedAtUtc: Date.now(),
    });
  }

  async applyCandidates(items: ApplyPriceItem[]): Promise<AppResult<PriceApplyResult>> {
    await delay();
    // 先整批验完再动表：任何一行不过整批都不写
    const inputs: WriteInput[] = [];
    const seen = new Set<string>();
    for (const item of items) {
      const modelKey = canonicalizeModelKey(item.modelKey);
      if (!modelKey) return invalid('模型名不能为空');
      const problem = rateProblem(item.billingType, item.rate);
      if (problem) return invalid(`${modelKey}：${problem}`);
      if (seen.has(modelKey)) return invalid(`${modelKey}：这一批里重复了`);
      seen.add(modelKey);
      inputs.push({
        modelKey,
        maker: normalizeMaker(item.maker, modelKey),
        billingType: item.billingType,
        rate: item.rate,
        capabilities: item.capabilities,
        source: item.sourceKind,
        sourceRef: item.sourceRef,
        fetchedAtUtc: item.sourceKind ? Date.now() : null,
      });
    }

    const touched = new Set<string>();
    let added = 0;
    let updated = 0;
    for (const input of inputs) {
      const target = findByKey(input.modelKey);
      write(input, touched, target);
      if (target) updated += 1;
      else added += 1;
    }
    return ok({ added, updated, publish: publishMakers(touched) });
  }

  async takeover(): Promise<AppResult<PricePublishResult>> {
    await delay();
    return ok(takeOver());
  }
}
