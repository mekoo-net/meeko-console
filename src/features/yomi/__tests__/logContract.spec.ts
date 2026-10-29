import { describe, expect, it } from 'vitest';

import {
  billingTypeText,
  logEntrySchema,
  logErrorCodeText,
  logHasErrorCode,
  logProtocolText,
  logStopReasonTruncated,
} from '@yomi/common';

import { creditDetailRows, creditDetailSummary, formatCredits } from '../model/creditUsage';

/**
 * 这些用例钉的是「后端真发什么」而不是「前端希望收到什么」——
 * `content.protocol` 曾被绑到 Provider 的 `apiType` 枚举上，
 * 结果整行 parse 失败、详情抽屉的协议一栏渲染成空白。
 */

/** 取自线上 `GET /yomi/api/admin/logs` 的一行（已裁剪账户信息）。 */
function wireRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '901234567890123456',
    traceId: '0198f2c4d1b74a0e9f31c2a55d7e8b04',
    createAt: 1754178000000,
    account: { uid: '100000001', iamUid: null },
    token: null,
    modelName: 'yomi-gpt-4o',
    vendorKey: 'openai',
    vendorPlug: 'rong',
    vendorModel: 'gpt-4o-2024-11-20',
    status: 'failure',
    content: {
      protocol: 'openai_chat',
      statusCode: 500,
      streamed: true,
      convId: null,
      latencyMs: 52462,
      clientIp: '165.154.149.148',
      error: { code: '500', message: 'Upstream HTTP 500' },
    },
    billingType: 'per_token',
    usage: {
      totalTokens: 0,
      input: { tokens: 0, cachedReadTokens: 0, cachedWriteTokens: 0, audioTokens: 0 },
      output: { tokens: 0, reasoningTokens: 0, audioTokens: 0 },
    },
    cost: {
      input: {
        perMToken: 25,
        amount: 0,
        cachedRead: { perMToken: 12.5, amount: 0 },
        cachedWrite: { perMToken: 31.25, amount: 0 },
        audio: { perMToken: 0, amount: 0 },
      },
      output: {
        perMToken: 75,
        amount: 0,
        reasoning: { perMToken: 0, amount: 0 },
        audio: { perMToken: 0, amount: 0 },
      },
      total: 0,
    },
    bill: null,
    ...overrides,
  };
}

describe('logEntrySchema 对齐后端 wire 形状', () => {
  it('解析带 openai_chat 协议的失败行', () => {
    const parsed = logEntrySchema.safeParse(wireRow());
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.content.protocol).toBe('openai_chat');
      expect(parsed.data.vendorPlug).toBe('rong');
    }
  });

  it.each([
    'openai_chat',
    'openai_responses',
    'anthropic_messages',
    'gemini_generate_content',
    // 迁移前落库的协议族写法，老日志行仍在库里
    'openai',
  ])('接受协议取值 %s', (protocol) => {
    const row = wireRow();
    (row.content as Record<string, unknown>).protocol = protocol;
    expect(logEntrySchema.safeParse(row).success).toBe(true);
  });

  it('接受定价快照缺失时的 unknown 计费类型', () => {
    const parsed = logEntrySchema.safeParse(wireRow({ billingType: 'unknown' }));
    expect(parsed.success).toBe(true);
  });

  it('终止原因按调用方协议原文带在 content 里', () => {
    const row = wireRow({ vendorKey: 'kiro', status: 'success' });
    Object.assign(row.content as Record<string, unknown>, {
      statusCode: 200,
      error: null,
      stopReason: 'MAX_TOKENS',
    });
    const parsed = logEntrySchema.safeParse(row);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.content.stopReason).toBe('MAX_TOKENS');
    }
  });

  it('改版前的行没有终止原因，照样解析', () => {
    const parsed = logEntrySchema.safeParse(wireRow());
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.content.stopReason).toBeUndefined();
  });

  it('解析 per_credit 行：积分是小数，原始用量按 detailKind 嵌在 detail 里', () => {
    const parsed = logEntrySchema.safeParse(
      wireRow({
        status: 'success',
        content: { protocol: 'openai_images', statusCode: 200, streamed: false, latencyMs: 8123 },
        billingType: 'per_credit',
        usage: {
          credits: 0.028,
          detailKind: 'image',
          detail: { tier: { size: '832x1216', quality: 'standard' }, count: 1 },
        },
        cost: { pricePerCredit: 0.01, total: 0.00028 },
      }),
    );
    expect(parsed.success).toBe(true);
    if (!parsed.success || parsed.data.billingType !== 'per_credit') return;
    expect(parsed.data.usage.credits).toBe(0.028);
    expect(parsed.data.cost.pricePerCredit).toBe(0.01);
    expect(parsed.data.usage.detailKind).toBe('image');
    if (parsed.data.usage.detailKind === 'image') {
      expect(parsed.data.usage.detail?.count).toBe(1);
      expect(parsed.data.usage.detail?.tier.size).toBe('832x1216');
    }

    expect(creditDetailRows(parsed.data.usage)).toEqual([
      { label: '张数', value: '1' },
      { label: '尺寸', value: '832x1216', mono: true },
      { label: '画质', value: 'standard' },
    ]);
    expect(creditDetailSummary(parsed.data.usage)).toBe('1 张 · 832x1216 · standard');
  });

  it('per_credit 的 token 明细只列非零维度；没有明细时不捏造', () => {
    const parsed = logEntrySchema.safeParse(
      wireRow({
        status: 'success',
        billingType: 'per_credit',
        usage: {
          credits: 1.5,
          detailKind: 'token',
          detail: {
            totalTokens: 1300,
            input: { tokens: 1000, cachedReadTokens: 200, cachedWriteTokens: 0, audioTokens: 0 },
            output: { tokens: 300, reasoningTokens: 0, audioTokens: 0 },
          },
        },
        cost: { pricePerCredit: 0.2, total: 0.3 },
      }),
    );
    expect(parsed.success).toBe(true);
    if (!parsed.success || parsed.data.billingType !== 'per_credit') return;
    expect(creditDetailRows(parsed.data.usage).map((r) => r.label)).toEqual(['输入', '缓存读', '输出']);
    expect(creditDetailSummary(parsed.data.usage)).toBe('入 1,000 · 出 300');

    const bare = logEntrySchema.safeParse(
      wireRow({
        billingType: 'per_credit',
        usage: { credits: 0, detailKind: 'none' },
        cost: { pricePerCredit: 0.2, total: 0 },
      }),
    );
    expect(bare.success).toBe(true);
    if (!bare.success || bare.data.billingType !== 'per_credit') return;
    expect(creditDetailRows(bare.data.usage)).toEqual([]);
    expect(creditDetailSummary(bare.data.usage)).toBe('');
  });

  it('per_credit 拒绝负积分与缺单价', () => {
    const row = (usage: unknown, cost: unknown) =>
      logEntrySchema.safeParse(wireRow({ billingType: 'per_credit', usage, cost })).success;
    expect(row({ credits: -1, detailKind: 'none' }, { pricePerCredit: 0.01, total: 0 })).toBe(false);
    expect(row({ credits: 1, detailKind: 'none' }, { total: 0.01 })).toBe(false);
  });

  it('接受账单驳回原因码为枚举外的开放取值', () => {
    const parsed = logEntrySchema.safeParse(
      wireRow({
        bill: {
          id: 'BL20260531000008821',
          status: 'reversed',
          reversal: { atUtc: 1754181600000, by: null, code: 'ops_manual', remark: null },
        },
      }),
    );
    expect(parsed.success).toBe(true);
  });
});

