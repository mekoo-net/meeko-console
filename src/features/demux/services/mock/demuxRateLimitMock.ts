import type { RateLimitSettings, UpdateRateLimitSettingsInput } from '../../model/rateLimit.types';
import type { DemuxRateLimitPort } from '../ports/demuxRateLimitPort';
import { ok, type AppResult } from '@/shared/api/httpTypes';
import { delay } from '@/shared/lib/delay';

let state: RateLimitSettings = {
  enabled: true,
  defaultPolicy: {
    windowValue: 1,
    windowUnit: 'minute',
    maxRequests: 60,
    maxSuccesses: 0,
    maxConcurrency: 0,
  },
  overrides: [
    {
      accountUid: '100001',
      enabled: true,
      policy: { windowValue: 1, windowUnit: 'minute', maxRequests: 600, maxSuccesses: 300, maxConcurrency: 20 },
    },
    {
      accountUid: '100002',
      enabled: false,
      policy: { windowValue: 10, windowUnit: 'second', maxRequests: 50, maxSuccesses: 0, maxConcurrency: 5 },
    },
  ],
  ip: {
    enabled: false,
    windowValue: 1,
    windowUnit: 'minute',
    maxRequests: 120,
    maxConcurrency: 10,
    overrides: [
      { ip: '203.0.113.7', enabled: true, windowValue: 1, windowUnit: 'minute', maxRequests: 600, maxConcurrency: 30 },
      { ip: '10.0.0.0/8', enabled: false, windowValue: 1, windowUnit: 'minute', maxRequests: 0, maxConcurrency: 0 },
    ],
  },
  updatedAtUtc: Date.now(),
};

function clone(s: RateLimitSettings): RateLimitSettings {
  return {
    ...s,
    defaultPolicy: { ...s.defaultPolicy },
    overrides: s.overrides.map((o) => ({ accountUid: o.accountUid, enabled: o.enabled, policy: { ...o.policy } })),
    ip: { ...s.ip, overrides: s.ip.overrides.map((o) => ({ ...o })) },
  };
}

export class DemuxRateLimitMock implements DemuxRateLimitPort {
  async get(): Promise<AppResult<RateLimitSettings>> {
    await delay();
    return ok(clone(state));
  }

  async update(input: UpdateRateLimitSettingsInput): Promise<AppResult<RateLimitSettings>> {
    await delay();
    state = {
      enabled: input.enabled,
      defaultPolicy: { ...input.defaultPolicy },
      overrides: input.overrides.map((o) => ({ accountUid: o.accountUid, enabled: o.enabled, policy: { ...o.policy } })),
      ip: { ...input.ip, overrides: input.ip.overrides.map((o) => ({ ...o })) },
      updatedAtUtc: Date.now(),
    };
    return ok(clone(state));
  }
}
