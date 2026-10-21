import { describe, expect, it } from 'vitest';

import type { ConsumptionCell } from '@yomi/common';
import { cellsToTableRows, sumCells } from '../model/consumptionReport';

const cells: ConsumptionCell[] = [
  {
    bucketStartUtc: 0,
    groupKey: 'pool-a',
    requestCount: 2,
    totalPromptTokens: 100,
    totalCompletionTokens: 50,
    totalCost: 3,
  },
  {
    bucketStartUtc: 3_600_000,
    groupKey: 'pool-a',
    requestCount: 1,
    totalPromptTokens: 20,
    totalCompletionTokens: 10,
    totalCost: 0.5,
  },
  {
    bucketStartUtc: 0,
    groupKey: 'pool-b',
    requestCount: 8,
    totalPromptTokens: 1,
    totalCompletionTokens: 1,
    totalCost: 0.01,
  },
];

describe('consumption report table rows', () => {
  it('keeps hourly cells as separate rows sorted by cost', () => {
    const rows = cellsToTableRows(cells);
    expect(rows).toHaveLength(3);
    expect(rows[0]?.key).toBe('pool-a');
    expect(rows[0]?.bucketStartUtc).toBe(0);
    expect(rows[0]?.totalCost).toBe(3);
  });

  it('sums all cells', () => {
    const totals = sumCells(cells);
    expect(totals.calls).toBe(11);
    expect(totals.cost).toBe(3.51);
  });
});
