import { describe, expect, it } from 'vitest';

import { parseBillSerials } from '../composables/useBatchReverseBills';

describe('parseBillSerials', () => {
  it('按行切分并标记为待驳回', () => {
    const { rows, duplicateCount } = parseBillSerials(
      'BL20260708000000678\nBL20260708000000679',
    );
    expect(rows).toEqual([
      { billSerialNo: 'BL20260708000000678', status: 'pending' },
      { billSerialNo: 'BL20260708000000679', status: 'pending' },
    ]);
    expect(duplicateCount).toBe(0);
  });

  it('忽略空行与首尾空白，并统一成大写', () => {
    const { rows } = parseBillSerials('  bl20260708000000678  \n\n\t\n');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.billSerialNo).toBe('BL20260708000000678');
  });

  it('从表格 / 聊天记录粘贴时按逗号分号一并切分', () => {
    const { rows } = parseBillSerials('BL20260708000000678, BL20260708000000679；BL20260708000000680');
    expect(rows.map((r) => r.billSerialNo)).toEqual([
      'BL20260708000000678',
      'BL20260708000000679',
      'BL20260708000000680',
    ]);
  });

  it('重复账单号只保留一条并计数', () => {
    const { rows, duplicateCount } = parseBillSerials(
      'BL20260708000000678\nBL20260708000000678\nBL20260708000000678',
    );
    expect(rows).toHaveLength(1);
    expect(duplicateCount).toBe(2);
  });

  it('格式不符的行标记为 invalid，不参与提交', () => {
    const { rows } = parseBillSerials('RC20260708000000678\nBL123\nBL20260708000000678');
    expect(rows.map((r) => r.status)).toEqual(['invalid', 'invalid', 'pending']);
  });

  it('序列溢出导致的超长账单号仍视为合法', () => {
    const { rows } = parseBillSerials('BL202607081000000678');
    expect(rows[0]?.status).toBe('pending');
  });
});
