import type { AppResult } from '@/shared/api/httpTypes';

import type {
  ReferralSettingsAdmin,
  UpdateReferralSettingsInput,
} from '../../model/settings.types';

export interface ReferralSettingsPort {
  get(): Promise<AppResult<ReferralSettingsAdmin>>;
  update(input: UpdateReferralSettingsInput): Promise<AppResult<ReferralSettingsAdmin>>;
}
