/**
 * per_credit 日志的用量展示。列表「用量」列和详情抽屉都要用，放一处免得两边各写一套 switch。
 *
 * 扣费只看 `credits × pricePerCredit`；`detail` 是底下那次调用的原始用量（形状同该模态自己的计费口径），
 * 只供观测 / 对账，不参与计费。
 */
import type { PerCreditUsage, PerCreditUsageDetailKind } from '@yomi/common';

/**
 * 积分按原值显示：上游会报 0.028 这种小数，取整或补零都会让人以为扣错了。
 * 6 位与计费精度（BILLING_FRACTION_DIGITS）一致，不用 String()——大数要千分位。
 */
export function formatCredits(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 6 });
}

export const CREDIT_DETAIL_KIND_LABEL: Readonly<Record<PerCreditUsageDetailKind, string>> = {
  image: '生图',
  token: '对话',
  embedding: '向量化',
  audio: '音频',
  video: '视频',
  character: '字符',
  none: '无',
};

export interface CreditDetailRow {
  label: string;
  value: string;
  /** 尺寸这类标识走等宽，数字走 tabular。 */
  mono?: boolean;
}

const int = (n: number): string => n.toLocaleString();

/** 抽屉里「原始用量」那几行。没有明细（none / detail 为空）时返回空数组，抽屉整块不画。 */
export function creditDetailRows(u: PerCreditUsage): CreditDetailRow[] {
  switch (u.detailKind) {
    case 'none':
      return [];
    case 'image': {
      const d = u.detail;
      if (!d) return [];
      return [
        { label: '张数', value: int(d.count) },
        { label: '尺寸', value: d.tier.size || '—', mono: true },
        { label: '画质', value: d.tier.quality || '—' },
      ];
    }
    case 'token':
    case 'embedding': {
      const d = u.detail;
      if (!d) return [];
      // 零值维度不列：向量化根本没有出，对话多数没有音频，一排 0 只是噪音。输入始终保留。
      const rows: CreditDetailRow[] = [{ label: '输入', value: `${int(d.input.tokens)} tok` }];
      // 叫法与调用详情的计费明细一致：输入 / 缓存写 / 缓存读 / 语音输入，输出 / 推理 / 语音。
      const optional: [string, number][] = [
        ['缓存写', d.input.cachedWriteTokens],
        ['缓存读', d.input.cachedReadTokens],
        ['语音输入', d.input.audioTokens],
        ['输出', d.output.tokens],
        ['推理', d.output.reasoningTokens],
        ['语音', d.output.audioTokens],
      ];
      for (const [label, n] of optional) {
        if (n > 0) rows.push({ label, value: `${int(n)} tok` });
      }
      return rows;
    }
    case 'audio':
      return u.detail ? [{ label: '时长', value: `${u.detail.minutes.toLocaleString()} 分钟` }] : [];
    case 'video': {
      const d = u.detail;
      if (!d) return [];
      return [
        { label: '分辨率', value: d.tier.resolution || '—' },
        { label: '时长', value: `${d.seconds.toLocaleString()} 秒` },
      ];
    }
    case 'character':
      return u.detail ? [{ label: '字符数', value: int(u.detail.characters) }] : [];
  }
}

/** 列表「用量」列的副标题：一行说清原始用量；没有明细时为空串。 */
export function creditDetailSummary(u: PerCreditUsage): string {
  switch (u.detailKind) {
    case 'none':
      return '';
    case 'image': {
      const d = u.detail;
      if (!d) return '';
      return [`${d.count} 张`, d.tier.size, d.tier.quality].filter(Boolean).join(' · ');
    }
    case 'token':
      return u.detail
        ? `入 ${int(u.detail.input.tokens)} · 出 ${int(u.detail.output.tokens)}`
        : '';
    case 'embedding':
      return u.detail ? `入 ${int(u.detail.input.tokens)}` : '';
    case 'audio':
      return u.detail ? `${u.detail.minutes} min` : '';
    case 'video':
      return u.detail ? [`${u.detail.seconds}s`, u.detail.tier.resolution].filter(Boolean).join(' · ') : '';
    case 'character':
      return u.detail ? `${int(u.detail.characters)} 字符` : '';
  }
}
