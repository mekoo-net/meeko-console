import type { AppResult } from '@/shared/api/httpTypes';

import type { AuthSettingsAdmin, UpdateAuthSettingsInput } from '../../model/settings.types';

export interface AuthSettingsPort {
  get(): Promise<AppResult<AuthSettingsAdmin>>;

  update(input: UpdateAuthSettingsInput): Promise<AppResult<AuthSettingsAdmin>>;
}
