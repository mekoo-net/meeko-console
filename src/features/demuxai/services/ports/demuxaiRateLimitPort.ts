import type { AppResult } from '@/shared/api/httpTypes';

import type { RateLimitSettings, UpdateRateLimitSettingsInput } from '../../model/rateLimit.types';

export interface DemuxaiRateLimitPort {
  get(): Promise<AppResult<RateLimitSettings>>;

  update(input: UpdateRateLimitSettingsInput): Promise<AppResult<RateLimitSettings>>;
}
