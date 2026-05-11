import { describe, expect, it } from 'vitest';

import { createUidSeq, isUid, toUid } from '../lib/id';

describe('isUid', () => {
  it('接受合法长 ID 字符串', () => {
    expect(isUid('1000001')).toBe(true);
    expect(isUid('9223372036854775807')).toBe(true);
  });

  it('拒绝非字符串 / 空 / 前导零', () => {
    expect(isUid(1000001)).toBe(false);
    expect(isUid('')).toBe(false);
    expect(isUid('01')).toBe(false);
    expect(isUid('12a')).toBe(false);
  });
});

describe('toUid', () => {
  it('归一 number / bigint → string', () => {
    expect(toUid(42)).toBe('42');
    expect(toUid(42n)).toBe('42');
  });

  it('保留合法字符串', () => {
    expect(toUid('1')).toBe('1');
  });

  it('null/undefined/非法值 → undefined', () => {
    expect(toUid(null)).toBeUndefined();
    expect(toUid(undefined)).toBeUndefined();
    expect(toUid(0)).toBeUndefined();
    expect(toUid(-1)).toBeUndefined();
    expect(toUid(1.5)).toBeUndefined();
  });
});

describe('createUidSeq', () => {
  it('从起点自增并输出 Uid 字符串', () => {
    const next = createUidSeq(1000);
    expect(next()).toBe('1001');
    expect(next()).toBe('1002');
    expect(isUid(next())).toBe(true);
  });
});
