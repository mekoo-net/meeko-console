import { describe, expect, it } from 'vitest';

import { refundPayoutOf } from '../model/billing.types';

describe('refundPayoutOf', () => {
  it('实退 = 扣减 × (1 − 折损比例)', () => {
    expect(refundPayoutOf(100, 10)).toBe(90);
    expect(refundPayoutOf(60, 0)).toBe(60);
  });

  it('按分向下取整，与后端 BalanceRefund.PayoutOf 一致', () => {
    expect(refundPayoutOf(33.33, 15)).toBe(28.33);
    expect(refundPayoutOf(0.01, 50)).toBe(0);
    expect(refundPayoutOf(19.99, 12.5)).toBe(17.49);
  });
});
