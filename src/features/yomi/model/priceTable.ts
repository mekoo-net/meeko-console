/**
 * 价格表的行形状：模型 · 类型 · 价格。
 *
 * 七种计量方式（token / 张 / 秒 / 分钟 / 字符 / 次 / 积分）的价格字段完全不同，但它们在表里只占一列：
 * 类型一列说这是 LLM 还是图像，价格列用 icon 摊开各档。单位不跟在后面——类型已经说明怎么计量。
 */
import type { BillingType, ModelCapabilities, ModelPrice, RateBody } from '@yomi/common';
import { PRICE_CURRENCY } from '@yomi/common';
import { formatMoney } from '@/shared/lib/money';

/**
 * 类型列短名。向量化也按 token 计，但不是对话：只收输入、没有出和缓存档，
 * 所以从 per_token 里拆出来单列「向量」，不跟 LLM 混。
 */
export type PriceModelKind = BillingType | 'embedding';

export const MODEL_KIND: Readonly<Record<PriceModelKind, { label: string; hint: string }>> = {
  per_token: { label: 'LLM', hint: '对话 / 文本 · 按 token' },
  embedding: { label: '向量', hint: '向量化 · 按输入 token' },
  per_image: { label: '图像', hint: '生图 · 按张' },
  per_video: { label: '视频', hint: '生视频 · 按秒' },
  per_audio_minute: { label: '音频', hint: '转写 · 按分钟' },
  per_character: { label: '语音', hint: '合成 · 按字符' },
  per_call: { label: '按次', hint: '按次调用' },
  per_credit: { label: '积分', hint: '按上游积分' },
};

/** 目录标了 embedding 就认；手加的没 capabilities，退回键名里带 embed。 */
export function isEmbeddingPrice(price: Pick<ModelPrice, 'modelKey' | 'capabilities'>): boolean {
  if (price.capabilities?.embedding === true) return true;
  if (price.capabilities != null) return false;
  return /embed/i.test(price.modelKey);
}

export function priceModelKind(price: ModelPrice): PriceModelKind {
  if (price.billingType === 'per_token' && isEmbeddingPrice(price)) return 'embedding';
  return price.billingType;
}

/**
 * 自定义有效价只能换「同一类产品」的出法：LLM 按量↔按次，生图只能改档位。
 * 不能把对话模型改成按张——那是另一种计量对象。
 *
 * 积分是例外：它不是一种模态，而是上游自己报的结算点数（生图、对话、视频都可能按积分收），
 * 所以向量以外的每一类都能改挂 per_credit；向量维持原约束，只认按 token。
 */
export function allowedManualBillingTypes(kind: PriceModelKind): readonly BillingType[] {
  switch (kind) {
    case 'per_token':
    case 'per_call':
      return ['per_token', 'per_call', 'per_credit'];
    case 'embedding':
      return ['per_token'];
    case 'per_credit':
      return ['per_credit'];
    default:
      return [kind, 'per_credit'];
  }
}

/** 种类以价格表为准；没有目录行时向量看 capabilities / 键名，其余按对话模型处理。 */
export function resolvePriceModelKind(input: {
  modelKey: string;
  catalogBillingType?: BillingType | null;
  capabilities?: ModelCapabilities | null;
}): PriceModelKind {
  const embedding = isEmbeddingPrice({
    modelKey: input.modelKey,
    capabilities: input.capabilities ?? null,
  });
  const catalog = input.catalogBillingType;
  if (catalog) {
    if (catalog === 'per_token' && embedding) return 'embedding';
    if (catalog === 'per_call') return 'per_token';
    return catalog;
  }
  return embedding ? 'embedding' : 'per_token';
}

export type PricePartKind =
  | 'input'
  | 'output'
  | 'cacheWrite'
  | 'cacheWrite1h'
  | 'cacheRead'
  | 'audioIn'
  | 'audioOut'
  | 'reasoning'
  | 'image'
  | 'video'
  | 'call'
  | 'credit';

export interface PricePart {
  /** tooltip 全文：入 / 出 / 1024x1024 hd。 */
  label: string;
  text: string;
  kind: PricePartKind;
  /** 图像 / 视频档位写在 icon 旁边（`1024² · HD`），LLM 的入出价只靠 icon。 */
  caption?: string;
  /** 这个数不是自己填的，是按契约兜底算出来的（缓存价留空按主价计），用占位色标。 */
  inherited?: boolean;
  /** 兜底是照什么算的；不写就是「同入价」。 */
  inheritedNote?: string;
}

