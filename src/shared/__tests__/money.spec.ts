import { describe, expect, it } from 'vitest';

import { BILLING_FRACTION_DIGITS, formatMoney, normalizeMoneyInput } from '../lib/money';

describe('formatMoney', () => {
  it('显示 CNY 与符号', () => {
    expect(formatMoney(1234.5)).toBe('¥1,234.50');
  });

  it('null/undefined 显示占位符', () => {
    expect(formatMoney(null)).toBe('—');
    expect(formatMoney(undefined)).toBe('—');
  });

  it('支持字符串输入（decimal JSON 兼容）', () => {
    expect(formatMoney('12.3')).toBe('¥12.30');
  });

  it('非数字输入返回占位符', () => {
    expect(formatMoney('abc')).toBe('—');
    expect(formatMoney(Number.NaN)).toBe('—');
    expect(formatMoney(Number.POSITIVE_INFINITY)).toBe('—');
  });

  it('支持隐藏符号', () => {
    expect(formatMoney(1234.5, { withSymbol: false })).toBe('1,234.50');
  });

  it('正向流水显示 + 号', () => {
    expect(formatMoney(50, { withSign: true })).toBe('+¥50.00');
    expect(formatMoney(-50, { withSign: true })).toBe('-¥50.00');
    expect(formatMoney(0, { withSign: true })).toBe('¥0.00');
  });

  it('自定义货币与小数位', () => {
    expect(formatMoney(99, { currency: 'USD', fractionDigits: 0 })).toMatch(/US\$99|\$99/);
  });

  it('token 级微扣费保留 6 位小数', () => {
    expect(formatMoney(0.0022038, { fractionDigits: BILLING_FRACTION_DIGITS })).toBe('¥0.002204');
  });
});

describe('normalizeMoneyInput', () => {
  it('保留两位小数', () => {
    expect(normalizeMoneyInput('12.3456')).toBe('12.35');
  });

  it('非数字返回空', () => {
    expect(normalizeMoneyInput('abc')).toBe('');
    expect(normalizeMoneyInput('   ')).toBe('');
  });
});
