/**
 * 模型价格页的纯函数：一行怎么显示、改价怎么拼回去、没发布出去的怎么记、同步的对比怎么排。
 * 页面、弹窗和 mock 共用，免得同一件事在几处各算一遍。
 *
 * 价格怎么摊成列用的是 Yomi 那一套（`rateBodyDisplay`），只是金额照实显示：这一页的数是各产品算钱的依据。
 */
import {
  MODEL_PRICE_CURRENCY,
  makerLabel,
  rateBodySchema,
  type ModelCapabilities,
  type RateBody,
} from '@yomi/common';

import {
  exactMoney,
  rateBodyDisplay,
  type PriceDisplay,
  type PriceModelKind,
} from '@/features/yomi/model/priceTable';

import type { AppError } from '@/shared/api/httpTypes';

import {
  ALL_MAKERS,
  OWNER_MISMATCH,
  type ApplyPriceItem,
  type ModelPriceRow,
  type PriceCandidate,
  type PriceFetchItem,
  type PriceFetchResult,
  type PricePublishFailure,
  type PricePublishResult,
  type RateJson,
} from './ratecard.types';

/** 表里的行和同步来的候选共有的那几样：认类型、摊价格只看这些。 */
export interface PricedModel {
  modelKey: string;
  billingType: string;
  rate: RateJson;
  capabilities: ModelCapabilities | null;
}

// ---------- 读一行 ----------

/**
 * 一行的价读成认得的那七种形状；认不出（号池后台多了一种计价方式、旧行缺了必填的数）回 null。
 * 只拿来显示和填表单：它会把不认识的键丢掉，存回去要走 {@link mergeRate}。
 */
export function readRateBody(price: Pick<PricedModel, 'billingType' | 'rate'>): RateBody | null {
  const r = rateBodySchema.safeParse({ billingType: price.billingType, rate: price.rate });
  return r.success ? r.data : null;
}

