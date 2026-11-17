import type { IssuedBackendCredentials } from '@/features/platform/gateway/model/backend.types';
import { ok, type AppResult } from '@/shared/api/httpTypes';
import { delay } from '@/shared/lib/delay';

import type { JastalkBackendPort } from '../ports/jastalkBackendPort';

export class JastalkBackendMock implements JastalkBackendPort {
  async issue(): Promise<AppResult<IssuedBackendCredentials>> {
    await delay(120);
    const suffix = Math.random().toString(36).slice(2, 14);
    return ok({ clientId: `jt-mock-${suffix}`, clientSecret: `cs-mock-${'x'.repeat(40)}` });
  }
}
