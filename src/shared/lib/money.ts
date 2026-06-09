/**
 * 钱包/订单金额格式化。
 *
 * 后端：decimal（C#），Json 序列化默认是 number；**禁止**用 toFixed 直接处理，因为浮点会
 * 丢精度（0.1 + 0.2）。这里用 `Intl.NumberFormat` 走标准 banker rounding。
 *
 * - 钱包余额 / 充值订单：默认 2 位小数（用户可读）。
 * - Token 级扣费明细：与 `Meeko.Billing.Domain.Common.MoneyGuard.Scale` 一致，6 位小数。
 *
 * 货币代码与 Meeko.Contracts.Billing.WalletSnapshot.Currency 一致，默认 CNY。
 */
/** 与 Meeko.Billing MoneyGuard.Scale 一致；token 级微扣费展示精度。 */
export const BILLING_FRACTION_DIGITS = 6;

export interface MoneyOptions {
  currency?: string;
  /** 是否显示符号（¥ 12.34），false 则只显示 "12.34"。 */
  withSymbol?: boolean;
  /** 小数位，默认 2。 */
  fractionDigits?: number;
  /** 显示正号（钱包流水适用），默认 false。 */
  withSign?: boolean;
}

const cache = new Map<string, Intl.NumberFormat>();

function getFormatter(currency: string, fractionDigits: number, withSymbol: boolean): Intl.NumberFormat {
  const cacheKey = `${currency}|${fractionDigits}|${withSymbol ? 1 : 0}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;
  const fmt = new Intl.NumberFormat('zh-CN', {
    style: withSymbol ? 'currency' : 'decimal',
    currency: withSymbol ? currency : undefined,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  cache.set(cacheKey, fmt);
  return fmt;
}

export function formatMoney(value: number | string | null | undefined, opts: MoneyOptions = {}): string {
  const num = toFiniteNumber(value);
  if (num === null) return '—';
  const { currency = 'CNY', withSymbol = true, fractionDigits = 2, withSign = false } = opts;
  const fmt = getFormatter(currency, fractionDigits, withSymbol);
  const body = fmt.format(num);
  if (withSign && num > 0) return `+${body}`;
  return body;
}

/** 表单输入用：把字符串归一为 decimal 兼容字符串（保留 fractionDigits 位）。 */
export function normalizeMoneyInput(raw: string, fractionDigits = 2): string {
  if (raw.trim() === '') return '';
  const num = Number(raw);
  if (!Number.isFinite(num)) return '';
  return num.toFixed(fractionDigits);
}

function toFiniteNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}
