import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fail, ok } from '@/shared/api/httpTypes';
import * as http from '@/features/tavern/api/http';

import { TavernBillingHttpAdapter } from '../api/adapters/tavernBillingAdapter';
import { TavernCallLogHttpAdapter } from '../api/adapters/tavernCallLogAdapter';
import { TavernPricingHttpAdapter } from '../api/adapters/tavernPricingAdapter';

// 只替换传输，parseTavern 用真的：解析正是要测的东西。
vi.mock('@/features/tavern/api/http', async (importOriginal) => ({
  ...(await importOriginal<typeof http>()),
  requestTavern: vi.fn(),
}));

const request = vi.mocked(http.requestTavern);

/**
 * 这些用例钉的是「后端真发什么」：PlatformJsonOptions 下的 camelCase、snake_case 枚举、epoch 毫秒。
 * 契约漂移要在适配层变成一次明确的校验失败，而不是让页面读到 undefined。
 */

/** 取自 `CallLogDto` 的一行。 */
function wireCall(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '0199a3c4-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
    traceId: 'd270f7a19db0fc8aa173ad1896b150fb',
    accountUid: 100002333,
    pipeline: { id: 'dialogue', label: '角色对话' },
    vendorKey: 'kiro',
    modelName: 'claude-opus-5.5',
    status: 'success',
    content: {
      worldId: '7c1e0d52-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
      sessionId: '23c97d30-c8a6-4920-bd78-4c244bac6328',
      proactive: false,
      latencyMs: 1200,
      durationMs: 7200,
      toolCalls: 1,
      stopReason: 'tool_use',
      error: null,
    },
    usage: {
      totalTokens: 14_597,
      input: { tokens: 13_862, cachedReadTokens: 0, cachedWriteTokens: 0, audioTokens: 0 },
      output: { tokens: 735, reasoningTokens: 0, audioTokens: 0, imageTokens: 0 },
    },
    cost: { multiplier: 1, baseline: 0.000002, billableQuantity: 16_067, amount: 0.032134 },
    bill: {
      usageLogId: 52300626,
      status: 'charged',
      amount: 0.06145,
      billSerialNo: 'TVB20261031300626',
      reversible: true,
      reversal: null,
      calls: 2,
    },
    createdAt: 1761877649000,
    ...overrides,
  };
}

