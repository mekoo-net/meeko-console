import type { ConsumptionCell, ReportBreakdown, ReportTimeBucket } from '@yomi/common';

export interface ReportTableRow {
  rowKey: string;
  bucketStartUtc: number;
  key: string;
  requestCount: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalCost: number;
}

export function groupLabel(key: string, breakdown: ReportBreakdown): string {
  if (!key || breakdown === 'none') return '合计';
  return key;
}

export function cellsToTableRows(cells: ConsumptionCell[]): ReportTableRow[] {
  return cells
    .map((c) => ({
      rowKey: `${c.bucketStartUtc}\0${c.groupKey}`,
      bucketStartUtc: c.bucketStartUtc,
      key: c.groupKey,
      requestCount: c.requestCount,
      totalPromptTokens: c.totalPromptTokens,
      totalCompletionTokens: c.totalCompletionTokens,
      totalTokens: c.totalPromptTokens + c.totalCompletionTokens,
      totalCost: c.totalCost,
    }))
    .sort((a, b) => b.totalCost - a.totalCost || b.bucketStartUtc - a.bucketStartUtc);
}

export function sumCells(cells: ConsumptionCell[]): {
  calls: number;
  prompt: number;
  completion: number;
  cost: number;
} {
  const acc = { calls: 0, prompt: 0, completion: 0, cost: 0 };
  for (const c of cells) {
    acc.calls += c.requestCount;
    acc.prompt += c.totalPromptTokens;
    acc.completion += c.totalCompletionTokens;
    acc.cost += c.totalCost;
  }
  acc.cost = Math.round(acc.cost * 10000) / 10000;
  return acc;
}

export function isTimedBucket(timeBucket: ReportTimeBucket): boolean {
  return timeBucket === 'hour' || timeBucket === 'day';
}
