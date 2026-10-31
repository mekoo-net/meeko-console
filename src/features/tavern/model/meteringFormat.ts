/**
 * 计量页共用的展示与查询辅助。
 */
import { toLocalDateTimeValue } from '@/shared/lib/date';
import { dateRangeToEpochMillis } from '@/shared/lib/epoch';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 与后端校验一致：超出就会被拒，提前在页面上拦。 */
export const MAX_RANGE_DAYS = 31;

export function last24h(): [string, string] {
  const now = new Date();
  return [toLocalDateTimeValue(new Date(now.getTime() - DAY_MS)), toLocalDateTimeValue(now)];
}

export type RangeCheck = { ok: true; fromUtc: number; toUtc: number } | { ok: false; message: string };

export function checkRange(range: [string, string] | null | undefined): RangeCheck {
  const { fromUtc, toUtc } = dateRangeToEpochMillis(range);
  if (fromUtc == null || toUtc == null || !Number.isFinite(fromUtc) || !Number.isFinite(toUtc)) {
    return { ok: false, message: `请先选择时间范围（最长 ${MAX_RANGE_DAYS} 天）` };
  }
  if (toUtc <= fromUtc) return { ok: false, message: '结束时间要晚于开始时间' };
  if (toUtc - fromUtc > MAX_RANGE_DAYS * DAY_MS) {
    return { ok: false, message: `时间范围最长 ${MAX_RANGE_DAYS} 天` };
  }
  return { ok: true, fromUtc, toUtc };
}

/** 账号 UID 只收纯数字；空串 = 不筛。 */
export function parseAccountUid(raw: string): { ok: true; value: number | undefined } | { ok: false } {
  const text = raw.trim();
  if (!text) return { ok: true, value: undefined };
  return /^\d+$/.test(text) ? { ok: true, value: Number(text) } : { ok: false };
}

const cnyCache = new Map<number, Intl.NumberFormat>();

/**
 * 计量金额常在 0.0001 量级：固定 6 位小数满屏都是尾零，固定 2 位又会把小额抹成 0。
 * 这里至少 2 位、最多 maxDigits 位，尾零去掉。
 */
export function formatCny(value: number, maxDigits = 6): string {
  let fmt = cnyCache.get(maxDigits);
  if (!fmt) {
    fmt = new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: 'CNY',
      minimumFractionDigits: Math.min(2, maxDigits),
      maximumFractionDigits: maxDigits,
    });
    cnyCache.set(maxDigits, fmt);
  }
  return fmt.format(value);
}

/** 紧凑 token 数：980 / 12.3K / 1.2M。 */
export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  const unit = n < 1_000_000 ? 'K' : 'M';
  const scaled = n < 1_000_000 ? n / 1000 : n / 1_000_000;
  const rounded = Math.round(scaled * 10) / 10;
  return `${Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)}${unit}`;
}

export function formatDuration(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
}

/** UUID 只露前两段，完整值放 tooltip / 抽屉。 */
export function shortId(id: string | null): string {
  if (!id) return '—';
  const head = /^([0-9a-f]{8}-[0-9a-f]{4})/i.exec(id)?.[1];
  if (head && id.length > head.length) return `${head}…`;
  return id.length > 14 ? `${id.slice(0, 14)}…` : id;
}
