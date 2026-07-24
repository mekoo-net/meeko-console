import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { delay } from '@/shared/lib/delay';

import {
  issuedBackendCredentialsSchema,
  type IssueBackendInput,
  type IssuedBackendCredentials,
} from '../../model/backend.types';
import type { DemuxBackendPort } from '../ports/demuxBackendPort';

export class DemuxBackendMock implements DemuxBackendPort {
  async issue(input: IssueBackendInput): Promise<AppResult<IssuedBackendCredentials>> {
    await delay(120);
    const name = input.name.trim();
    if (!name) return fail({ code: 'validation', message: 'name is required' });

    const suffix = Math.random().toString(36).slice(2, 14);
    const payload = {
      backendId: String(Date.now()),
      clientId: `cl-mock-${suffix}`,
      clientSecret: `cs-mock-${'x'.repeat(40)}`,
    };
    const parsed = issuedBackendCredentialsSchema.safeParse(payload);
    return parsed.success
      ? ok(parsed.data)
      : fail({ code: 'unknown', message: 'Mock 凭据格式错误' });
  }
}