describe('展示层兜底', () => {
  it('协议标签覆盖后端实际取值，未登记值原样透出', () => {
    expect(logProtocolText('openai_chat')).toBe('OpenAI Chat Completions');
    expect(logProtocolText('anthropic_messages')).toBe('Anthropic Messages');
    expect(logProtocolText('brand_new_protocol')).toBe('brand_new_protocol');
    expect(logProtocolText(null)).toBe('—');
  });

  it('错误码把后端拿 HTTP 状态顶上的纯数字串渲染成 HTTP xxx', () => {
    expect(logErrorCodeText('500')).toBe('HTTP 500');
    expect(logErrorCodeText('zero_output')).toBe('无计费产出');
    expect(logErrorCodeText('billing_commit_failed')).toBe('结算未完成');
    expect(logErrorCodeText('some_vendor_code')).toBe('some_vendor_code');
  });

  it('没有真实错误码时不当错误展示', () => {
    expect(logHasErrorCode(null)).toBe(false);
    expect(logHasErrorCode({ code: '' })).toBe(false);
    expect(logHasErrorCode({ code: 'upstream_error' })).toBe(false);
    expect(logHasErrorCode({ code: 'upstream_error', message: 'Service unavailable' })).toBe(true);
    expect(logHasErrorCode({ code: '503' })).toBe(true);
  });

  it('计费类型标签认得 unknown', () => {
    expect(billingTypeText('per_token')).toBe('按量计费');
    expect(billingTypeText('per_credit')).toBe('积分计费');
    expect(billingTypeText('unknown')).toBe('未知计费');
  });

  it('积分按原值显示小数，不取整也不补零', () => {
    expect(formatCredits(0.028)).toBe('0.028');
    expect(formatCredits(20)).toBe('20');
    expect(formatCredits(12345.5)).toBe('12,345.5');
    expect(formatCredits(undefined)).toBe('—');
  });

  it('截断类终止原因四家拼法都认，别的不算', () => {
    for (const reason of ['length', 'max_tokens', 'MAX_TOKENS', 'max_output_tokens']) {
      expect(logStopReasonTruncated(reason)).toBe(true);
    }
    for (const reason of ['stop', 'end_turn', 'STOP', 'tool_calls', 'SAFETY', 'completed', '', null, undefined]) {
      expect(logStopReasonTruncated(reason)).toBe(false);
    }
  });
});
