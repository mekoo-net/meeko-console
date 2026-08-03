import { describe, expect, it } from 'vitest';

import {
  billingTypeText,
  logEntrySchema,
  logErrorCodeText,
  logProtocolText,
} from '@demux/common';

/**
 * 这些用例钉的是「后端真发什么」而不是「前端希望收到什么」——
 * `content.protocol` 曾被绑到 Provider 的 `apiType` 枚举上，
 * 结果整行 parse 失败、详情抽屉的协议一栏渲染成空白。
 */

/** 取自线上 `GET /demux/api/admin/logs` 的一行（已裁剪账户信息）。 */
function wireRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '901234567890123456',
    traceId: '0198f2c4d1b74a0e9f31c2a55d7e8b04',
    createAt: 1754178000000,
    account: { uid: '100000001', iamUid: null },
    token: null,
    modelName: 'demux-gpt-4o',
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

  it('计费类型标签认得 unknown', () => {
    expect(billingTypeText('per_token')).toBe('按量计费');
    expect(billingTypeText('unknown')).toBe('未知计费');
  });
});
