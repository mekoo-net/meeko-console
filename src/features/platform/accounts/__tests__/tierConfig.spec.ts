import { describe, expect, it } from 'vitest';

import { computeTier, tierProgress, TIER_THRESHOLDS } from '../model/tierConfig';

describe('computeTier', () => {
  it('累计 0 返回 Lv1', () => {
    expect(computeTier(0)).toBe(1);
  });

  it('刚好达到阈值即升级', () => {
    expect(computeTier(100)).toBe(2);
    expect(computeTier(500)).toBe(3);
    expect(computeTier(2000)).toBe(4);
    expect(computeTier(10000)).toBe(5);
  });

  it('阈值之间保持下一级', () => {
    expect(computeTier(99)).toBe(1);
    expect(computeTier(101)).toBe(2);
    expect(computeTier(1999)).toBe(3);
    expect(computeTier(9999)).toBe(4);
  });

  it('超过最高等级仍返回最高 level', () => {
    const maxLevel = TIER_THRESHOLDS[TIER_THRESHOLDS.length - 1]!.level;
    expect(computeTier(99_999_999)).toBe(maxLevel);
  });
});

describe('tierProgress', () => {
  it('Lv1 起点，next 指向 Lv2，percent 为 0', () => {
    const p = tierProgress(0);
    expect(p.current.level).toBe(1);
    expect(p.next?.level).toBe(2);
    expect(p.percent).toBe(0);
    expect(p.remainingToNext).toBe(100);
  });

  it('当前等级区间中点 percent 约 50', () => {
    // Lv2 阈值 100，Lv3 阈值 500，区间 400，中点 300 → 50%
    const p = tierProgress(300);
    expect(p.current.level).toBe(2);
    expect(p.next?.level).toBe(3);
    expect(p.percent).toBe(50);
    expect(p.remainingToNext).toBe(200);
  });

  it('达到最高等级 next 为 null，percent 为 100', () => {
    const max = TIER_THRESHOLDS[TIER_THRESHOLDS.length - 1]!;
    const p = tierProgress(max.threshold + 5000);
    expect(p.current.level).toBe(max.level);
    expect(p.next).toBeNull();
    expect(p.percent).toBe(100);
    expect(p.remainingToNext).toBe(0);
  });
});
