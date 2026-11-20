import type { ModelCategory, PointTxn, PointTxnKind, RateUnit } from './jastalk.types';

const pointsFormat = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** 积分最多两位小数，尾零去掉。 */
export function formatPoints(value: number): string {
  return pointsFormat.format(value);
}

const priceFormat = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 6 });

/** 单价可能很小（每秒 0.02 积分），最多留六位。 */
export function formatPrice(value: number): string {
  return priceFormat.format(value);
}

/** 账户 UID 输入框里的字：空着是不筛，数字是那个 uid，别的不认。 */
export function parseAccountUid(raw: string): { ok: true; value: number | undefined } | { ok: false } {
  const text = raw.trim();
  if (!text) return { ok: true, value: undefined };
  return /^\d+$/.test(text) ? { ok: true, value: Number(text) } : { ok: false };
}

export const categoryLabels: Readonly<Record<ModelCategory, string>> = {
  chat: '对话',
  image: '生图',
  tts: '语音合成',
  stt: '语音听写',
  embed: '向量',
  rerank: '重排',
};

/** 每一类按什么算：价格表里那一行的单位得和它一样，这个模型才算有价格。 */
export const categoryUnits: Readonly<Record<ModelCategory, RateUnit>> = {
  chat: 'token',
  embed: 'token',
  rerank: 'token',
  image: 'image',
  tts: 'audio_second',
  stt: 'audio_second',
};

export const unitLabels: Readonly<Record<RateUnit, string>> = {
  token: '按 token',
  image: '按张',
  audio_second: '按秒',
};

/** 单价后面跟的单位。 */
export const unitPer: Readonly<Record<RateUnit, string>> = {
  token: '/ 百万 token',
  image: '/ 张',
  audio_second: '/ 秒',
};

/** 一行价格写成一句话：按 token 的分输入输出，按张的只有输出价，按秒的两个都可能有。 */
export function describePrice(unit: RateUnit, inputPrice: number, outputPrice: number): string {
  if (unit === 'token') return `输入 ${formatPrice(inputPrice)} · 输出 ${formatPrice(outputPrice)} ${unitPer.token}`;
  if (unit === 'image') return `${formatPrice(outputPrice)} ${unitPer.image}`;
  const parts: string[] = [];
  if (outputPrice > 0 || inputPrice === 0) parts.push(`合成 ${formatPrice(outputPrice)}`);
  if (inputPrice > 0) parts.push(`听写 ${formatPrice(inputPrice)}`);
  return `${parts.join(' · ')} ${unitPer.audio_second}`;
}

export const txnKindLabels: Readonly<Record<PointTxnKind, string>> = {
  exchange: '兑换',
  grant: '发放',
  deduct: '调减',
  hold: '冻结',
  charge: '扣除',
  release: '退回',
};

/** 这一笔让「可用」多了还是少了：冻结、扣除、调减是少，其余是多。扣除是从冻结里结的，可用其实没动，单独标。 */
export function txnDirection(kind: PointTxnKind): 'in' | 'out' | 'settle' {
  if (kind === 'charge') return 'settle';
  return kind === 'hold' || kind === 'deduct' ? 'out' : 'in';
}

export function txnAmountText(txn: Pick<PointTxn, 'kind' | 'amount'>): string {
  const direction = txnDirection(txn.kind);
  return `${direction === 'in' ? '+' : '−'}${formatPoints(txn.amount)}`;
}

export const sourceKindLabels: Readonly<Record<PointTxn['source']['kind'], string>> = {
  usage: '调用',
  order: '兑换单',
  staff: '员工',
};

/** 用在哪样功能上（网关报上来的 purpose）。不认识的原样显示。 */
export const purposeLabels: Readonly<Record<string, string>> = {
  chat: '聊天回复',
  group: '群聊',
  memory: '提炼记忆',
  moment: '朋友圈',
  cardDraft: '写卡',
  theme: '主题设计',
  proactive: '主动消息',
  schedule: '定时消息',
  channel: '外部渠道',
  assist: 'AI 助手',
};

export function purposeLabel(purpose: string): string {
  return purposeLabels[purpose] ?? purpose;
}

/** 哪一类调用（用量明细里每一条的 kind）。 */
export const usageKindLabels: Readonly<Record<string, string>> = {
  chat: '对话',
  embedding: '向量',
  rerank: '重排',
  image: '生图',
  speech: '语音合成',
  transcription: '语音听写',
};

export function usageKindLabel(kind: string): string {
  return usageKindLabels[kind] ?? kind;
}
