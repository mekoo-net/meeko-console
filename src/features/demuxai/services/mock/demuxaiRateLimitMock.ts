import type { RateLimitSettings, UpdateRateLimitSettingsInput } from '../../model/rateLimit.types';
import type { DemuxaiRateLimitPort } from '../ports/demuxaiRateLimitPort';
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
  updatedAtUtc: Date.now(),
};

function clone(s: RateLimitSettings): RateLimitSettings {
  return {
    ...s,
    defaultPolicy: { ...s.defaultPolicy },
    overrides: s.overrides.map((o) => ({ accountUid: o.accountUid, enabled: o.enabled, policy: { ...o.policy } })),
  };
}

export class DemuxaiRateLimitMock implements DemuxaiRateLimitPort {
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
      updatedAtUtc: Date.now(),
    };
    return ok(clone(state));
  }
}