/**
 * 1 小时档缓存写留空时，按 5 分钟档的价乘这个数（官方两档之比：输入价 × 2 与 × 1.25）。
 * 与后端 `RatioResolver.OneHourWriteOverFiveMinute` 是同一个数，改一边要改另一边。
 */
export const ONE_HOUR_WRITE_OVER_FIVE_MINUTE = 2 / 1.25;

export interface PriceDisplay {
  price: ModelPrice;
  kind: PriceModelKind;
  typeLabel: string;
  /**
   * 价格列的排布：一列最多两档，列内自上而下读。
   * per_token 排成「入 / 写」「出 / 读」两列，左右对照；向量化只留入价；生图按 (size, quality) 两个一列。
   */
  columns: PricePart[][];
  /** 档位之外的约束，如视频时长区间。 */
  note: string | null;
  /**
   * 图像 / 视频超过两档时，表里只显示区间，悬停再看全档。
   * 一两档仍直接摊开，不必再点。
   */
  compact: { min: string; max: string; count: number } | null;
}

/**
 * 有效价 / 基准价共用：一份 RateBody 摊成价格列。默认人民币（有效价）；价格表传 USD。
 *
 * `exact`：金额照实显示（见 {@link exactMoney}），不收成两位 / 四位。维护牌价的那一页用——
 * 那里的数是各产品算钱的依据，0.075 显示成 0.08 就是一个错的数。
 */
export function rateBodyDisplay(
  body: RateBody,
  embedding = false,
  currency: string = PRICE_CURRENCY,
  exact = false,
): Omit<PriceDisplay, 'price'> {
  const kind: PriceModelKind =
    embedding && body.billingType === 'per_token' ? 'embedding' : body.billingType;
  const money: MoneyStyle = { currency, exact };
  return {
    kind,
    typeLabel: MODEL_KIND[kind].label,
    columns: rateColumns(body, kind === 'embedding', money),
    note: rateNote(body),
    compact: compactTiers(body, money),
  };
}

export function priceDisplay(price: ModelPrice): PriceDisplay {
  return {
    price,
    ...rateBodyDisplay(price, priceModelKind(price) === 'embedding', price.currency),
  };
}

/** 金额怎么写：哪种币，照实还是收成固定位数。 */
interface MoneyStyle {
  currency: string;
  exact: boolean;
}

const exactFormatters = new Map<string, Intl.NumberFormat>();

/**
 * 照实显示的金额：至少两位小数，多的照实写，最多六位（后端的价也只存六位）。
 * 牌价里常有 0.075、0.0375 这样的数，固定两位会把它们抹成同一个数。
 */
export function exactMoney(v: number, currency: string): string {
  let fmt = exactFormatters.get(currency);
  if (!fmt) {
    fmt = new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    });
    exactFormatters.set(currency, fmt);
  }
  return fmt.format(v);
}

function m2(v: number, money: MoneyStyle): string {
  if (money.exact) return exactMoney(v, money.currency);
  return formatMoney(v, { currency: money.currency, fractionDigits: 2 });
}
function m4(v: number, money: MoneyStyle): string {
  if (money.exact) return exactMoney(v, money.currency);
  return formatMoney(v, { currency: money.currency, fractionDigits: 4 });
}

