import { logIsSuccess } from '@yomi/common';
import { ok, type AppResult } from '@/shared/api/httpTypes';
import { delay } from '@/shared/lib/delay';

import type { ToApiBillingType } from '../../model/pricing.types';
import type { ListUsageLogsFilter, UsageLog, UsageLogStats } from '../../model/usage.types';
import type { ListUsageLogsPage, ToApiUsagePort } from '../ports/toapiUsagePort';

/** 与定价 mock 里的分组 / 模型对齐。 */
const catalog: ReadonlyArray<{ vendorKey: string; model: string; kind: ToApiBillingType; inPrice: number; outPrice: number }> = [
  { vendorKey: 'kiro', model: 'claude-sonnet-4', kind: 'per_token', inPrice: 21, outPrice: 105 },
  { vendorKey: 'kiro', model: 'claude-opus-4', kind: 'per_token', inPrice: 105, outPrice: 525 },
  { vendorKey: 'cursor', model: 'gpt-5', kind: 'per_token', inPrice: 9, outPrice: 70 },
  { vendorKey: 'cursor', model: 'gpt-image-1', kind: 'per_image', inPrice: 0.3, outPrice: 0 },
  { vendorKey: 'cursor', model: 'sora-2', kind: 'per_video', inPrice: 0.7, outPrice: 0 },
];

const accounts = [
  { uid: '10001', email: 'alice@example.com', phone: '138****0001' },
  { uid: '10042', email: 'bob@example.com', phone: '139****0042' },
  { uid: '10077', email: 'carol@example.com', phone: null },
];

const tokens: ReadonlyArray<NonNullable<UsageLog['token']>> = [
  { id: '501', name: 'ci-bot', kind: 'token' },
  { id: '502', name: 'prod-key', kind: 'token' },
  { id: '901', name: 'Cursor · MacBook Pro', kind: 'access' },
  { id: '902', name: 'Kiro · Win11', kind: 'access' },
];

let seed = 20260909;
function rnd(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rnd() * arr.length)]!;
}
function int(min: number, max: number): number {
  return Math.floor(min + rnd() * (max - min + 1));
}
function hex(n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += Math.floor(rnd() * 16).toString(16);
  return s;
}

const zeroTokenUsage = () => ({
  totalTokens: 0,
  input: { tokens: 0, cachedReadTokens: 0, cachedWriteTokens: 0, audioTokens: 0 },
  output: { tokens: 0, reasoningTokens: 0, audioTokens: 0 },
});