describe('tavern metering adapters', () => {
  beforeEach(() => {
    request.mockReset();
  });

  it('pages call logs the Yomi way and sends billed=false instead of dropping it', async () => {
    request.mockResolvedValueOnce(ok({ items: [wireCall()], total: 77, page: 2, pageSize: 20 }));
    const r = await new TavernCallLogHttpAdapter().list({
      fromUtc: 1,
      toUtc: 2,
      billed: false,
      model: 'opus',
      page: 2,
      pageSize: 20,
    });
    expect(request).toHaveBeenCalledWith('/tavern/api/admin/calls', {
      query: expect.objectContaining({ p: 2, pageSize: 20, fromUtc: 1, toUtc: 2, billed: false, model: 'opus' }),
    });
    if (!r.success) throw new Error(r.error.message);
    expect(r.data.total).toBe(77);
    expect(r.data.items[0]).toMatchObject({
      pipeline: { id: 'dialogue', label: '角色对话' },
      content: { latencyMs: 1200, error: null },
      bill: { usageLogId: 52300626, status: 'charged' },
    });
  });

  it('keeps a failed, unbilled call with an error that has no code', async () => {
    request.mockResolvedValueOnce(
      ok({
        items: [
          wireCall({
            status: 'failure',
            bill: null,
            content: { ...(wireCall().content as object), latencyMs: null, error: { code: null, message: 'stream interrupted' } },
          }),
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      }),
    );
    const r = await new TavernCallLogHttpAdapter().list({ fromUtc: 1, toUtc: 2, page: 1, pageSize: 20 });
    if (!r.success) throw new Error(r.error.message);
    expect(r.data.items[0]?.bill).toBeNull();
    expect(r.data.items[0]?.content.error).toEqual({ code: null, message: 'stream interrupted' });
  });

  it('turns contract drift into a validation failure instead of half-parsed rows', async () => {
    // 改名前的形状：flat 字段、ok / error 状态。
    request.mockResolvedValueOnce(ok({ items: [{ ...wireCall(), status: 'ok' }], total: 1, page: 1, pageSize: 20 }));
    const r = await new TavernCallLogHttpAdapter().list({ fromUtc: 1, toUtc: 2, page: 1, pageSize: 20 });
    expect(r.success).toBe(false);
    expect(!r.success && r.error.code).toBe('validation');
  });

  it('reads the bill hung on a call: reversed carries its reversal, others do not', async () => {
    const reversal = { atUtc: 1761880000000, by: 900000001, code: 'metering_error', remark: '工单 #1' };
    const reversedBill = { ...(wireCall().bill as object), status: 'reversed', reversible: false, reversal };
    request.mockResolvedValueOnce(ok({ items: [wireCall({ bill: reversedBill })], total: 1, page: 1, pageSize: 20 }));
    const r = await new TavernCallLogHttpAdapter().list({ fromUtc: 1, toUtc: 2, traceId: 'd270f7a1', page: 1, pageSize: 20 });
    expect(request).toHaveBeenCalledWith('/tavern/api/admin/calls', {
      query: expect.objectContaining({ traceId: 'd270f7a1' }),
    });
    if (!r.success) throw new Error(r.error.message);
    const bill = r.data.items[0]?.bill;
    expect(bill?.status === 'reversed' && bill.reversal.code).toBe('metering_error');
    expect(bill?.calls).toBe(2);
  });

  it('rejects a reversed bill that lacks its reversal record', async () => {
    const bill = { ...(wireCall().bill as object), status: 'reversed', reversible: false };
    request.mockResolvedValueOnce(ok({ items: [wireCall({ bill })], total: 1, page: 1, pageSize: 20 }));
    const r = await new TavernCallLogHttpAdapter().list({ fromUtc: 1, toUtc: 2, page: 1, pageSize: 20 });
    expect(!r.success && r.error.code).toBe('validation');
  });

  it('reverses a batch and reads one outcome per turn', async () => {
    const reversal = { atUtc: 1761880000000, by: 900000001, code: 'metering_error', remark: null };
    request.mockResolvedValueOnce(
      ok([
        { outcome: 'reversed', id: 52300626, reversal },
        { outcome: 'rejected', id: 52300627, reason: '已经驳回过了。' },
      ]),
    );
    const r = await new TavernBillingHttpAdapter().reverse({ ids: [52300626, 52300627], reasonCode: 'metering_error' });
    expect(request).toHaveBeenCalledWith('/tavern/api/admin/billing/reverse', {
      method: 'POST',
      body: { ids: [52300626, 52300627], reasonCode: 'metering_error' },
    });
    if (!r.success) throw new Error(r.error.message);
    const [done, rejected] = r.data;
    expect(done?.outcome === 'reversed' && done.reversal.code).toBe('metering_error');
    expect(rejected?.outcome === 'rejected' && rejected.reason).toBe('已经驳回过了。');
  });

  it('passes transport failures through untouched', async () => {
    const failure = fail({ code: 'unknown', message: '时间范围最长 31 天。' });
    request.mockResolvedValueOnce(failure);
    expect(await new TavernCallLogHttpAdapter().list({ fromUtc: 1, toUtc: 2, page: 1, pageSize: 20 })).toBe(failure);
  });

  it('round-trips pricing as { rules, version }', async () => {
    const rules = {
      baselines: [
        { unit: 'token', price: 0.000002 },
        { unit: 'image', price: 0.05 },
        { unit: 'audio_second', price: 0.002 },
        { unit: 'video_second', price: 0.08 },
      ],
      modelMultipliers: [{ modelName: 'claude-opus-5.5', multiplier: 2 }],
      defaultModelMultiplier: 1,
      completionWeight: 3,
      proactiveRateMultiplier: 1,
    } as const;
    const models = [{ modelName: 'claude-opus-5.5', vendors: ['factory', 'kiro'], inCatalog: true, calls30d: 595 }];
    request.mockResolvedValueOnce(ok({ rules, version: 8, updatedAt: 1761877649000, models }));

    const input = { rules: { ...rules, baselines: [...rules.baselines], modelMultipliers: [...rules.modelMultipliers] }, version: 7 };
    const r = await new TavernPricingHttpAdapter().update(input);
    expect(request).toHaveBeenCalledWith('/tavern/api/admin/settings/metering', { method: 'PUT', body: input });
    if (!r.success) throw new Error(r.error.message);
    expect(r.data.version).toBe(8);
    expect(r.data.models[0]?.vendors).toEqual(['factory', 'kiro']);
  });
});
