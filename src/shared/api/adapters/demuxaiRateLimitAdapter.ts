import {
  rateLimitSettingsSchema,
  type IpRateLimitSettings,
  type RateLimitPolicy,
  type RateLimitSettings,
  type UpdateRateLimitSettingsInput,
  type WindowUnit,
} from '@/features/demuxai/model/rateLimit.types';
import type { DemuxaiRateLimitPort } from '@/features/demuxai/services/ports/demuxaiRateLimitPort';
import { requestDemuxAi } from '@/shared/api/httpClient';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { asEpochMillis } from '@/shared/lib/epoch';

const BASE = '/demux/api/admin/rate/setting';

const UNIT_SECONDS: Record<WindowUnit, number> = { second: 1, minute: 60, hour: 3600 };

function toInt(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && value.trim().length > 0) {
    const n = Number(value);
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return fallback;
}

/** 秒数 → {值, 单位}：能整除则用更大单位，便于回显。 */
function splitWindow(seconds: number): { windowValue: number; windowUnit: WindowUnit } {
  const s = seconds > 0 ? Math.trunc(seconds) : 60;
  if (s % 3600 === 0) return { windowValue: s / 3600, windowUnit: 'hour' };
  if (s % 60 === 0) return { windowValue: s / 60, windowUnit: 'minute' };
  return { windowValue: s, windowUnit: 'second' };
}

function toSeconds(value: number, unit: WindowUnit): number {
  return Math.max(1, Math.trunc(value)) * UNIT_SECONDS[unit];
}

function mapPolicyWire(raw: unknown): RateLimitPolicy {
  const w = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const { windowValue, windowUnit } = splitWindow(toInt(w.windowSeconds ?? w.window_seconds, 60));
  return {
    windowValue,
    windowUnit,
    maxRequests: toInt(w.maxRequests ?? w.max_requests, 0),
    maxSuccesses: toInt(w.maxSuccesses ?? w.max_successes, 0),
    maxConcurrency: toInt(w.maxConcurrency ?? w.max_concurrency, 0),
  };
}

function mapIpWire(raw: unknown): IpRateLimitSettings {
  const w = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const { windowValue, windowUnit } = splitWindow(toInt(w.windowSeconds ?? w.window_seconds, 60));
  const overridesRaw = Array.isArray(w.overrides) ? w.overrides : [];
  return {
    enabled: typeof w.enabled === 'boolean' ? w.enabled : false,
    windowValue,
    windowUnit,
    maxRequests: toInt(w.maxRequests ?? w.max_requests, 0),
    maxConcurrency: toInt(w.maxConcurrency ?? w.max_concurrency, 0),
    overrides: overridesRaw.map((o) => {
      const r = (o && typeof o === 'object' ? o : {}) as Record<string, unknown>;
      const win = splitWindow(toInt(r.windowSeconds ?? r.window_seconds, 60));
      return {
        ip: String(r.ip ?? ''),
        enabled: typeof r.enabled === 'boolean' ? r.enabled : true,
        windowValue: win.windowValue,
        windowUnit: win.windowUnit,
        maxRequests: toInt(r.maxRequests ?? r.max_requests, 0),
        maxConcurrency: toInt(r.maxConcurrency ?? r.max_concurrency, 0),
      };
    }),
  };
}

function mapWire(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const w = raw as Record<string, unknown>;
  const overridesRaw = Array.isArray(w.overrides) ? w.overrides : [];
  return {
    enabled: typeof w.enabled === 'boolean' ? w.enabled : true,
    defaultPolicy: mapPolicyWire(w.defaultPolicy ?? w.default_policy),
    overrides: overridesRaw.map((o) => {
      const r = (o && typeof o === 'object' ? o : {}) as Record<string, unknown>;
      return {
        accountUid: String(r.accountUid ?? r.account_uid ?? ''),
        enabled: typeof r.enabled === 'boolean' ? r.enabled : true,
        policy: mapPolicyWire(r.policy),
      };
    }),
    ip: mapIpWire(w.ip),
    updatedAtUtc: asEpochMillis(w.updatedAtUtc ?? w.updated_at_utc) ?? 0,
  };
}

function policyToWire(p: RateLimitPolicy): Record<string, number> {
  return {
    windowSeconds: toSeconds(p.windowValue, p.windowUnit),
    maxRequests: p.maxRequests,
    maxSuccesses: p.maxSuccesses,
    maxConcurrency: p.maxConcurrency,
  };
}

function parse(value: unknown): AppResult<RateLimitSettings> {
  const r = rateLimitSettingsSchema.safeParse(mapWire(value));
  return r.success ? ok(r.data) : fail({ code: 'validation', message: '速率限制设置格式错误' });
}

export class DemuxaiRateLimitHttpAdapter implements DemuxaiRateLimitPort {
  async get(): Promise<AppResult<RateLimitSettings>> {
    const res = await requestDemuxAi<unknown>(BASE);
    if (!res.success) return res;
    return parse(res.data);
  }

  async update(input: UpdateRateLimitSettingsInput): Promise<AppResult<RateLimitSettings>> {
    const body = {
      enabled: input.enabled,
      defaultPolicy: policyToWire(input.defaultPolicy),
      overrides: input.overrides.map((o) => ({
        accountUid: o.accountUid,
        enabled: o.enabled,
        policy: policyToWire(o.policy),
      })),
      ip: {
        enabled: input.ip.enabled,
        windowSeconds: toSeconds(input.ip.windowValue, input.ip.windowUnit),
        maxRequests: input.ip.maxRequests,
        maxConcurrency: input.ip.maxConcurrency,
        overrides: input.ip.overrides.map((o) => ({
          ip: o.ip,
          enabled: o.enabled,
          windowSeconds: toSeconds(o.windowValue, o.windowUnit),
          maxRequests: o.maxRequests,
          maxConcurrency: o.maxConcurrency,
        })),
      },
    };
    const res = await requestDemuxAi<unknown>(BASE, { method: 'PUT', body });
    if (!res.success) return res;
    return parse(res.data);
  }
}