function buildRows(): UsageLog[] {
  const now = Date.now();
  const rows: UsageLog[] = [];
  let id = 7_000_000_000_000_000;
  for (let i = 0; i < 360; i++) {
    const c = pick(catalog);
    const acc = pick(accounts);
    const createAt = now - int(0, 6 * 24 * 60) * 60_000 - int(0, 59_000);
    const roll = rnd();
    const status: UsageLog['status'] = roll < 0.86 ? 'success' : roll < 0.95 ? 'failure' : roll < 0.98 ? 'cancelled' : 'pending';
    const streamed = rnd() < 0.7;
    const estimated = Number((rnd() * 0.5 + 0.05).toFixed(6));
    const errorCode =
      status === 'failure' ? pick(['upstream_5xx', 'upstream_timeout', 'rate_limited', 'zero_output'])
        : status === 'cancelled' ? 'expired'
          : null;

    const base = {
      id: String(id++),
      traceId: hex(32),
      createAt,
      account: { uid: acc.uid, email: acc.email, phone: acc.phone },
      token: pick(tokens),
      vendorKey: c.vendorKey,
      modelName: c.model,
      status,
      content: {
        protocol: c.vendorKey === 'kiro' ? 'anthropic_messages' : 'openai_chat',
        statusCode: status === 'pending' ? null : errorCode ? pick([429, 500, 502, 504]) : 200,
        streamed,
        latencyMs: status === 'pending' ? null : int(120, 4_800),
        clientIp: `10.${int(0, 255)}.${int(0, 255)}.${int(1, 254)}`,
        error: errorCode ? { code: errorCode, message: `${errorCode}: upstream returned an error` } : null,
      },
    };

    if (status !== 'success') {
      rows.push({ ...base, billingType: 'unknown', usage: zeroTokenUsage(), cost: { estimated, total: 0 } });
      continue;
    }

    if (c.kind === 'per_token') {
      const inTok = int(300, 24_000);
      const outTok = int(50, 6_000);
      const total = Number(((inTok / 1e6) * c.inPrice + (outTok / 1e6) * c.outPrice).toFixed(6));
      rows.push({
        ...base,
        billingType: 'per_token',
        usage: {
          totalTokens: inTok + outTok,
          input: { tokens: inTok, cachedReadTokens: rnd() < 0.5 ? int(0, inTok) : 0, cachedWriteTokens: rnd() < 0.2 ? int(0, 2_000) : 0, audioTokens: 0 },
          output: { tokens: outTok, reasoningTokens: c.model.includes('opus') || c.model.includes('gpt-5') ? int(0, outTok) : 0, audioTokens: 0 },
        },
        cost: { estimated, total },
      });
    } else if (c.kind === 'per_image') {
      const count = int(1, 4);
      rows.push({
        ...base,
        billingType: 'per_image',
        usage: { count, tier: { size: '1024x1024', quality: rnd() < 0.5 ? 'high' : 'low' } },
        cost: { estimated, total: Number((count * c.inPrice).toFixed(6)) },
      });
    } else {
      const seconds = int(4, 20);
      rows.push({
        ...base,
        billingType: 'per_video',
        usage: { seconds, tier: { resolution: '1080p' } },
        cost: { estimated, total: Number((seconds * c.inPrice).toFixed(6)) },
      });
    }
  }
  return rows.sort((a, b) => b.createAt - a.createAt);
}

const rows = buildRows();

function applyFilter(f: ListUsageLogsFilter): UsageLog[] {
  const trace = f.traceId?.trim();
  const kwModel = f.modelName?.trim().toLowerCase();
  const contact = f.contactKeyword?.trim().toLowerCase();
  return rows.filter((r) => {
    if (trace) return r.traceId === trace;
    if (f.fromUtc != null && r.createAt < f.fromUtc) return false;
    if (f.toUtc != null && r.createAt > f.toUtc) return false;
    if (f.accountUid?.trim() && r.account.uid !== f.accountUid.trim()) return false;
    if (contact && !(r.account.email?.toLowerCase().includes(contact) || r.account.phone?.includes(contact))) return false;
    if (f.vendorKey?.trim() && r.vendorKey !== f.vendorKey.trim()) return false;
    if (kwModel && !r.modelName.toLowerCase().includes(kwModel)) return false;
    if (f.status && f.status !== 'all' && r.status !== f.status) return false;
    if (f.tokenKind && f.tokenKind !== 'all' && r.token?.kind !== f.tokenKind) return false;
    return true;
  });
}

export class ToApiUsageMock implements ToApiUsagePort {
  async list(input: { page: number; pageSize: number; filter: ListUsageLogsFilter }): Promise<AppResult<ListUsageLogsPage>> {
    await delay(160);
    const list = applyFilter(input.filter);
    const start = (input.page - 1) * input.pageSize;
    return ok({ items: list.slice(start, start + input.pageSize), total: list.length });
  }

  async stats(filter: ListUsageLogsFilter): Promise<AppResult<UsageLogStats>> {
    await delay(120);
    const list = applyFilter(filter);
    const succeeded = list.filter(logIsSuccess);
    const latencies = succeeded.map((r) => r.content.latencyMs).filter((v): v is number => v != null);
    return ok({
      totalCalls: list.length,
      successCalls: succeeded.length,
      errorCalls: list.length - succeeded.length,
      totalTokens: succeeded.reduce((s, r) => s + (r.billingType === 'per_token' ? r.usage.totalTokens : 0), 0),
      totalCost: Number(succeeded.reduce((s, r) => s + r.cost.total, 0).toFixed(6)),
      avgTokenLatency: latencies.length ? Math.round(latencies.reduce((s, v) => s + v, 0) / latencies.length) : 0,
    });
  }
}
