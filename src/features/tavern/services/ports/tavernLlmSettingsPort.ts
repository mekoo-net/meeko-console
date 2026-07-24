import type { AppResult } from '@/shared/api/httpTypes';

import type {
  LlmPlatformSettingsAdmin,
  UpdateLlmPlatformSettingsInput,
} from '../../model/llmSettings.types';

export interface TavernLlmSettingsPort {
  get(): Promise<AppResult<LlmPlatformSettingsAdmin>>;
  update(input: UpdateLlmPlatformSettingsInput): Promise<AppResult<LlmPlatformSettingsAdmin>>;
}
