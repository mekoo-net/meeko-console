import type { AppResult } from '@/shared/api/httpTypes';

import type { IssueTavernBackendInput, IssuedBackendCredentials } from '../../model/backend.types';

export interface TavernBackendPort {
  issue(input: IssueTavernBackendInput): Promise<AppResult<IssuedBackendCredentials>>;
}
