import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { delay } from '@/shared/lib/delay';
import {
  issuedBackendCredentialsSchema,
  type IssueTavernBackendInput,
  type IssuedBackendCredentials,
} from '../../model/backend.types';
import type { TavernBackendPort } from '../ports/tavernBackendPort';

export class TavernBackendMock implements TavernBackendPort {
  async issue(_input: IssueTavernBackendInput): Promise<AppResult<IssuedBackendCredentials>> {
    await delay(120);
    const suffix = Math.random().toString(36).slice(2, 14);
    const payload = {
      clientId: `ta-mock-${suffix}`,
      clientSecret: `cs-mock-${'x'.repeat(40)}`,
    };
    const parsed = issuedBackendCredentialsSchema.safeParse(payload);
    return parsed.success
      ? ok(parsed.data)
      : fail({ code: 'unknown', message: 'Mock 凭据格式错误' });
  }
}
