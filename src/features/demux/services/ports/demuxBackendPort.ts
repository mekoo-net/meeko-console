import type { AppResult } from '@/shared/api/httpTypes';

import type { IssueBackendInput, IssuedBackendCredentials } from '../../model/backend.types';

export interface DemuxBackendPort {
  issue(input: IssueBackendInput): Promise<AppResult<IssuedBackendCredentials>>;
}