function finite(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function section(rate: RateJson, key: string): Record<string, unknown> {
  const v = rate[key];
  return v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

/**
 * 这一行是不是向量模型（只收输入）。目录标了就听目录的；手工录的行没有能力信息，退回看键名里有没有 embed——
 * 但带着非零出价的不算：把一个有出价的模型当向量去改，表单会把它的出价存成 0。
 */
export function isEmbeddingRow(price: PricedModel): boolean {
  if (price.billingType !== 'per_token') return false;
  if (price.capabilities) return price.capabilities.embedding;
  const output = finite(section(price.rate, 'output').perMToken);
  return /embed/i.test(price.modelKey) && !(output !== null && output > 0);
}

/**
 * 交给改价表单的模型能力。表单在没有能力信息时会自己按键名猜是不是向量（不看出价），
 * 所以键名里带 embed 的行要把上面的结论明说给它，别让两边各猜各的。
 * 只给表单用，不往后端存：改价不带能力，号池后台留着这一行原来的。
 */
export function formCapabilities(price: PricedModel): ModelCapabilities | null {
  if (price.capabilities) return price.capabilities;
  if (!/embed/i.test(price.modelKey)) return null;
  return isEmbeddingRow(price)
    ? { audio: false, reasoning: false, embedding: true }
    : { audio: true, reasoning: true, embedding: false };
}

/** 新建向量模型时带给号池后台的能力：手加的行没有目录信息，带上它列表和各产品才认得这个模型只收输入。 */
export const EMBEDDING_CAPABILITIES: ModelCapabilities = {
  audio: false,
  reasoning: false,
  embedding: true,
};

/**
 * 新建模型时交给填价表单的能力。类型是人刚选的，名字里带 embed 的也照选的来：
 * 选了「文本」就明说不是向量，别让表单按键名把它当成只收入价的。
 */
export function newModelFormCapabilities(
  modelKey: string,
  embedding: boolean,
): ModelCapabilities | null {
  if (embedding) return EMBEDDING_CAPABILITIES;
  return /embed/i.test(modelKey) ? { audio: true, reasoning: true, embedding: false } : null;
}

const usd = (v: number): string => exactMoney(v, MODEL_PRICE_CURRENCY);

/**
 * 价格列里没有、但 OneApi 的 rate 里可以有的档：按 token 计价的图像入出价、按次计价的缓存命中价。
 * 写成字放在模型名下面——表里有个价，页面上不能看不见。
 */
export function extraPriceParts(price: Pick<PricedModel, 'billingType' | 'rate'>): string[] {
  const parts: string[] = [];
  if (price.billingType === 'per_token') {
    const imageIn = finite(section(price.rate, 'input').image);
    const imageOut = finite(section(price.rate, 'output').image);
    if (imageIn !== null) parts.push(`图像入 ${usd(imageIn)}`);
    if (imageOut !== null) parts.push(`图像出 ${usd(imageOut)}`);
  } else if (price.billingType === 'per_call') {
    const cached = finite(price.rate.cachedPricePerCall);
    if (cached !== null) parts.push(`缓存命中 ${usd(cached)}`);
  }
  return parts;
}

const SOURCE_LABEL: Readonly<Record<string, string>> = {
  models_dev: 'models.dev',
  openrouter: 'OpenRouter',
  litellm: 'LiteLLM',
  newapi: 'NewAPI',
};

/** 只标外部目录来的；手工录的价没有「来源」可说，回空串。 */
export function priceSourceLabel(source: string): string {
  return SOURCE_LABEL[source] ?? '';
}

export interface PriceRowView {
  price: ModelPriceRow;
  /** 认得出的价。认不出是 null：这一行照样列出来（要看得见、删得掉），只是不能拿表单去改。 */
  body: RateBody | null;
  kind: PriceModelKind | null;
  cells: Pick<PriceDisplay, 'kind' | 'columns' | 'compact'> | null;
  /** 模型名下面那一行小字：时长约束、价格列里没有的档、来源。 */
  hint: string;
}

export function priceRowView(price: ModelPriceRow): PriceRowView {
  const body = readRateBody(price);
  const display = body
    ? rateBodyDisplay(body, isEmbeddingRow(price), MODEL_PRICE_CURRENCY, true)
    : null;
  const hint = [display?.note, ...extraPriceParts(price), priceSourceLabel(price.source)]
    .filter(Boolean)
    .join(' · ');
  return { price, body, kind: display?.kind ?? null, cells: display, hint };
}

const KIND_UNIT: Readonly<Record<PriceModelKind, string>> = {
  per_token: '1M',
  embedding: '1M',
  per_image: '张',
  per_video: '秒',
  per_audio_minute: '分钟',
  per_character: '1K 字符',
  per_call: '次',
  per_credit: '积分',
};

/**
 * 一份价压成一行字，同步对比表里「当前 / 上游」两列用。只写填了的档：
 * 没填的档各产品按自己的规则兜底，两边都没填的不算差异，写出来反而像是有个数。
 */
export function priceSummary(price: PricedModel): string {
  const body = readRateBody(price);
  if (!body) return price.billingType;
  const display = rateBodyDisplay(body, isEmbeddingRow(price), MODEL_PRICE_CURRENCY, true);
  const unit = KIND_UNIT[display.kind];
  if (display.compact) {
    const { min, max, count } = display.compact;
    return `${count} 档 · ${min === max ? min : `${min}–${max}`} / ${unit}`;
  }
  const parts = display.columns.flat().filter((p) => !p.inherited);
  const main =
    parts.length === 1
      ? parts[0]!.text
      : parts.map((p) => `${p.caption ?? p.label} ${p.text}`).join(' · ');
  return [`${main} / ${unit}`, ...extraPriceParts(price)].join(' · ');
}

// ---------- 改价 ----------

/** 改价表单（Yomi 的 RateBodyForm）拼得出来的键，按计价方式分；按 token 计价的分 input / output 两段另列。 */
const FORM_KEYS: Readonly<
  Record<Exclude<RateBody['billingType'], 'per_token'>, readonly string[]>
> = {
  per_call: ['pricePerCall'],
  per_credit: ['pricePerCredit'],
  per_image: ['tiers'],
  per_video: ['tiers', 'minSeconds', 'maxSeconds'],
  per_audio_minute: ['pricePerMinute'],
  per_character: ['pricePerKChar'],
};
const FORM_INPUT_KEYS: readonly string[] = [
  'perMToken',
  'cachedRead',
  'cachedWrite',
  'cachedWrite1h',
  'audio',
];
const FORM_OUTPUT_KEYS: readonly string[] = ['perMToken', 'reasoning', 'audio'];

function without(
  source: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  const out = { ...source };
  for (const key of keys) delete out[key];
  return out;
}

/**
 * 把表单填出来的价拼回这一行原来的 rate 上：表单里有的键以表单为准（清空了的就拿掉），表单里没有的键原样留着。
 *
 * 表单是照 Yomi 那七种形状拼的，OneApi 的 rate 里还有它不认识的键（图像的入出价、按次的缓存命中价）。
 * 直接拿表单拼出来的那一份去存，改一下入价就把这些悄悄丢了。
 */
export function mergeRate(original: RateJson, draft: RateBody): RateJson {
  if (draft.billingType === 'per_token') {
    return {
      ...original,
      input: { ...without(section(original, 'input'), FORM_INPUT_KEYS), ...draft.rate.input },
      output: {
        ...without(section(original, 'output'), FORM_OUTPUT_KEYS),
        ...draft.rate.output,
      },
    };
  }
  return { ...without(original, FORM_KEYS[draft.billingType]), ...draft.rate };
}

/**
 * 有没有哪个主价是 0。表单留空就按 0 存，而牌价是 0 各产品就按免费算，保存之前得让人确认一下。
 * 向量模型的出价本来就是 0，不算。
 */
export function hasZeroPrice(body: RateBody, embedding = false): boolean {
  switch (body.billingType) {
    case 'per_token':
      return body.rate.input.perMToken === 0 || (!embedding && body.rate.output.perMToken === 0);
    case 'per_call':
      return body.rate.pricePerCall === 0;
    case 'per_credit':
      return body.rate.pricePerCredit === 0;
    case 'per_image':
      return body.rate.tiers.some((t) => t.pricePerImage === 0);
    case 'per_video':
      return body.rate.tiers.some((t) => t.pricePerSecond === 0);
    case 'per_audio_minute':
      return body.rate.pricePerMinute === 0;
    case 'per_character':
      return body.rate.pricePerKChar === 0;
  }
}

// ---------- 发布结果 ----------

/** 失败是哪一家的；`*` 是没到某一个厂家就失败了。 */
export function failureScope(failure: PricePublishFailure): string {
  return failure.maker === ALL_MAKERS ? '整张表' : makerLabel(failure.maker);
}

/**
 * 一次写操作（保存、删除、套用）之后，页面顶上记着的失败怎么变：
 * 这次发布成了的厂家划掉，这次没成的记上（同一家只留最新的原因）。
 *
 * 整张表的失败（`*`：连不上 NATS、读不到登记的主人）在这次真的发布出去了以后也划掉：发布这条路已经通了，
 * 之前没发出去的那几家号池后台自己会定时补上，提示再挂着就成了没人收的旧账。
 * 这次什么都没发布（没有碰到任何厂家）的不算——它说明不了路通没通。
 */
export function failuresAfterWrite(
  current: readonly PricePublishFailure[],
  result: PricePublishResult,
): PricePublishFailure[] {
  const byMaker = new Map(current.map((f) => [f.maker, f]));
  const published = result.written.length + result.deleted.length + result.unchanged > 0;
  if (result.ok && published) byMaker.delete(ALL_MAKERS);
  for (const maker of [...result.written, ...result.deleted]) byMaker.delete(maker);
  for (const failure of result.failures) byMaker.set(failure.maker, failure);
  return [...byMaker.values()];
}

/** 接管之后（整张表重新发布了一遍）：成了就全清，没成就换成这一次的。 */
export function failuresAfterTakeover(result: PricePublishResult): PricePublishFailure[] {
  return result.ok ? [] : result.failures;
}

/**
 * 没发出去是因为「这份表登记的主人是别的库」：号池后台自己重发多少次都是一样的结果，要人来接管才行。
 * 认号池后台给的码，不比对那句话——那句话是写给人看的，随时会改。
 */
export function needsTakeover(failures: readonly PricePublishFailure[]): boolean {
  return failures.some((f) => f.code === OWNER_MISMATCH);
}

// ---------- 接口报错 ----------

/** 号池后台把请求拒了（模型键不对、价格缺哪一项、套用的第几行不过）时它回的原因码：它拒的都是这一个。 */
export const VAULT_REJECTED = 'oneapi_vault_rejected';

/** 号池后台把它那句说明放在 `errors` 的这个键下。 */
const UPSTREAM_KEY = 'upstream';

/**
 * 一次失败给人看的那句话。
 *
 * 平台别处的失败一种原因一个码，界面上的话按码出；这一组接口不一样：拒掉请求的是号池后台，它拒的都是同一个码，
 * 「哪个模型键不对」「缺哪一项」只在它那句话里。只按码出的话，套用二十行有一行不过，页面上只有一句「提交的内容有误」。
 * 所以是号池后台拒的，就把它的话摆出来；别的失败（号池后台不在线时平台网关回的 502 / 503、没权限）照旧出通用的那句。
 */
export function failureText(error: Pick<AppError, 'message' | 'reason' | 'details'>): string {
  if (error.reason !== VAULT_REJECTED || !error.details) return error.message;
  const said = Object.entries(error.details).flatMap(([field, messages]) =>
    messages
      .filter((m) => m.trim() !== '')
      // 请求体绑不上时是逐字段的错，带上是哪个字段；整句的说明前面不用加什么
      .map((m) => (field === UPSTREAM_KEY ? m : `${field}：${m}`)),
  );
  return said.length > 0 ? said.join('；') : error.message;
}

// ---------- 上游同步 ----------

export type SyncStatus = 'new' | 'changed' | 'same';

export interface SyncRow {
  item: PriceFetchItem;
  /** 用哪一条候选：号池后台排在最前的那条。 */
  candidate: PriceCandidate;
  status: SyncStatus;
  currentText: string;
  candidateText: string;
}

/** 拉回来的候选排成对比表的行；一条候选都没有的模型不列。 */
export function syncRows(result: PriceFetchResult): SyncRow[] {
  const rows: SyncRow[] = [];
  for (const item of result.items) {
    const candidate = item.candidates[0];
    if (!candidate) continue;
    rows.push({
      item,
      candidate,
      status: !item.current ? 'new' : candidate.sameAsCurrent ? 'same' : 'changed',
      currentText: item.current ? priceSummary(item.current) : '—',
      candidateText: priceSummary({
        modelKey: item.modelKey,
        billingType: candidate.billingType,
        rate: candidate.rate,
        capabilities: candidate.capabilities,
      }),
    });
  }
  return rows;
}

/** 打开时默认勾上的：有差异的都勾，不要的自己去掉；和表里一致的不能勾。 */
export function defaultPicked(rows: readonly SyncRow[]): Set<string> {
  return new Set(rows.filter((r) => r.status !== 'same').map((r) => r.item.modelKey));
}

/** 勾上的行变成套用的请求。候选的 rate 已经是美元，原样回传；目录给的能力一起带回去，后端就不用再从 rate 里猜。 */
export function applyItems(
  rows: readonly SyncRow[],
  picked: ReadonlySet<string>,
): ApplyPriceItem[] {
  return rows
    .filter((r) => r.status !== 'same' && picked.has(r.item.modelKey))
    .map((r) => ({
      modelKey: r.item.modelKey,
      maker: r.candidate.maker || r.item.maker,
      billingType: r.candidate.billingType,
      rate: r.candidate.rate,
      sourceKind: r.candidate.sourceKind,
      sourceRef: r.candidate.sourceRef,
      ...(r.candidate.capabilities ? { capabilities: r.candidate.capabilities } : {}),
    }));
}