function rateColumns(body: RateBody, embedding: boolean, money: MoneyStyle): PricePart[][] {
  switch (body.billingType) {
    case 'per_token': {
      const { input, output } = body.rate;
      if (embedding) {
        return [[{ kind: 'input', label: '入', text: m2(input.perMToken, money) }]];
      }
      /** 缓存价留空 = 按入价计（后端 RatioResolver 同语义），所以显示入价并标继承，而不是省掉这一档。 */
      const cached = (kind: 'cacheWrite' | 'cacheRead', label: string, v: number | undefined): PricePart =>
        v == null
          ? { kind, label, text: m2(input.perMToken, money), inherited: true }
          : { kind, label, text: m2(v, money) };
      /**
       * 缓存写分两档，两档都列：5 分钟档留空按入价计；1 小时档留空按 5 分钟档 × 1.6 计（后端同语义）。
       * 推出来的数照样显示并标继承——它就是实扣用的价，省掉这一档等于把一个会收钱的价藏起来。
       */
      const write5m = input.cachedWrite ?? input.perMToken;
      const write1h: PricePart =
        input.cachedWrite1h == null
          ? {
              kind: 'cacheWrite1h',
              label: '写 1h',
              text: m2(write5m * ONE_HOUR_WRITE_OVER_FIVE_MINUTE, money),
              inherited: true,
              inheritedNote: '5m × 1.6',
            }
          : { kind: 'cacheWrite1h', label: '写 1h', text: m2(input.cachedWrite1h, money) };
      const left: PricePart[] = [
        { kind: 'input', label: '入', text: m2(input.perMToken, money) },
        cached('cacheWrite', '写 5m', input.cachedWrite),
        write1h,
      ];
      const right: PricePart[] = [
        { kind: 'output', label: '出', text: m2(output.perMToken, money) },
        cached('cacheRead', '读', input.cachedRead),
      ];
      if (input.audio != null) left.push({ kind: 'audioIn', label: '音频入', text: m2(input.audio, money) });
      if (output.audio != null) right.push({ kind: 'audioOut', label: '音频出', text: m2(output.audio, money) });
      if (output.reasoning != null) {
        right.push({ kind: 'reasoning', label: 'reasoning', text: m2(output.reasoning, money) });
      }
      return [left, right];
    }
    case 'per_call':
      return [[{ kind: 'call', label: '单价', text: m4(body.rate.pricePerCall, money) }]];
    case 'per_credit':
      return [[{ kind: 'credit', label: '每积分', text: m4(body.rate.pricePerCredit, money) }]];
    case 'per_image':
      return pairUp(
        body.rate.tiers.map((t) => ({
          kind: 'image' as const,
          label: `${t.size} ${t.quality}`,
          caption: imageCaption(t.size, t.quality),
          text: m4(t.pricePerImage, money),
        })),
      );
    case 'per_video':
      return pairUp(
        body.rate.tiers.map((t) => ({
          kind: 'video' as const,
          label: t.resolution,
          caption: t.resolution,
          text: m4(t.pricePerSecond, money),
        })),
      );
    case 'per_audio_minute':
      return [[{ kind: 'audioIn', label: '音频', text: m4(body.rate.pricePerMinute, money) }]];
    case 'per_character':
      return [[{ kind: 'audioOut', label: '语音', text: m4(body.rate.pricePerKChar, money) }]];
  }
}

/** 档位按两个一列切：生图的同尺寸相邻档正好落在同一列里。 */
function pairUp(parts: PricePart[]): PricePart[][] {
  const columns: PricePart[][] = [];
  for (let i = 0; i < parts.length; i += 2) columns.push(parts.slice(i, i + 2));
  return columns;
}

/** `1024x1024` → `1024²`，`1792x1024` → `1792×1024`；质量 standard/hd 缩成 std/HD。 */
export function imageCaption(size: string, quality: string): string {
  const m = /^(\d+)\s*[x×]\s*(\d+)$/i.exec(size.trim());
  const s = m ? (m[1] === m[2] ? `${m[1]}²` : `${m[1]}×${m[2]}`) : size;
  const q = compactQuality(quality);
  return q ? `${s} · ${q}` : s;
}

function compactQuality(q: string): string {
  const n = q.trim().toLowerCase();
  if (!n || n === 'default') return '';
  if (n === 'standard') return 'std';
  if (n === 'hd') return 'HD';
  return q;
}

function compactTiers(body: RateBody, money: MoneyStyle): { min: string; max: string; count: number } | null {
  if (body.billingType !== 'per_image' && body.billingType !== 'per_video') return null;
  const prices =
    body.billingType === 'per_image'
      ? body.rate.tiers.map((t) => t.pricePerImage)
      : body.rate.tiers.map((t) => t.pricePerSecond);
  if (prices.length <= 2) return null;
  return { min: m4(Math.min(...prices), money), max: m4(Math.max(...prices), money), count: prices.length };
}

function rateNote(body: RateBody): string | null {
  if (body.billingType !== 'per_video') return null;
  const { minSeconds, maxSeconds } = body.rate;
  if (minSeconds == null && maxSeconds == null) return null;
  if (minSeconds != null && maxSeconds != null) return `时长 ${minSeconds}–${maxSeconds} 秒`;
  return minSeconds != null ? `时长 ≥ ${minSeconds} 秒` : `时长 ≤ ${maxSeconds} 秒`;
}
