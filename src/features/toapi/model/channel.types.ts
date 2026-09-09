/**
 * ToApi 反代的供应商目录（渠道）。
 *
 * 供应商 = 一个协议来源（Cursor、Kiro…），vendor_key 与 ToApi/Web `ideCatalog` 的 id 对齐。
 * 一个供应商只落成一个分组，分组 key = vendor_key，令牌绑定分组计费。
 * 这里只放展示信息（协议 / 计量 / 参考价）；能不能服务、有哪些模型以网关发现为准。
 */

export const channelBillingKindValues = ['usd', 'credits', 'quota', 'tokens'] as const;
export type ChannelBillingKind = (typeof channelBillingKindValues)[number];

export const ChannelBillingKindLabel: Record<ChannelBillingKind, string> = {
  usd: '按美元折算',
  credits: '按积分',
  quota: '按额度',
  tokens: '按 Token',
};

export interface ChannelDef {
  /** = vendor_key */
  id: string;
  name: string;
  protocol: string;
  billingKind: ChannelBillingKind;
  priceHint: string;
  /** 客户端可直连原生协议 */
  native: boolean;
  /** 支持跨协议转换（如 OpenAI 客户端打 Anthropic 供应商） */
  convert: boolean;
}

export const toapiChannels: readonly ChannelDef[] = [
  { id: 'cursor', name: 'Cursor', protocol: 'Cursor Native', billingKind: 'usd', priceHint: '¥0.72 / $1', native: true, convert: true },
  { id: 'kiro', name: 'Kiro', protocol: 'Kiro · Anthropic', billingKind: 'credits', priceHint: '¥0.008 / cr', native: true, convert: true },
  { id: 'antigravity', name: 'Antigravity', protocol: 'Gemini Native', billingKind: 'quota', priceHint: '¥0.045 / u', native: true, convert: true },
  { id: 'claude-code', name: 'Claude Code', protocol: 'Anthropic Messages', billingKind: 'tokens', priceHint: '¥12 / MTok', native: true, convert: true },
  { id: 'codex', name: 'Codex', protocol: 'OpenAI Responses', billingKind: 'usd', priceHint: '¥0.68 / $1', native: true, convert: true },
];

const byId = new Map(toapiChannels.map((c) => [c.id, c]));

/** vendor_key 与目录一对一；认不出来就是目录外的供应商。 */
export function resolveChannel(vendorKey: string): ChannelDef | null {
  return byId.get(vendorKey.trim().toLowerCase()) ?? null;
}
