import type { AppResult } from '@/shared/api/httpTypes';

import type { EmailSettingsAdmin, UpdateEmailSettingsInput } from '../../model/settings.types';

export interface EmailSettingsPort {
  get(): Promise<AppResult<EmailSettingsAdmin>>;

  update(input: UpdateEmailSettingsInput): Promise<AppResult<EmailSettingsAdmin>>;
}
